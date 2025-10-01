import { NextRequest } from 'next/server';
import { getActiveConfig, listConfigs, setActiveConfig } from '@/lib/industry-config';

export async function GET() {
  const active = getActiveConfig();
  const configs = listConfigs().map(c => ({ id: c.id, name: c.name, description: c.description }));
  return new Response(JSON.stringify({ active, configs }), { status:200, headers:{'content-type':'application/json'} });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.id) return new Response(JSON.stringify({ error:'missing_id'}), { status:400 });
    const active = setActiveConfig(body.id);
    return new Response(JSON.stringify({ active }), { status:200, headers:{'content-type':'application/json'} });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e.message || 'error'}), { status:500 });
  }
}
