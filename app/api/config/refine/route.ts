import { NextRequest } from 'next/server';
import { getActiveConfig, getConfig, addConfig, validateConfigShape, setActiveConfig } from '@/lib/industry-config';
import fs from 'fs/promises';

async function readKey() { return (await fs.readFile(process.cwd()+'/.key','utf8')).trim(); }

export async function POST(req: NextRequest) {
  try {
    const { id, instructions, activate } = await req.json();
    if (!instructions || !instructions.trim()) {
      return new Response(JSON.stringify({ error:'missing_instructions'}), { status:400 });
    }
    const base = id ? getConfig(id) : getActiveConfig();
    if (!base) return new Response(JSON.stringify({ error:'config_not_found'}), { status:404 });
    const key = await readKey();

    const system = `You are an expert multi-industry configuration refiner. You are given a CURRENT config JSON and REFINEMENT instructions. Produce a FULL UPDATED CONFIG JSON (not a diff) that:
- Preserves any fields not explicitly changed.
- Maintains the same id unless instructions explicitly request a rename (still keep id stable unless rename is clearly requested).
- Keeps all required fields: id,name,description,prompt,tools,scenarios,defaultScenarioId.
- Each tool: name, description, argSchema, resultSchema, sampleResult.
- 2-6 scenarios total. If removing scenarios, ensure defaultScenarioId remains valid (update if necessary).
Return ONLY valid JSON. NO commentary.`;

    const user = `CURRENT CONFIG JSON:\n${JSON.stringify(base)}\n---\nREFINEMENT INSTRUCTIONS:\n${instructions}\n---\nReturn the COMPLETE updated config JSON now.`;

    const resp = await fetch('https://api.openai.com/v1/responses', { method:'POST', headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json' }, body: JSON.stringify({ model:'gpt-5', reasoning:{ effort:'low' }, input:[{ role:'system', content: system }, { role:'user', content: user }] }) });
    const json = await resp.json();

    // Extract message text similar to generate route
    let messageText = '';
    try { const msg = Array.isArray(json.output)? json.output.find((o:any)=> o.type==='message'):null; if (msg?.content) { for (const c of msg.content) if ((c.type==='output_text'||c.type==='text') && typeof c.text==='string') messageText+=c.text; } } catch {}
    if (!messageText && typeof json.output_text==='string') messageText = json.output_text;
    if (!messageText) messageText = JSON.stringify(json);
    let candidate = messageText.trim();
    if (!candidate.startsWith('{')) { const fb=candidate.indexOf('{'); const lb=candidate.lastIndexOf('}'); if (fb!==-1&&lb!==-1&&lb>fb) candidate=candidate.slice(fb,lb+1); }
    let parsed:any; try { parsed = JSON.parse(candidate); } catch { return new Response(JSON.stringify({ error:'parse_failed', raw: candidate.slice(0,6000) }), { status:500 }); }
    if (parsed && parsed.object==='response' && Array.isArray(parsed.output)) { // envelope fallback
      try { const innerMsg = parsed.output.find((o:any)=> o.type==='message'); if (innerMsg?.content){ let inner=''; for (const c of innerMsg.content) if ((c.type==='output_text'||c.type==='text')&& typeof c.text==='string') inner+=c.text; if (inner.startsWith('{')) parsed = JSON.parse(inner); } } catch {}
    }
    // Force original id if LLM changed it unintentionally
    if (parsed.id !== base.id) parsed.id = base.id;
    try { validateConfigShape(parsed); } catch (e:any) { return new Response(JSON.stringify({ error:e.message||'invalid_config', raw: candidate.slice(0,6000) }), { status:500 }); }
    const wasActive = getActiveConfig().id === base.id;
    addConfig(parsed, activate || wasActive);

    return new Response(JSON.stringify({ updated: parsed, activated: activate || wasActive }), { status:200, headers:{ 'content-type':'application/json' } });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e.message || 'unknown_error' }), { status:500 });
  }
}
