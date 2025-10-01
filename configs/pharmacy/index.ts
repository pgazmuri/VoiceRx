import { REALTIME_PROMPT } from '@/lib/realtime-prompt';
import { SCENARIO_PRESETS } from '@/lib/scenarios';
import { tools, parseScenario } from '@/lib/tools';
import type { IndustryConfig } from '@/lib/industry-config';

const pharmacyConfig: IndustryConfig = {
  id: 'pharmacy',
  name: 'Pharmacy / PBM',
  description: 'Medication, benefits, pricing, and clinical support domain.',
  prompt: REALTIME_PROMPT,
  tools,
  scenarios: SCENARIO_PRESETS,
  defaultScenarioId: SCENARIO_PRESETS[0].id,
  parseScenario
};

export default pharmacyConfig;
