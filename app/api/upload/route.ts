import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

export async function POST(req: NextRequest) {
  if (req.headers.get('x-password') !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file') as File;
  const style = (form.get('style') as string) || 'dark';

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await db.storage
    .from('oscar-photos')
    .upload(filename, buffer, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = db.storage.from('oscar-photos').getPublicUrl(filename);

  // Get max position
  const { data: maxRow } = await db
    .from('oscar_queue')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const position = (maxRow?.position ?? -1) + 1;

  const { error: insertError } = await db.from('oscar_queue').insert({
    photo_url: urlData.publicUrl,
    style,
    status: 'pending',
    position,
  });

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
