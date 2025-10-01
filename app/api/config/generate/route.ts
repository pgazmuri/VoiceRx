import { NextRequest } from 'next/server';
import { addConfig, validateConfigShape, listConfigs, getActiveConfig } from '@/lib/industry-config';
import fs from 'fs/promises';

async function readKey() { return (await fs.readFile(process.cwd()+'/.key','utf8')).trim(); }

export async function POST(req: NextRequest) {
  try {
    const { description, id: forcedId, name: forcedName, activate } = await req.json();
    if (!description) return new Response(JSON.stringify({ error:'missing_description'}), { status:400 });
    const key = await readKey();
  const example = getActiveConfig();
  // limit tools defined to first 3 tools to reduce token use
  example.tools = example.tools.slice(0,3);
  const path = require('path');
  const GENERATED_DIR = path.join(process.cwd(), 'generated_configs');

  // Provide only ONE scenario as the pattern example to reduce token use and avoid overfitting domain specifics
  const singleScenarioExample = { ...example, scenarios: example.scenarios.slice(0,1), defaultScenarioId: example.scenarios[0]?.id };
  const exampleJson = JSON.stringify(singleScenarioExample);
    const system = `You are an expert multi-industry AI agent solution architect. Task: generate a NEW industry domain configuration in strict JSON.
Interface (all keys required): {
  id: string; name: string; description: string; prompt: string; tools: Tool[]; scenarios: Scenario[]; defaultScenarioId: string;
}
Tool: { name:string; description:string; argSchema:any; resultSchema:any; sampleResult?:any }
Scenario: { id:string; name:string; text:string }
Constraints:
- 3-6 tools. Each tool's argSchema/resultSchema must be coherent, minimal, and JSON-Schema like (object with properties + required[] where applicable).
- Provide realistic sampleResult for EACH tool.
- 2-4 scenarios; each < 1200 characters; distinct operational nuances.
- Scenarios must include relevant return values and parameter values so that tools can mock the scenario consistently between calls. Include SKUs, Part numbers, product names, prices, dates, locations (storeID, zip code), quantities, customer types, etc. as relevant to the domain and scenario.
- Scenarios are not provided to the model at runtime; they are used to mock tool responses only, and so must be consistent with tool definitions. Do not provide agent instructions or input examples in scenarios.
- prompt: concise behavioral guardrails for THIS domain (no pharmacy wording unless domain truly is pharmacy). Include style guidance & safety boundaries.
- defaultScenarioId must match one of scenarios.
Return ONLY JSON. No markdown.`;
  const user = `New domain description: ${description}\nReference CONFIG PATTERN (single-scenario sample) below. Synthesize 2-4 NEW scenarios (do NOT reuse the example).\nExample JSON:\n${exampleJson}\nReturn ONLY the new full config JSON.`;
    const requestPayload = { model:'gpt-5-mini', reasoning:{ effort:'low' }, input:[{ role:'system', content: system }, { role:'user', content: user }] };
    console.log('[config.generate] Sending generation request', { description, forcedId: !!forcedId, forcedName: !!forcedName });
    const resp = await fetch('https://api.openai.com/v1/responses', { method:'POST', headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json' }, body: JSON.stringify(requestPayload) });
    const json = await resp.json();
    // Prefer the 'message' item within output array, concatenating any text chunks
    let messageText = '';
    try {
      const messageItem = Array.isArray(json.output) ? json.output.find((o:any)=> o.type === 'message') : null;
      if (messageItem && Array.isArray(messageItem.content)) {
        for (const c of messageItem.content) {
          if (c && (c.type === 'output_text' || c.type === 'text') && typeof c.text === 'string') messageText += c.text;
        }
      }
    } catch { /* ignore */ }
    // Fallbacks: output_text shortcut or legacy fields
    if (!messageText && typeof json.output_text === 'string') messageText = json.output_text;
    // Ultimate fallback: stringify whole envelope (will trigger validation failure & show debug)
    if (!messageText) messageText = JSON.stringify(json);
    const raw = messageText.trim();
    console.log('[config.generate] Extracted message text (first 5000 chars):', raw.slice(0,5000));
    // If the model accidentally wrapped JSON with commentary (shouldn't, but guard): extract first top-level JSON object
    let jsonCandidate = raw;
    if (!raw.startsWith('{')) {
      const firstBrace = raw.indexOf('{'); const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonCandidate = raw.slice(firstBrace, lastBrace+1);
        console.log('[config.generate] Trimmed surrounding text around JSON object.');
      }
    }
    let parsed:any; try { parsed = JSON.parse(jsonCandidate); } catch (err) {
      console.error('[config.generate] JSON parse failed', err);
      return new Response(JSON.stringify({ error:'parse_failed', raw: raw.slice(0,8000) }), { status:500 });
    }
    // If we accidentally parsed the entire response envelope (object === 'response'), try to drill into message text again
    if (parsed && parsed.object === 'response' && Array.isArray(parsed.output)) {
      const innerMessage = parsed.output.find((o:any)=> o.type==='message');
      if (innerMessage?.content) {
        let innerText = '';
        for (const c of innerMessage.content) if ((c.type==='output_text'||c.type==='text') && typeof c.text==='string') innerText += c.text;
        innerText = innerText.trim();
        if (innerText.startsWith('{')) {
          try {
            const innerParsed = JSON.parse(innerText);
            console.log('[config.generate] Drilled into envelope to get inner JSON.');
            parsed = innerParsed;
          } catch {/* ignore */}
        }
      }
    }
    // Fallback: sometimes models wrap inside { config: { ... } } or { configuration: { ... } }
    if (!('id' in parsed) && typeof parsed.config === 'object') { console.log('[config.generate] Adopting nested parsed.config object'); parsed = parsed.config; }
    if (!('id' in parsed) && typeof parsed.configuration === 'object') { console.log('[config.generate] Adopting nested parsed.configuration object'); parsed = parsed.configuration; }
    // Log keys before overrides
    console.log('[config.generate] Parsed top-level keys:', Object.keys(parsed));
    if (forcedId) { parsed.id = forcedId; console.log('[config.generate] Overriding id with forcedId', forcedId); }
    if (forcedName) { parsed.name = forcedName; console.log('[config.generate] Overriding name with forcedName', forcedName); }
    try {
      validateConfigShape(parsed);
    } catch (e:any) {
      console.error('[config.generate] Validation failed', e?.message, { parsedKeys: Object.keys(parsed), name: parsed?.name, id: parsed?.id });
      return new Response(JSON.stringify({ error: e.message || 'invalid_config', debug: { keys: Object.keys(parsed), hasName: 'name' in parsed, name: parsed?.name } }), { status:500 });
    }
    addConfig(parsed, !!activate);
    console.log('[config.generate] Config added successfully', { id: parsed.id, name: parsed.name, toolCount: parsed.tools?.length, scenarioCount: parsed.scenarios?.length });
    return new Response(JSON.stringify({ generated: parsed, activated: !!activate }), { status:200, headers:{ 'content-type':'application/json' } });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e.message || 'unknown_error' }), { status:500 });
  }
}
