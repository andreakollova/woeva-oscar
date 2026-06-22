import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { generateInvoicePdf } from '../admin-invoice/route';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  const month = searchParams.get('month'); // format: YYYY-MM

  if (secret !== process.env.ADMIN_SECRET) return new NextResponse('Unauthorized', { status: 401 });
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return new NextResponse('Missing or invalid month (YYYY-MM)', { status: 400 });

  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

  const startDate = `${month}-01`;
  const [year, mon] = month.split('-').map(Number);
  const endDate = new Date(year, mon, 1).toISOString().slice(0, 10);

  const { data: rows } = await db
    .from('event_attendees')
    .select('id, user_id, events!inner(title, date, venue, city, price)')
    .eq('paid', true)
    .gt('events.price', 0)
    .gte('created_at', `${startDate}T00:00:00`)
    .lt('created_at', `${endDate}T00:00:00`) as any;

  if (!rows || rows.length === 0) {
    return new NextResponse('No paid attendees found for this month', { status: 404 });
  }

  // Batch-fetch profiles
  const userIds = [...new Set(rows.map((r: any) => r.user_id))] as string[];
  const { data: profiles } = await db.from('profiles').select('id, name, email').in('id', userIds);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  const zip = new JSZip();

  await Promise.all(rows.map(async (row: any) => {
    const profile = profileMap.get(row.user_id);
    const email = profile?.email ?? '';
    if (email.endsWith('@woeva.internal')) return;

    const seq = parseInt(row.id.replace(/-/g, '').slice(0, 8), 16) % 9999 + 1;
    const eventYear = new Date(row.events.date + 'T00:00:00').getFullYear();
    const invoiceNumber = `WOEVA-${eventYear}-${String(seq).padStart(4, '0')}`;

    const pdf = await generateInvoicePdf({
      eventTitle: row.events.title,
      eventDate: row.events.date,
      eventVenue: row.events.venue,
      eventCity: row.events.city,
      amount: row.events.price ?? 0,
      attendeeName: profile?.name ?? 'Účastník',
      attendeeEmail: email,
      attendeeId: row.id,
    });

    zip.file(`faktura-${invoiceNumber}.pdf`, pdf);
  }));

  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  return new NextResponse(new Uint8Array(zipBuf), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="faktury-${month}.zip"`,
    },
  });
}
