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

  // Get next pending lifestyle item
  const { data: item, error: fetchError } = await db
    .from('oscar_queue')
    .select('*')
    .eq('status', 'pending')
    .eq('type', 'lifestyle')
    .order('position', { ascending: true })
    .limit(1)
    .single();

  if (fetchError || !item) {
    return NextResponse.json({ message: 'No pending items' });
  }

  // Get an unused lifestyle caption
  const { data: captionRow } = await db
    .from('oscar_captions')
    .select('*')
    .eq('type', 'lifestyle')
    .eq('used', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!captionRow) {
    return NextResponse.json({ error: 'No captions available — upload some first' }, { status: 400 });
  }

  const caption = captionRow.text;

  try {
    // Mark caption as used
    await db.from('oscar_captions').update({ used: true }).eq('id', captionRow.id);

    const discordMessageId = await sendToDiscord(item.id, item.photo_url, caption);

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

async function sendToDiscord(itemId: string, photoUrl: string, caption: string): Promise<string> {
  const channelId = process.env.DISCORD_CHANNEL_ID!;
  const botToken = process.env.DISCORD_BOT_TOKEN!;

  const payload = {
    content: `**Woeva Oscar** \u{1F5BC}\uFE0F \u2014 *lifestyle*\n\n${caption}`,
    embeds: [{ image: { url: photoUrl } }],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 2, label: '\u267B\uFE0F Popis', custom_id: `oscar_regen_caption:${itemId}` },
          { type: 2, style: 3, label: '\u{1F4F8} Post to IG', custom_id: `oscar_post:${itemId}` },
        ],
      },
    ],
  };

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord send failed: ${text}`);
  }

  const data = await res.json();
  return data.id;
}
