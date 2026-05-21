import { NextRequest, NextResponse } from 'next/server';

// GET /api/wallet-pass?event_id=xxx&token=yyy
// Proxies to Supabase Edge Function (adding required auth headers server-side)
// Returns binary .pkpass — Safari opens it directly in Apple Wallet
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

  const data = await res.json();
  if (!data.url) {
    return new NextResponse('No signed URL returned', { status: 502 });
  }

  // Fetch the actual .pkpass binary from Storage signed URL (server-to-server, no browser restrictions)
  const passRes = await fetch(data.url, {
    headers: { 'apikey': anonKey },
  });

  if (!passRes.ok) {
    return new NextResponse('Failed to fetch pass from storage', { status: 502 });
  }

  const passBuffer = await passRes.arrayBuffer();

  return new NextResponse(passBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': 'attachment; filename="woeva-ticket.pkpass"',
      'Cache-Control': 'no-store',
    },
  });
}
