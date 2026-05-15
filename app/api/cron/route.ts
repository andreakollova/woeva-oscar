import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateOscarImage } from '@/lib/generate';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const xPassword = req.headers.get('x-password');
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const isAdmin = xPassword === process.env.ADMIN_PASSWORD;

  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get next pending item
  const { data: item, error: fetchError } = await db
    .from('oscar_queue')
    .select('*')
    .eq('status', 'pending')
    .order('position', { ascending: true })
    .limit(1)
    .single();

  if (fetchError || !item) {
    return NextResponse.json({ message: 'No pending items' });
  }

  try {
    const { imageBase64, caption } = await generateOscarImage(item.photo_url, item.style);

    // Upload generated image to Supabase
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const filename = `oscar-${Date.now()}.png`;
    const { error: uploadError } = await db.storage
      .from('oscar-generated')
      .upload(filename, imageBuffer, { contentType: 'image/png', upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = db.storage.from('oscar-generated').getPublicUrl(filename);
    const generatedUrl = urlData.publicUrl;

    // Send to Discord with buttons
    const discordMessageId = await sendToDiscord(item.id, imageBuffer, filename, caption, item.style);

    // Update queue item
    await db.from('oscar_queue').update({
      status: 'sent',
      generated_url: generatedUrl,
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

async function sendToDiscord(
  itemId: string,
  imageBuffer: Buffer,
  filename: string,
  caption: string,
  style: string,
): Promise<string> {
  const channelId = process.env.DISCORD_CHANNEL_ID!;
  const botToken = process.env.DISCORD_BOT_TOKEN!;

  const payload = {
    content: `**Woeva Oscar** \u{1F3AC} \u2014 *${style}*\n\n${caption}`,
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 2,
            label: '\u267B\uFE0F Recreate',
            custom_id: `oscar_recreate:${itemId}`,
          },
          {
            type: 2,
            style: 3,
            label: '\u{1F4F8} Post to IG',
            custom_id: `oscar_post:${itemId}`,
          },
        ],
      },
    ],
  };

  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', new Blob([imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength)], { type: 'image/png' }), filename);

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
