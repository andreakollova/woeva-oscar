import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const xPassword = req.headers.get('x-password');
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const isAdmin = xPassword === process.env.ADMIN_PASSWORD;

  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: item } = await db
    .from('oscar_queue')
    .select('*')
    .eq('status', 'pending')
    .eq('type', 'animation')
    .order('position', { ascending: true })
    .limit(1)
    .single();

  if (!item) {
    return NextResponse.json({ message: 'No pending animation items' });
  }

  // Get an unused animation caption
  const { data: captionRow } = await db
    .from('oscar_captions')
    .select('*')
    .eq('type', 'animation')
    .eq('used', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!captionRow) {
    return NextResponse.json({ error: 'No animation captions available — upload some first' }, { status: 400 });
  }

  const caption = captionRow.text;

  try {
    await db.from('oscar_captions').update({ used: true }).eq('id', captionRow.id);

    const discordMessageId = await sendVideoToDiscord(item.id, item.photo_url, caption);

    await db.from('oscar_queue').update({
      status: 'sent',
      caption,
      discord_message_id: discordMessageId,
    }).eq('id', item.id);

    return NextResponse.json({ ok: true, caption });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from('oscar_queue').update({ status: 'failed' }).eq('id', item.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function sendVideoToDiscord(itemId: string, videoUrl: string, caption: string): Promise<string> {
  const channelId = process.env.DISCORD_CHANNEL_ID!;
  const botToken = process.env.DISCORD_BOT_TOKEN!;

  const videoRes = await fetch(videoUrl);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const ext = videoUrl.split('.').pop()?.split('?')[0] || 'mp4';
  const filename = `animation.${ext}`;

  const payload = {
    content: `**Woeva Oscar** \u{1F3AC} \u2014 *animácia*\n\n${caption}`,
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 2, label: '\u267B\uFE0F Popis', custom_id: `oscar_regen_caption:${itemId}` },
          { type: 2, style: 3, label: '\u{1F4F8} Post to IG', custom_id: `oscar_post_reel:${itemId}` },
        ],
      },
    ],
  };

  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', new Blob([new Uint8Array(videoBuffer)], { type: `video/${ext}` }), filename);

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord send failed: ${text}`);
  }

  const data = await res.json();
  return data.id;
}
