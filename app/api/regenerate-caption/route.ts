import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

export async function POST(req: NextRequest) {
  const xPassword = req.headers.get('x-password');
  const xSecret = req.headers.get('x-secret');
  if (xPassword !== process.env.ADMIN_PASSWORD && xSecret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { itemId } = await req.json();
  const { data: item } = await db.from('oscar_queue').select('*').eq('id', itemId).single();
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Get next unused caption matching item type
  const { data: captionRow } = await db
    .from('oscar_captions')
    .select('*')
    .eq('type', item.type || 'lifestyle')
    .eq('used', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!captionRow) {
    return NextResponse.json({ error: 'No more captions available' }, { status: 400 });
  }

  await db.from('oscar_captions').update({ used: true }).eq('id', captionRow.id);

  const caption = captionRow.text;
  await db.from('oscar_queue').update({ caption }).eq('id', itemId);

  // Edit Discord message if exists
  if (item.discord_message_id) {
    const channelId = process.env.DISCORD_CHANNEL_ID!;
    const botToken = process.env.DISCORD_BOT_TOKEN!;
    const label = item.type === 'animation' ? 'animácia' : 'lifestyle';
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${item.discord_message_id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `**Woeva Oscar** \u{1F3AC} \u2014 *${label}*\n\n${caption}`,
      }),
    });
  }

  return NextResponse.json({ ok: true, caption });
}
