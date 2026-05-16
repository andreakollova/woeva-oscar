import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

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

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const captionRes = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `Write an Instagram caption in Slovak for Woeva — a free community events app. The post is a ${item.style} aesthetic lifestyle editorial photo.

Style rules:
- Emotional, poetic, short lines (2-5 words per line), line breaks between thoughts
- Evokes a feeling or mood — NOT always about events directly
- Captures a feeling like: being glad you went out, good energy, good people, spontaneous moments
- Ends with: "Downloadni si Woeva.\nApp Store & Google Play."
- Add 1 fitting emoji at the end of the first stanza (not in CTA)
- No hashtags, no English, no formal language — casual, warm, Gen Z Slovak
- Total length: 4-7 short lines + the CTA

Examples:
"Niekedy ani nejde o ten event.\nIde o ten pocit,\nkeď si rád,\nže si neostal doma. ✨\n\nDownloadni si Woeva.\nApp Store & Google Play."

"Väčšina dobrých spomienok\nzačína vetou:\n„Tak poďme." 🌙\n\nDownloadni si Woeva.\nApp Store & Google Play."`,
    }],
    max_tokens: 120,
  });

  const rawCaption = captionRes.choices[0].message.content?.trim() || '';
  const caption = rawCaption + '\n\n#woeva';

  // Update DB
  await db.from('oscar_queue').update({ caption }).eq('id', itemId);

  // Edit Discord message if exists
  if (item.discord_message_id) {
    const channelId = process.env.DISCORD_CHANNEL_ID!;
    const botToken = process.env.DISCORD_BOT_TOKEN!;
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${item.discord_message_id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `**Woeva Oscar** \u{1F3AC} \u2014 *${item.style}*\n\n${caption}`,
      }),
    });
  }

  return NextResponse.json({ ok: true, caption });
}
