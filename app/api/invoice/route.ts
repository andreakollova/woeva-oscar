import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const SELLER = {
  name: 'Sportqo s. r. o.',
  address: 'Mudrochova 7480/15',
  city: '831 06 Bratislava - mestská časť Rača',
  ico: '56132433',
  dic: '2122213775',
  icdph: 'SK2122213775',
  icdphNote: 'podľa §4, registrácia od 1.5.2025',
};

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('sk-SK', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const event_id = searchParams.get('event_id');
  const token = searchParams.get('token');

  if (!event_id || !token) return new NextResponse('Missing params', { status: 400 });

  let userId: string;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    userId = payload.sub;
    if (!userId) throw new Error('no sub');
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000) - 3600) {
      return new NextResponse('Token expired', { status: 401 });
    }
  } catch {
    return new NextResponse('Invalid token', { status: 401 });
  }

  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

  const [{ data: event }, { data: profile }, { data: attendee }] = await Promise.all([
    db.from('events').select('title, date, venue, city, price').eq('id', event_id).single(),
    db.from('profiles').select('name').eq('id', userId).single(),
    db.from('event_attendees').select('id').eq('event_id', event_id).eq('user_id', userId).limit(1).maybeSingle(),
  ]);

  if (!event) return new NextResponse('Event not found', { status: 404 });
  if (!attendee) return new NextResponse('Not attending', { status: 403 });

  const { data: { user } } = await db.auth.admin.getUserById(userId);
  const attendeeEmail = user?.email ?? '';
  const attendeeName = profile?.name ?? attendeeEmail;

  const seq = parseInt(attendee.id.replace(/-/g, '').slice(0, 8), 16) % 9999 + 1;
  const year = new Date().getFullYear();
  const invoiceNumber = `WOEVA-${year}-${String(seq).padStart(4, '0')}`;

  const amount = event.price ?? 0;
  const vatBase = Math.round((amount / 1.23) * 100) / 100;
  const vatAmount = Math.round((amount - vatBase) * 100) / 100;
  const issueDate = new Date().toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
  const deliveryDate = event.date ? formatDate(event.date) : issueDate;
  const location = [event.venue, event.city].filter(Boolean).join(', ');

  const assetsDir = path.join(process.cwd(), 'pass-assets');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const buffers: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => buffers.push(chunk));

  doc.registerFont('Regular', path.join(assetsDir, 'Inter-Regular.ttf'));
  doc.registerFont('Bold', path.join(assetsDir, 'Inter-Bold.ttf'));

  const W = 495; // usable width (595 - 2*50)
  const BLACK = '#0A0A0A';
  const GRAY = '#888888';
  const LIGHT = '#F7F7F7';
  const LIME = '#B9FF00';

  // ── Logo + title ─────────────────────────────────────────
  const logoPath = path.join(assetsDir, 'logo@2x.png');
  if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 42, { height: 30 });
  doc.font('Bold').fontSize(24).fillColor(BLACK).text('FAKTÚRA', 50, 44, { align: 'right', width: W });

  // ── Invoice meta ─────────────────────────────────────────
  let y = 96;
  doc.font('Regular').fontSize(9).fillColor(GRAY).text('Číslo faktúry:', 50, y, { continued: true, width: 130 });
  doc.font('Bold').fillColor(BLACK).text(` ${invoiceNumber}`);
  y += 14;
  doc.font('Regular').fillColor(GRAY).text('Dátum vystavenia:', 50, y, { continued: true, width: 130 });
  doc.font('Regular').fillColor(BLACK).text(` ${issueDate}`);
  y += 14;
  doc.font('Regular').fillColor(GRAY).text('Dátum dodania:', 50, y, { continued: true, width: 130 });
  doc.font('Regular').fillColor(BLACK).text(` ${deliveryDate}`);

  // Lime divider
  y += 24;
  doc.rect(50, y, W, 2).fill(LIME);

  // ── Seller / Buyer columns ────────────────────────────────
  const colW = W / 2 - 10;
  y += 16;
  doc.font('Bold').fontSize(8).fillColor(GRAY).text('DODÁVATEĽ', 50, y);
  doc.font('Bold').fontSize(8).fillColor(GRAY).text('ODBERATEĽ', 50 + colW + 20, y);

  y += 14;
  doc.font('Bold').fontSize(11).fillColor(BLACK).text(SELLER.name, 50, y, { width: colW });
  doc.font('Bold').fontSize(11).fillColor(BLACK).text(attendeeName, 50 + colW + 20, y, { width: colW });

  y += 18;
  doc.font('Regular').fontSize(9).fillColor(BLACK);
  doc.text(SELLER.address, 50, y, { width: colW });
  doc.text(SELLER.city, 50, y + 13, { width: colW });
  doc.text(`IČO: ${SELLER.ico}`, 50, y + 30, { width: colW });
  doc.text(`DIČ: ${SELLER.dic}`, 50, y + 43, { width: colW });
  doc.text(`IČ DPH: ${SELLER.icdph}`, 50, y + 56, { width: colW });
  doc.font('Regular').fontSize(8).fillColor(GRAY).text(SELLER.icdphNote, 50, y + 69, { width: colW });

  doc.font('Regular').fontSize(9).fillColor(BLACK).text(attendeeEmail, 50 + colW + 20, y, { width: colW });

  // ── Items table header ────────────────────────────────────
  const tableY = y + 100;
  doc.rect(50, tableY, W, 26).fill(BLACK);
  doc.font('Bold').fontSize(8.5).fillColor('#FFFFFF');
  doc.text('POLOŽKA', 60, tableY + 9, { width: 210 });
  doc.text('ZÁK. DPH', 270, tableY + 9, { width: 80, align: 'right' });
  doc.text('SADZBA', 350, tableY + 9, { width: 55, align: 'right' });
  doc.text('DPH', 405, tableY + 9, { width: 55, align: 'right' });
  doc.text('SPOLU', 460, tableY + 9, { width: 85, align: 'right' });

  // Row
  const r1Y = tableY + 26;
  doc.rect(50, r1Y, W, 30).fill(LIGHT);
  doc.font('Regular').fontSize(9).fillColor(BLACK);
  const itemLabel = `Vstupenka: ${event.title}${location ? `  ·  ${location}` : ''}`;
  doc.text(itemLabel, 60, r1Y + 10, { width: 208, ellipsis: true });
  doc.text(`€${vatBase.toFixed(2)}`, 270, r1Y + 10, { width: 80, align: 'right' });
  doc.text('23 %', 350, r1Y + 10, { width: 55, align: 'right' });
  doc.text(`€${vatAmount.toFixed(2)}`, 405, r1Y + 10, { width: 55, align: 'right' });
  doc.text(`€${amount.toFixed(2)}`, 460, r1Y + 10, { width: 85, align: 'right' });

  // ── Totals ────────────────────────────────────────────────
  const tY = r1Y + 46;
  doc.font('Regular').fontSize(9).fillColor(GRAY).text('Základ DPH (23 %):', 340, tY, { width: 115, align: 'right' });
  doc.font('Regular').fillColor(BLACK).text(`€${vatBase.toFixed(2)}`, 460, tY, { width: 85, align: 'right' });
  doc.font('Regular').fillColor(GRAY).text('DPH (23 %):', 340, tY + 15, { width: 115, align: 'right' });
  doc.font('Regular').fillColor(BLACK).text(`€${vatAmount.toFixed(2)}`, 460, tY + 15, { width: 85, align: 'right' });
  doc.rect(340, tY + 33, W - 290, 1).fill('#DDDDDD');
  doc.font('Bold').fontSize(13).fillColor(BLACK).text('CELKOM:', 340, tY + 40, { width: 115, align: 'right' });
  doc.font('Bold').fontSize(13).fillColor(BLACK).text(`€${amount.toFixed(2)}`, 460, tY + 40, { width: 85, align: 'right' });

  // ── Footer ────────────────────────────────────────────────
  doc.rect(50, 762, W, 2).fill(LIME);
  doc.font('Regular').fontSize(8).fillColor(GRAY)
    .text('Woeva  ·  woeva.com  ·  admin@woeva.com', 50, 770, { align: 'center', width: W });

  doc.end();

  const pdfBuffer = await new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="woeva-faktura-${invoiceNumber}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
