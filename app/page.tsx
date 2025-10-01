"use client";
import { useState } from 'react';
import RealtimeStage from '@/components/realtime-stage';
import ConfigManager from '@/components/config-manager';

export default function Home() {
  const [tab, setTab] = useState<'config' | 'stage'>('config');
  const tabs: { id:'config'|'stage'; label:string; }[] = [
    { id:'config', label:'Industry Config' },
    { id:'stage', label:'Voice Stage' }
  ];
  return (
    <main className="relative flex flex-col items-stretch justify-start p-4 gap-6 max-w-7xl w-full mx-auto">
      <div className="border-b border-neutral-800 pb-0">
        <div role="tablist" aria-label="Sections" className="flex gap-2">
          {tabs.map(t => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={()=> setTab(t.id)}
                className={`text-xs tracking-wide uppercase px-3 py-2 rounded-t-md border transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500 ${active ? 'bg-neutral-900 text-cyan-300 border-neutral-700 border-b-neutral-900' : 'bg-neutral-800/40 text-neutral-400 border-transparent hover:text-neutral-200'}`}
              >{t.label}</button>
            );
          })}
        </div>
      </div>
      <div className="w-full -mt-px border border-neutral-800 rounded-md bg-neutral-950/50 p-4">
        {tab === 'config' && (
          <div role="tabpanel" aria-label="Industry Config" className="animate-fade-in">
            <ConfigManager />
          </div>
        )}
        {tab === 'stage' && (
          <div role="tabpanel" aria-label="Voice Stage" className="animate-fade-in">
            <RealtimeStage />
          </div>
        )}
      </div>
    </main>
  );
}
