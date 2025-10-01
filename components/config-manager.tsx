"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui';

interface ConfigSummary { id:string; name:string; description:string }
interface ToolSpec { name:string; description:string; argSchema:any; resultSchema:any; sampleResult?:any }
interface ActiveConfig extends ConfigSummary { prompt:string; scenarios:any[]; tools?:ToolSpec[]; defaultScenarioId?:string }

export default function ConfigManager() {
  const router = useRouter();
  const [configs, setConfigs] = useState<ConfigSummary[]>([]);
  const [active, setActive] = useState<ActiveConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [genDescription, setGenDescription] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [previewJson, setPreviewJson] = useState<string>('');
  const [showRaw, setShowRaw] = useState<boolean>(false);
  const [refineOpen, setRefineOpen] = useState<boolean>(false);
  const [refineText, setRefineText] = useState<string>('');
  const [refineBusy, setRefineBusy] = useState<boolean>(false);
  const [refineError, setRefineError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/config').then(r=> r.json());
      setConfigs(r.configs||[]);
  setActive(r.active||null);
  setPreviewJson(r.active ? JSON.stringify(r.active, null, 2) : '');
    } catch (e:any) {
      console.warn(e);
    } finally { setLoading(false); }
  };

  useEffect(()=> { load(); }, []);

  const activate = async (id:string) => {
    setLoading(true);
    await fetch('/api/config', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id }) });
    await load();
    try { window.dispatchEvent(new Event('industry-config-changed')); } catch {}
    console.log('[config-manager] Config activated:', id);
  };

  const generate = async () => {
    if (!genDescription.trim()) return;
    setGenBusy(true); setGenError(null);
    try {
      const r = await fetch('/api/config/generate', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ description: genDescription, activate: true }) });
      const j = await r.json();
      if (!r.ok) { setGenError(j.error||'generation_failed'); }
      else {
        setGenDescription('');
        await load();
        setPreviewJson(JSON.stringify(j.generated, null, 2));
        try { window.dispatchEvent(new Event('industry-config-changed')); } catch {}
        console.log('[config-manager] New config generated and activated:', j.generated?.id, j.generated?.name);
      }
    } catch (e:any) { setGenError(String(e)); } finally { setGenBusy(false); }
  };

  const refine = async () => {
    if (!refineText.trim() || !active) return;
    setRefineBusy(true); setRefineError(null);
    try {
      const r = await fetch('/api/config/refine', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: active.id, instructions: refineText, activate: true }) });
      const j = await r.json();
      if (!r.ok) {
        setRefineError(j.error || 'refine_failed');
      } else {
        setRefineText('');
        setRefineOpen(false);
        await load();
        try { window.dispatchEvent(new Event('industry-config-changed')); } catch {}
        console.log('[config-manager] Config refined:', active.id);
      }
    } catch (e:any) {
      setRefineError(String(e));
    } finally { setRefineBusy(false); }
  };

  const activeTools = (()=> {
    if (!active) return [] as ToolSpec[];
    // Try to parse from previewJson if tools missing
    if (active.tools && Array.isArray(active.tools)) return active.tools as ToolSpec[];
    try { const parsed = JSON.parse(previewJson); if (Array.isArray(parsed.tools)) return parsed.tools; } catch {}
    return [] as ToolSpec[];
  })();

  const activeScenarios = active?.scenarios || [];

  return (
    <div className="w-full border border-neutral-800 rounded-lg p-4 bg-neutral-950/60 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-300 uppercase">Industry Config</h2>
        {loading && <div className="flex items-center gap-2 text-[10px] text-cyan-300 animate-pulse">Loading...</div>}
      </div>
  <div className="flex flex-col xl:flex-row gap-6">
        <div className="flex-1 min-w-[260px] space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Active</label>
            <div className="text-xs text-neutral-200 font-mono break-all">{active? `${active.name} (${active.id})`:'—'}</div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Switch Config</label>
            <div className="flex flex-col gap-2 max-h-48 overflow-auto pr-1">
              {configs.map(c => (
                <button key={c.id} disabled={loading || c.id===active?.id} onClick={()=> activate(c.id)} className={`text-left text-[11px] px-2 py-1 rounded border transition-colors ${c.id===active?.id? 'bg-cyan-600/20 border-cyan-400/50 text-cyan-200':'bg-neutral-800/60 border-neutral-700 hover:bg-neutral-700/60 text-neutral-300'}`}>{c.name}</button>
              ))}
            </div>
          </div>
          <div className="pt-2 border-t border-neutral-800">
            <label className="block text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Generate New</label>
            <textarea value={genDescription} onChange={e=> setGenDescription(e.target.value)} placeholder="Describe a new industry domain (e.g., Travel concierge for flights & hotels)" className="w-full text-xs rounded-md bg-neutral-800/70 border border-neutral-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 p-2 h-24 resize-none" />
            {genError && <div className="text-[10px] text-red-400 mt-1">{genError}</div>}
            <div className="flex items-center gap-2 mt-2">
              <Button size="sm" disabled={genBusy || !genDescription.trim()} onClick={generate}>{genBusy? 'Generating...' : 'Generate & Activate'}</Button>
              {genBusy && <div className="text-[10px] text-cyan-300 animate-pulse">Please wait (LLM)...</div>}
            </div>
          </div>
        </div>
        <div className="flex-[1.4] min-w-[420px] flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <label className="text-[11px] uppercase tracking-wide text-neutral-500">Visualization</label>
            <div className="flex items-center gap-2">
              <button disabled={loading} onClick={load} className="text-[10px] text-cyan-400 hover:text-cyan-200">Refresh</button>
              <button onClick={()=> setShowRaw(r => !r)} className="text-[10px] text-neutral-400 hover:text-neutral-200">{showRaw? 'Hide Raw' : 'Show Raw JSON'}</button>
              <button onClick={()=> setRefineOpen(o=> !o)} className="text-[10px] text-cyan-500 hover:text-cyan-300">{refineOpen? 'Cancel Refine':'Refine Config'}</button>
            </div>
          </div>
          {refineOpen && (
            <div className="border border-neutral-800 rounded-md p-3 bg-neutral-900/60 flex flex-col gap-2">
              <label className="text-[10px] uppercase tracking-wide text-neutral-400">Refinement Instructions</label>
              <textarea value={refineText} onChange={e=> setRefineText(e.target.value)} placeholder="e.g., Add a tool to estimate shipping cost; shorten the prompt; merge scenario 2 & 3"
                className="w-full text-[11px] rounded-md bg-neutral-800/70 border border-neutral-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 p-2 h-28 resize-none" />
              {refineError && <div className="text-[10px] text-red-400">{refineError}</div>}
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={refineBusy || !refineText.trim()} onClick={refine}>{refineBusy? 'Refining...' : 'Apply Refinement'}</Button>
                {refineBusy && <div className="text-[10px] text-cyan-300 animate-pulse">LLM updating...</div>}
              </div>
            </div>
          )}
          {!active && <div className="text-[11px] text-neutral-500">No active config.</div>}
          {active && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="border border-neutral-800 rounded-md p-3 bg-neutral-900/50">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">Prompt</div>
                  <pre className="text-[11px] whitespace-pre-wrap leading-relaxed max-h-64 overflow-auto text-neutral-200">{active.prompt}</pre>
                </div>
                <div className="border border-neutral-800 rounded-md p-3 bg-neutral-900/50">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[10px] uppercase tracking-wide text-neutral-400">Scenarios ({activeScenarios.length})</div>
                    {active.defaultScenarioId && <div className="text-[10px] text-cyan-400">Default: {active.defaultScenarioId}</div>}
                  </div>
                  <div className="flex flex-col gap-2 max-h-64 overflow-auto pr-1">
                    {activeScenarios.map((s:any,i:number)=>(
                      <div key={s.id||i} className="text-[11px] p-2 rounded bg-neutral-800/50 border border-neutral-700/60 hover:border-cyan-600/40 transition-colors">
                        <div className="font-semibold text-neutral-200 mb-1 flex items-center gap-2"><span className="text-cyan-400">{s.id||`scenario_${i}`}</span><span className="text-neutral-400">{s.name}</span></div>
                        <div className="text-neutral-300 whitespace-pre-wrap leading-snug">{s.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="border border-neutral-800 rounded-md p-3 bg-neutral-900/50">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">Tools ({activeTools.length})</div>
                  <div className="flex flex-col gap-2 max-h-80 overflow-auto pr-1">
                    {activeTools.map((t: ToolSpec, i: number)=>(
                      <div key={t.name||i} className="p-2 rounded bg-neutral-800/50 border border-neutral-700/50 hover:border-cyan-600/40 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-semibold text-[11px] text-cyan-300">{t.name}</div>
                          <div className="text-[10px] text-neutral-500">{Object.keys((t.argSchema?.properties)||{}).length} args</div>
                        </div>
                        <div className="text-[11px] text-neutral-300 mb-1 leading-snug">{t.description}</div>
                        <details className="group">
                          <summary className="cursor-pointer text-[10px] text-neutral-400 group-open:text-cyan-400">Schemas & Sample</summary>
                          <div className="mt-1 space-y-1">
                            <pre className="text-[10px] bg-neutral-900/70 p-2 rounded overflow-auto max-h-40 whitespace-pre text-neutral-200">argSchema: {JSON.stringify(t.argSchema, null, 2)}</pre>
                            <pre className="text-[10px] bg-neutral-900/70 p-2 rounded overflow-auto max-h-40 whitespace-pre text-neutral-200">resultSchema: {JSON.stringify(t.resultSchema, null, 2)}</pre>
                            {t.sampleResult && <pre className="text-[10px] bg-neutral-900/70 p-2 rounded overflow-auto max-h-40 whitespace-pre text-neutral-200">sampleResult: {JSON.stringify(t.sampleResult, null, 2)}</pre>}
                          </div>
                        </details>
                      </div>
                    ))}
                    {!activeTools.length && <div className="text-[10px] text-neutral-500">No tools present.</div>}
                  </div>
                </div>
                {showRaw && (
                  <div className="border border-neutral-800 rounded-md p-3 bg-neutral-900/60 relative">
                    <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">Raw JSON</div>
                    <pre className="text-[10px] max-h-80 overflow-auto whitespace-pre-wrap leading-relaxed text-neutral-300 font-mono">{previewJson}</pre>
                  </div>
                )}
              </div>
            </div>
          )}
          {(loading || genBusy || refineBusy) && <div className="absolute inset-0 pointer-events-none" />}
        </div>
      </div>
    </div>
  );
}
