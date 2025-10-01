import { getActiveConfig, buildToolSpecs } from '@/lib/industry-config';

export async function GET() {
  const cfg = getActiveConfig();
  const specs = buildToolSpecs(cfg).filter(t => t.name !== 'noop');
  return new Response(JSON.stringify({ tools: specs, config: { id: cfg.id, name: cfg.name, description: cfg.description } }), { status: 200, headers: { 'content-type': 'application/json' } });
}
