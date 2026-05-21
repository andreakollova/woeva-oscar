import { NextRequest, NextResponse } from 'next/server';

// GET /api/wallet-pass?event_id=xxx&token=yyy
// Proxies to Supabase Edge Function (server-side auth headers), streams binary .pkpass back
// Safari downloads .pkpass and iOS opens Apple Wallet directly
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const event_id = searchParams.get('event_id');
  const token = searchParams.get('token');

  if (!event_id || !token) {
    return new NextResponse('Missing event_id or token', { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL!;
  const anonKey = process.env.SUPABASE_KEY!;

  const res = await fetch(`${supabaseUrl}/functions/v1/generate-pass`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'apikey': anonKey,
    },
    body: JSON.stringify({ event_id }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new NextResponse(`Pass generation failed: ${err}`, { status: 502 });
  }

  const passBuffer = await res.arrayBuffer();

  return new NextResponse(passBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': 'attachment; filename="woeva-ticket.pkpass"',
      'Cache-Control': 'no-store',
    },
  });
}
