"use client";
import { useState, useMemo } from 'react';
import { Button } from './ui';
import { Settings } from 'lucide-react';
import { useSettings } from './settings-context';
import { SCENARIO_PRESETS, DEFAULT_SCENARIO } from '@/lib/scenarios';
// defaultScenario retained if needed elsewhere
const defaultScenario = DEFAULT_SCENARIO;

export default function SettingsSheet() {
  const [open, setOpen] = useState(false);
  const { scenario, temperature, voice, update } = useSettings();

  // Use centralized preset definitions so UI/server share identical data
  const presetScenarios = useMemo(() => SCENARIO_PRESETS, []); // centralized source

  const handlePresetSelect = (id: string) => {
    const preset = presetScenarios.find(p => p.id === id);
    if (preset) update({ scenario: preset.text });
  };

  const persistScenario = async (scenario: string) => {
    try { await fetch('/api/tool', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario, tool: 'noop', args: {} }) }); } catch {}
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="Settings">
        <Settings className="w-4 h-4" />
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-lg bg-neutral-900 border border-neutral-700 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Session Settings</h2>
              <button onClick={() => setOpen(false)} className="text-sm opacity-70 hover:opacity-100">Close</button>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Scenario Preset</label>
                <select
                  className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  onChange={(e)=> handlePresetSelect(e.target.value)}
                  defaultValue="default"
                >
                  {presetScenarios.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  <option value="custom">Custom</option>
                </select>
              </div>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Scenario / Context
                <textarea
                  className="min-h-[160px] rounded-md border border-neutral-700 bg-neutral-800 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  value={scenario}
                  onChange={(e) => update({ scenario: e.target.value })}
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <label className="flex flex-col gap-1 text-sm font-medium">Temperature
                <input type="range" min={0} max={1} step={0.05} value={temperature} onChange={(e)=> update({ temperature: parseFloat(e.target.value) })} />
                <span className="text-xs tabular-nums">{temperature.toFixed(2)}</span>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium col-span-2">Voice
                <input type="text" value={voice} onChange={(e)=> update({ voice: e.target.value })} className="rounded-md border border-neutral-700 bg-neutral-800 p-2 text-sm" />
              </label>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => { persistScenario(scenario); setOpen(false); }}>Done</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
