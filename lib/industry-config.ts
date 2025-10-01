import type { ScenarioPreset } from '@/lib/scenarios';
import type { ToolDefinition } from '@/lib/tools';
import pharmacyConfig from '../configs/pharmacy';
// Server-side (Node) persistence of generated configs so they survive process reloads.
// Lightweight JSON file per config under configs/generated.
import fs from 'fs';
import path from 'path';

export interface IndustryConfig {
  id: string;
  name: string;
  description: string;
  prompt: string;
  tools: ToolDefinition<any, any>[];
  scenarios: ScenarioPreset[];
  defaultScenarioId: string;
  parseScenario?: (scenario: string) => any;
}

const registry: Record<string, IndustryConfig> = {};
registry[pharmacyConfig.id] = pharmacyConfig;

const GENERATED_DIR = path.join(process.cwd(), 'configs', 'generated');

function safeLoadGeneratedConfigs() {
  if (typeof window !== 'undefined') return; // client skip
  try {
    if (!fs.existsSync(GENERATED_DIR)) return;
    const files = fs.readdirSync(GENERATED_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(GENERATED_DIR, f), 'utf8');
        const obj = JSON.parse(raw);
        if (obj && obj.id && obj.name && Array.isArray(obj.tools) && Array.isArray(obj.scenarios)) {
          // Do not overwrite existing same id (pharmacy) unless different; prefer disk copy for generated domains only
          if (!registry[obj.id]) registry[obj.id] = obj as IndustryConfig;
        }
      } catch {}
    }
  } catch {}
}

safeLoadGeneratedConfigs();

let activeConfigId: string = pharmacyConfig.id;
const ACTIVE_FILE = path.join(GENERATED_DIR, '__active.json');
try {
  if (fs.existsSync(ACTIVE_FILE)) {
    const stored = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
    if (stored && typeof stored.id === 'string' && registry[stored.id]) {
      activeConfigId = stored.id;
    }
  }
} catch {}

export function listConfigs(): IndustryConfig[] { return Object.values(registry); }
export function getConfig(id: string): IndustryConfig | undefined { return registry[id]; }
export function getActiveConfig(): IndustryConfig { return registry[activeConfigId]; }
export function setActiveConfig(id: string): IndustryConfig { if (!registry[id]) throw new Error('config_not_found'); activeConfigId = id; try { if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR,{recursive:true}); fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ id }, null, 2), 'utf8'); } catch {} return registry[id]; }
export function addConfig(cfg: IndustryConfig, makeActive=false) {
  registry[cfg.id] = cfg;
  if (makeActive) {
    activeConfigId = cfg.id;
    // Persist the active selection to disk
    if (typeof window === 'undefined') {
      try {
        if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
        fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ id: cfg.id }, null, 2), 'utf8');
        console.log('[industry-config] Active config set to:', cfg.id);
      } catch (e) {
        console.error('[industry-config] active_persist_failed', e);
      }
    }
  }
  // Persist only on server, skip pharmacy baseline
  if (typeof window === 'undefined' && cfg.id !== pharmacyConfig.id) {
    try {
      if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
      const filePath = path.join(GENERATED_DIR, cfg.id + '.json');
      fs.writeFileSync(filePath, JSON.stringify(cfg, null, 2), 'utf8');
    } catch (e) {
      console.error('[industry-config] persist_failed', e);
    }
  }
}

export function validateConfigShape(obj: any): asserts obj is IndustryConfig {
  const fail = (m:string)=> { throw new Error('invalid_config:' + m); };
  if (!obj || typeof obj !== 'object') fail('not_object');
  for (const k of ['id','name','description','prompt','tools','scenarios','defaultScenarioId']) if (!(k in obj)) fail('missing_' + k);
  if (!Array.isArray(obj.tools) || obj.tools.length === 0) fail('tools_empty');
  if (!Array.isArray(obj.scenarios) || obj.scenarios.length === 0) fail('scenarios_empty');
  if (!obj.scenarios.some((s:any)=> s.id === obj.defaultScenarioId)) fail('bad_defaultScenarioId');
  for (const t of obj.tools) { if (!t.name || !t.description || !t.argSchema || !t.resultSchema) fail('tool_fields'); }
}

export function buildToolSpecs(cfg: IndustryConfig) {
  return cfg.tools.map(t => ({ type:'function', name:t.name, description:t.description, parameters:t.argSchema, result_schema:(t as any).resultSchema, sample_result:(t as any).sampleResult }));
}
