import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as forge from 'node-forge';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

function sha1Hex(data: Buffer): string {
  const md = forge.md.sha1.create();
  md.update(data.toString('binary'));
  return md.digest().toHex();
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const raw = d.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const event_id = searchParams.get('event_id');
  const token = searchParams.get('token');

  if (!event_id || !token) {
    return new NextResponse('Missing event_id or token', { status: 400 });
  }

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

  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_KEY!;
  const db = createClient(supabaseUrl, serviceKey);

  const [{ data: event }, { data: profile }, { data: attendee }] = await Promise.all([
    db.from('events').select('*').eq('id', event_id).single(),
    db.from('profiles').select('name').eq('id', userId).single(),
    db.from('event_attendees').select('id').eq('event_id', event_id).eq('user_id', userId).limit(1).maybeSingle(),
  ]);

  if (!event) return new NextResponse('Event not found', { status: 404 });
  if (!attendee) return new NextResponse('Not attending', { status: 403 });

  const userName = profile?.name ?? '';

  try {
  const certPem = Buffer.from(process.env.PASS_CERT!, 'base64').toString('utf8');
  const keyPem  = Buffer.from(process.env.PASS_KEY!,  'base64').toString('utf8');
  const wwdrPem = Buffer.from(process.env.WWDR_CERT!, 'base64').toString('utf8');
  const passTypeId = process.env.PASS_TYPE_ID!;
  const teamId     = process.env.TEAM_ID!;

  // Format fields
  const dateValue = event.date ? formatDate(event.date) : '';
  const timeValue = event.time ? event.time.slice(0, 5) : '';
  const dateTimeValue = [dateValue, timeValue].filter(Boolean).join(' · ');
  // Location: venue + city
  const locationValue = [event.venue, event.city].filter(Boolean).join(', ');

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: attendee.id,
    teamIdentifier: teamId,
    organizationName: 'Woeva',
    description: event.title,
    logoText: '',
    foregroundColor: 'rgb(255, 255, 255)',
    backgroundColor: 'rgb(18, 18, 18)',
    labelColor: 'rgb(160, 160, 160)',
    eventTicket: {
      primaryFields: [],
      // Date + time on one row
      secondaryFields: [
        ...(dateTimeValue ? [{ key: 'datetime', label: 'DÁTUM A ČAS', value: dateTimeValue, textAlignment: 'PKTextAlignmentLeft' }] : []),
      ],
      // Venue below
      auxiliaryFields: [
        ...(locationValue ? [{ key: 'location', label: 'MIESTO', value: locationValue, textAlignment: 'PKTextAlignmentLeft' }] : []),
      ],
      backFields: [
        { key: 'ticketId', label: 'ID LÍSTKA', value: attendee.id },
        { key: 'holder', label: 'DRŽITEĽ LÍSTKA', value: userName },
        ...(locationValue ? [{ key: 'locationBack', label: 'MIESTO', value: locationValue }] : []),
        ...(event.price > 0 ? [{ key: 'price', label: 'ZAPLATENÁ SUMA', value: `€${Number(event.price).toFixed(2)}` }] : []),
      ],
    },
    barcodes: [{ message: `woeva:event:${event_id}:${userId}`, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' }],
    // Expire at end of event day (23:59 CET/CEST) — iOS moves it to "Expired" automatically
    ...(event.date ? { expirationDate: `${event.date}T23:59:00+02:00` } : {}),
  };

  const passJsonBuf = Buffer.from(JSON.stringify(passJson), 'utf8');
  const manifest: Record<string, string> = { 'pass.json': sha1Hex(passJsonBuf) };

  const cert = forge.pki.certificateFromPem(certPem);
  const key  = forge.pki.privateKeyFromPem(keyPem);
  const wwdr = forge.pki.certificateFromPem(wwdrPem);

  // Load static pass assets
  const assetsDir = path.join(process.cwd(), 'pass-assets');
  const iconPng   = fs.readFileSync(path.join(assetsDir, 'icon.png'));
  const icon2xPng = fs.readFileSync(path.join(assetsDir, 'icon@2x.png'));
  const icon3xPng = fs.readFileSync(path.join(assetsDir, 'icon@3x.png'));
  const logoPng   = fs.readFileSync(path.join(assetsDir, 'logo.png'));
  const logo2xPng = fs.readFileSync(path.join(assetsDir, 'logo@2x.png'));
  const logo3xPng = fs.readFileSync(path.join(assetsDir, 'logo@3x.png'));

  manifest['icon.png']    = sha1Hex(iconPng);
  manifest['icon@2x.png'] = sha1Hex(icon2xPng);
  manifest['icon@3x.png'] = sha1Hex(icon3xPng);
  manifest['logo.png']    = sha1Hex(logoPng);
  manifest['logo@2x.png'] = sha1Hex(logo2xPng);
  manifest['logo@3x.png'] = sha1Hex(logo3xPng);

  // Build composite strip matching Woeva ticket design
  // Strip @2x dimensions: 750 × 246 px (Apple eventTicket spec)
  const STRIP_W = 750;
  const STRIP_H = 246;

  let stripBuf: Buffer | null = null;
  const coverUrl = event.cover_url ?? event.image_url ?? event.photo_url;
  try {
    const compositeInputs: { input: Buffer; top: number; left: number; blend?: string }[] = [];

    // 1. Event photo (full strip, darkened)
    if (coverUrl) {
      const res = await fetch(coverUrl);
      if (res.ok) {
        const raw = Buffer.from(await res.arrayBuffer());
        const photoBuf = await sharp(raw)
          .resize(STRIP_W, STRIP_H, { fit: 'cover', position: 'centre' })
          .png()
          .toBuffer();
        compositeInputs.push({ input: photoBuf, top: 0, left: 0 });
      }
    }

    // 2. Dark overlay (rgba 0,0,0,0.55)
    const overlayBuf = await sharp({
      create: { width: STRIP_W, height: STRIP_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.55 } },
    }).png().toBuffer();
    compositeInputs.push({ input: overlayBuf, top: 0, left: 0, blend: 'over' } as any);

    // 3. Lime accent bar at bottom (10px)
    const LIME_H = 10;
    const limeBarBuf = await sharp({
      create: { width: STRIP_W, height: LIME_H, channels: 3, background: { r: 185, g: 255, b: 0 } },
    }).png().toBuffer();
    compositeInputs.push({ input: limeBarBuf, top: STRIP_H - LIME_H, left: 0 });

    // 4. "VALID TICKET" SVG pill — top right
    const pillSvg = Buffer.from(
      `<svg width="200" height="40" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="200" height="40" rx="20" fill="rgba(255,255,255,0.15)"/>
        <text x="100" y="27" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
              font-size="14" font-weight="700" fill="#B9FF00" text-anchor="middle" letter-spacing="1.5">VALID TICKET</text>
      </svg>`
    );
    compositeInputs.push({ input: pillSvg, top: 20, left: STRIP_W - 220 } as any);

    // 5. Event title text overlay — bottom left
    const titleText = (event.title ?? '').replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;' }[c as '<']!));
    const truncated = titleText.length > 32 ? titleText.slice(0, 31) + '…' : titleText;
    const titleSvg = Buffer.from(
      `<svg width="600" height="60" xmlns="http://www.w3.org/2000/svg">
        <text x="0" y="48" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
              font-size="44" font-weight="800" fill="white" letter-spacing="-1">${truncated}</text>
      </svg>`
    );
    compositeInputs.push({ input: titleSvg, top: STRIP_H - LIME_H - 70, left: 28 } as any);

    stripBuf = await sharp({
      create: { width: STRIP_W, height: STRIP_H, channels: 3, background: { r: 17, g: 17, b: 17 } },
    })
      .composite(compositeInputs)
      .png()
      .toBuffer();

    manifest['strip.png']    = sha1Hex(stripBuf);
    manifest['strip@2x.png'] = sha1Hex(stripBuf);
  } catch { /* skip strip on error */ }

  const manifestFinalBuf = Buffer.from(JSON.stringify(manifest), 'utf8');

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestFinalBuf.toString('binary'));
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key, certificate: cert,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime },
    ],
  });
  p7.sign({ detached: true });
  const sigBuf = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');

  const zip = new JSZip();
  zip.file('pass.json', passJsonBuf);
  zip.file('manifest.json', manifestFinalBuf);
  zip.file('signature', sigBuf);
  zip.file('icon.png', iconPng);
  zip.file('icon@2x.png', icon2xPng);
  zip.file('icon@3x.png', icon3xPng);
  zip.file('logo.png', logoPng);
  zip.file('logo@2x.png', logo2xPng);
  zip.file('logo@3x.png', logo3xPng);
  if (stripBuf) {
    zip.file('strip.png', stripBuf);
    zip.file('strip@2x.png', stripBuf);
  }

  const pkpass = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  return new NextResponse(new Uint8Array(pkpass), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': 'attachment; filename="woeva-ticket.pkpass"',
      'Cache-Control': 'no-store',
    },
  });
  } catch (err: any) {
    console.error('wallet-pass error:', err);
    return new NextResponse(`Pass generation error: ${err?.message ?? String(err)}`, { status: 500 });
  }
}
