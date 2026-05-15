import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateOscarImage } from '@/lib/generate';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (req.headers.get('x-secret') !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { itemId } = await req.json();

  const { data: item } = await db.from('oscar_queue').select('*').eq('id', itemId).single();
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const { imageBase64, caption } = await generateOscarImage(item.photo_url, item.style);
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const filename = `oscar-${Date.now()}.png`;

    const { error: uploadError } = await db.storage
      .from('oscar-generated')
      .upload(filename, imageBuffer, { contentType: 'image/png', upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = db.storage.from('oscar-generated').getPublicUrl(filename);

    // Edit the Discord message with the new image
    if (item.discord_message_id) {
      await editDiscordMessage(item.discord_message_id, item.id, imageBuffer, filename, caption, item.style);
    }

    await db.from('oscar_queue').update({
      generated_url: urlData.publicUrl,
      caption,
    }).eq('id', itemId);

    return NextResponse.json({ ok: true, caption });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function editDiscordMessage(
  messageId: string,
  itemId: string,
  imageBuffer: Buffer,
  filename: string,
  caption: string,
  style: string,
) {
  const channelId = process.env.DISCORD_CHANNEL_ID!;
  const botToken = process.env.DISCORD_BOT_TOKEN!;

  const payload = {
    content: `**Woeva Oscar** \u{1F3AC} \u2014 *${style}*\n\n${caption}`,
    attachments: [],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 2, label: '\u267B\uFE0F Recreate', custom_id: `oscar_recreate:${itemId}` },
          { type: 2, style: 3, label: '\u{1F4F8} Post to IG', custom_id: `oscar_post:${itemId}` },
        ],
      },
    ],
  };

  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', new Blob([imageBuffer], { type: 'image/png' }), filename);

  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bot ${botToken}` },
    body: form,
  });
}
