import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

export async function POST(req: NextRequest) {
  const xPassword = req.headers.get('x-password');
  if (xPassword !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { captions, type } = await req.json() as { captions: string[]; type: 'lifestyle' | 'animation' };

  if (!captions?.length || !type) {
    return NextResponse.json({ error: 'Missing captions or type' }, { status: 400 });
  }

  const rows = captions
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .map(text => ({ text, type, used: false }));

  const { error } = await db.from('oscar_captions').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, inserted: rows.length });
}

export async function GET(req: NextRequest) {
  const xPassword = req.headers.get('x-password');
  if (xPassword !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await db
    .from('oscar_captions')
    .select('type, used')
    .eq('used', false);

  const counts = { lifestyle: 0, animation: 0 };
  for (const row of data || []) {
    if (row.type === 'lifestyle') counts.lifestyle++;
    if (row.type === 'animation') counts.animation++;
  }

  return NextResponse.json(counts);
}
