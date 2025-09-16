import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  // In production you would exchange a server-side ephemeral token.
  // Here we read a static key from .key (DO NOT do this in real deployments)
  const fs = await import('fs/promises');
  const key = (await fs.readFile(process.cwd() + '/.key', 'utf8')).trim();

  // For demo we just return as if ephemeral (client will pass as pseudo insecure header subprotocol)
  return new Response(JSON.stringify({ client_secret: key }), { status: 200, headers: { 'content-type': 'application/json' } });
}
