import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  if (req.headers.get('x-password') !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file') as File;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  // Upload screenshot to Supabase storage
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filename = `event-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await db.storage
    .from('oscar-photos')
    .upload(filename, buffer, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = db.storage.from('oscar-photos').getPublicUrl(filename);
  const photoUrl = urlData.publicUrl;

  // Use GPT-4o Vision to extract event details
  let extracted: Record<string, string | null> = {};
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract event details from this image. Return ONLY valid JSON with these fields:
{
  "title": "event name",
  "date": "YYYY-MM-DD or null",
  "time_start": "HH:MM or null",
  "venue": "venue/place name or null",
  "address": "street address or null",
  "city": "city name, default Bratislava",
  "country": "2-letter country code, default SK",
  "description": "1-2 sentence description in Slovak if Slovak event, English otherwise",
  "tag": "one of: sport, music, art, food, party, yoga, coffee, dancing, trhy, zaujimave",
  "duration": "number of hours as float, or null"
}
Return only the JSON object, no markdown.`,
            },
            {
              type: 'image_url',
              image_url: { url: photoUrl, detail: 'high' },
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    const text = response.choices[0]?.message?.content?.trim() || '{}';
    extracted = JSON.parse(text);
  } catch (e) {
    // Vision failed — insert with empty fields, user can edit in Discord
    extracted = {};
  }

  const sourceUrl = `woeva-picks://${filename}`;

  const { error: insertError } = await db.from('scraped_events').insert({
    title: extracted.title || file.name.replace(/\.[^.]+$/, ''),
    description: extracted.description || '',
    date: extracted.date || null,
    time_start: extracted.time_start || null,
    venue: extracted.venue || null,
    address: extracted.address || null,
    city: extracted.city || 'Bratislava',
    country: extracted.country || 'SK',
    tag: extracted.tag || 'zaujimave',
    duration: extracted.duration ? parseFloat(String(extracted.duration)) : null,
    photo_url: photoUrl,
    source_url: sourceUrl,
    source: 'instagram',
    approved: false,
    rejected: false,
    discord_sent: false,
  });

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ ok: true, extracted });
}
