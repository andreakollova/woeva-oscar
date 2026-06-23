import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getDb() { return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!); }

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (req.headers.get('x-password') !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file') as File;
  const caption = ((form.get('caption') as string) || '').trim();
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const filename = `reel-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await getDb().storage
    .from('oscar-videos')
    .upload(filename, buffer, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = getDb().storage.from('oscar-videos').getPublicUrl(filename);
  const videoUrl = urlData.publicUrl;

  const { data: maxRow } = await getDb()
    .from('oscar_queue')
    .select('position')
    .eq('type', 'reel')
    .order('position', { ascending: false })
    .limit(1)
    .single();
  const position = (maxRow?.position ?? -1) + 1;

  const { data: item, error: insertError } = await getDb()
    .from('oscar_queue')
    .insert({ photo_url: videoUrl, type: 'reel', style: 'light', status: 'sent', position, caption })
    .select()
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  try {
    const msgId = await sendToDiscord(item.id, caption);
    await getDb().from('oscar_queue').update({ discord_message_id: msgId }).eq('id', item.id);
  } catch (e) {
    console.error('Discord send failed:', e);
  }

  return NextResponse.json({ ok: true });
}

async function sendToDiscord(itemId: string, caption: string): Promise<string> {
  const res = await fetch(`https://discord.com/api/v10/channels/${process.env.DISCORD_CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `**Woeva Oscar** \u{1F39E}\uFE0F \u2014 *reel*\n\n${caption ? `${caption}\n\n` : ''}\u23F0 Je \u010Das postnu\u0165 reel \u2014 pozri do gallery spr\u00E1vy`,
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: '\u{1F39E}\uFE0F Post Reel', custom_id: `oscar_post_reel:${itemId}` },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Discord: ${await res.text()}`);
  return (await res.json()).id;
}
