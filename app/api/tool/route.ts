import { NextRequest } from 'next/server';
// Use active industry config for tool definitions instead of static pharmacy tools
import { getActiveConfig } from '@/lib/industry-config';
import { parseScenario as legacyParseScenario } from '@/lib/tools';
import fs from 'fs/promises';
import path from 'path';
import { DEFAULT_SCENARIO } from '@/lib/defaultScenario';

const CACHE_DIR = path.join(process.cwd(), '.tool_cache');

async function ensureCacheDir() {
  try { await fs.mkdir(CACHE_DIR, { recursive: true }); } catch {}
}

async function readKey(): Promise<string> {
  const k = (await fs.readFile(path.join(process.cwd(), '.key'), 'utf8')).trim();
  return k;
}

async function cacheGet(tool: string, args: any, scenarioHash: string) {
  await ensureCacheDir();
  const file = path.join(CACHE_DIR, `${tool}_${scenarioHash}_${hashArgs(args)}.json`);
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

async function cacheSet(tool: string, args: any, scenarioHash: string, value: any) {
  await ensureCacheDir();
  const file = path.join(CACHE_DIR, `${tool}_${scenarioHash}_${hashArgs(args)}.json`);
  await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

function hashArgs(obj: any) {
  const json = JSON.stringify(obj, Object.keys(obj).sort());
  let h = 0; for (let i=0;i<json.length;i++) { h = Math.imul(31,h) + json.charCodeAt(i) | 0; } return Math.abs(h).toString(36);
}

let scenarioMemory = DEFAULT_SCENARIO; // initialize with real default instead of generic placeholder

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.scenario) scenarioMemory = body.scenario;
  const { tool, args } = body;
  const active = getActiveConfig();
  const t = active.tools.find(x => x.name === tool);
  if (!t) {
    try { console.warn('[tool_not_found]', { requested: tool, activeConfig: active.id, available: active.tools.map(x=>x.name) }); } catch {}
    return new Response(JSON.stringify({ error: 'tool_not_found', tool, activeConfig: active.id }), { status: 404 });
  }
  const scenarioHash = hashArgs({ scenarioMemory, config: active.id });
    if (tool === 'noop') {
      // Diagnostic logging: noop should generally not be invoked by the model anymore (removed from exposed specs)
      try {
        console.log('[tool.noop_invoked]', {
          activeConfig: active.id,
          args,
          scenarioSnippet: (scenarioMemory||'').slice(0,140),
          hint: 'If this appears frequently, verify /api/tool-specs excludes noop and realtime stage received updated specs.'
        });
      } catch {}
      const result = { ok: true };
      await cacheSet(tool, args||{}, scenarioHash, { result });
      return new Response(JSON.stringify({ tool, result, cached: false, diagnostic:true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const cached = await cacheGet(tool, args||{}, scenarioHash);
    if (cached) {
      return new Response(JSON.stringify({ tool, result: cached.result, cached: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    let result: any;
    // LLM powered mock via Responses API
    try {
      const apiKey = await readKey();
      const toolMeta = t as any;
      const system = `You are a tool result simulator for the domain: ${active.name} (id: ${active.id}).\nDomain description: ${active.description}.\nScenario context:\n${scenarioMemory}\nProduce ONLY strict JSON adhering to the provided result schema. No extra keys. If uncertain, provide realistic but clearly simulated values.`;
      const prompt = `Tool: ${toolMeta.name}\nDescription: ${toolMeta.description}\nArgs JSON: ${JSON.stringify(args || {})}\nResult Schema JSON: ${JSON.stringify(toolMeta.resultSchema)}\nSample Result (example): ${JSON.stringify(toolMeta.sampleResult || {})}\nReturn ONLY JSON.`;
      const resp = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4.1-nano', input: [{ role:'system', content: system }, { role:'user', content: prompt }] })
      });
      const json = await resp.json();
      const text = json.output?.[0]?.content?.[0]?.text || json.output_text || JSON.stringify(json);
      // Attempt parse
      try { result = JSON.parse(text); } catch { result = { parsing_error: true, raw: text }; }
    } catch (llmErr:any) {
      result = { error: 'llm_failed', detail: String(llmErr) };
    }

    await cacheSet(tool, args||{}, scenarioHash, { result });
    const meta = (active.parseScenario ? active.parseScenario(scenarioMemory) : legacyParseScenario(scenarioMemory));
    return new Response(JSON.stringify({ tool, result, scenario_meta: meta, cached: false, config: active.id }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), { status: 500 });
  }
}

export async function GET() {
  return new Response(JSON.stringify({ scenario: scenarioMemory && scenarioMemory.trim().length ? scenarioMemory : DEFAULT_SCENARIO }), { status: 200, headers: { 'content-type': 'application/json' } });
}
