"use client";
import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { DEFAULT_SCENARIO } from '@/lib/defaultScenario';

export interface AppSettings {
  scenario: string;
  temperature: number;
  voice: string;
}

interface SettingsContextValue extends AppSettings {
  update(partial: Partial<AppSettings>): void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>({ scenario: DEFAULT_SCENARIO, temperature: 0.6, voice: 'alloy' });

  useEffect(() => { // hydrate scenario from server if exists and non-empty
    fetch('/api/tool')
      .then(r=> r.json())
      .then(d=> {
        if (d.scenario && typeof d.scenario === 'string' && d.scenario.trim().length > 0) {
          setSettings(s=> ({...s, scenario: d.scenario}));
        }
      })
      .catch(()=>{});
  }, []);

  const value: SettingsContextValue = {
    ...settings,
    update(partial) { setSettings(s => ({ ...s, ...partial })); }
  };
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
