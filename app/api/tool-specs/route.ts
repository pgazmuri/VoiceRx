import { toolSpecs } from '@/lib/tools';

export async function GET() {
  return new Response(JSON.stringify({ tools: toolSpecs }), { status: 200, headers: { 'content-type': 'application/json' } });
}
