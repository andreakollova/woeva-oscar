import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

function getDb() { return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!); }
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (req.headers.get('x-password') !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file') as File;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filename = `event-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await getDb().storage
    .from('oscar-photos')
    .upload(filename, buffer, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = getDb().storage.from('oscar-photos').getPublicUrl(filename);
  const photoUrl = urlData.publicUrl;

  let caption = 'Downloadni si Woeva.';
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: photoUrl, detail: 'low' } },
          { type: 'text', text: 'Si Instagram copywriter pre Woeva — appku na objavovanie eventov. Vytvor kratky poeticky popis tohto eventu v slovencine (2-4 riadky). Vyzdvihni atmosferu a zazitok. Na konci pridaj presne toto: "Downloadni si Woeva."' },
        ],
      }],
      max_tokens: 200,
    });
    caption = completion.choices[0]?.message?.content?.trim() || caption;
  } catch { /* fallback */ }

  const { data: maxRow } = await getDb()
    .from('oscar_queue')
    .select('position')
    .eq('type', 'event')
    .order('position', { ascending: false })
    .limit(1)
    .single();
  const position = (maxRow?.position ?? -1) + 1;

  const { data: item, error: insertError } = await getDb()
    .from('oscar_queue')
    .insert({ photo_url: photoUrl, type: 'event', style: 'light', status: 'sent', position, caption })
    .select()
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  try {
    const msgId = await sendToDiscord(item.id, photoUrl, caption);
    await getDb().from('oscar_queue').update({ discord_message_id: msgId }).eq('id', item.id);
  } catch (e) {
    console.error('Discord send failed:', e);
  }

  return NextResponse.json({ ok: true });
}

async function sendToDiscord(itemId: string, photoUrl: string, caption: string): Promise<string> {
  const res = await fetch(`https://discord.com/api/v10/channels/${process.env.DISCORD_CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `**Woeva Oscar** \u{1F4F8} \u2014 *event*\n\n${caption}`,
      embeds: [{ image: { url: photoUrl } }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 2, label: '\u267B\uFE0F Popis', custom_id: `oscar_regen_caption:${itemId}` },
          { type: 2, style: 3, label: '\u{1F4F8} Post to IG', custom_id: `oscar_post:${itemId}` },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Discord: ${await res.text()}`);
  return (await res.json()).id;
}
