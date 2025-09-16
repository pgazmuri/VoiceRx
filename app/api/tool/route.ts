import { NextRequest } from 'next/server';
import { getTool, parseScenario } from '@/lib/tools';
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
    const t = getTool(tool);
    if (!t) return new Response(JSON.stringify({ error: 'tool_not_found' }), { status: 404 });
    const scenarioHash = hashArgs({ scenarioMemory });
    if (tool === 'noop') {
      const result = { ok: true };
      await cacheSet(tool, args||{}, scenarioHash, { result });
      return new Response(JSON.stringify({ tool, result, cached: false }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const cached = await cacheGet(tool, args||{}, scenarioHash);
    if (cached) {
      return new Response(JSON.stringify({ tool, result: cached.result, cached: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    let result: any;
    // LLM powered mock via Responses API
    try {
      const apiKey = await readKey();
      const system = `You are a PBM / pharmacy benefit tool simulator. Scenario context: \n${scenarioMemory}\nReturn ONLY strict JSON matching the provided result schema.`;
      const toolMeta = t;
      const prompt = `Tool: ${toolMeta.name}\nDescription: ${toolMeta.description}\nArgs JSON: ${JSON.stringify(args)}\nResult Schema JSON: ${JSON.stringify(toolMeta.resultSchema)}\nSample Result (example): ${JSON.stringify(toolMeta.sampleResult || {})}\nReturn ONLY JSON.`;
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
    const meta = parseScenario(scenarioMemory);
    return new Response(JSON.stringify({ tool, result, scenario_meta: meta, cached: false }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), { status: 500 });
  }
}

export async function GET() {
  return new Response(JSON.stringify({ scenario: scenarioMemory && scenarioMemory.trim().length ? scenarioMemory : DEFAULT_SCENARIO }), { status: 200, headers: { 'content-type': 'application/json' } });
}
