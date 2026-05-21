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
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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
  const timeValue = event.time ?? '';
  // Location on two lines: venue on first, city on second
  const locationValue = [event.venue, event.city].filter(Boolean).join('\n');

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
      // Empty primaryFields → strip photo shows clean with no text overlay
      primaryFields: [],
      // Single secondaryField → renders full-width below the strip, event title prominent
      secondaryFields: [
        { key: 'event', label: '', value: event.title, textAlignment: 'PKTextAlignmentLeft' },
      ],
      // DATE and TIME side-by-side, then LOCATION with two-line value
      auxiliaryFields: [
        ...(dateValue ? [{ key: 'date', label: 'DATE', value: dateValue, textAlignment: 'PKTextAlignmentLeft' }] : []),
        ...(timeValue ? [{ key: 'time', label: 'TIME', value: timeValue, textAlignment: 'PKTextAlignmentLeft' }] : []),
        ...(locationValue ? [{ key: 'location', label: 'LOCATION', value: locationValue, textAlignment: 'PKTextAlignmentLeft' }] : []),
      ],
      backFields: [
        { key: 'ticketId', label: 'TICKET ID', value: attendee.id },
        { key: 'holder', label: 'TICKET HOLDER', value: userName },
        ...(locationValue ? [{ key: 'locationBack', label: 'LOCATION', value: locationValue.replace('\n', ', ') }] : []),
        ...(event.price > 0 ? [{ key: 'price', label: 'PRICE PAID', value: `€${Number(event.price).toFixed(2)}` }] : []),
      ],
    },
    barcodes: [{ message: attendee.id, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' }],
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

  // Build composite strip: lime bar on top + event photo below
  // Strip @2x dimensions: 750 × 246 px (Apple eventTicket spec)
  const STRIP_W = 750;
  const STRIP_H = 246;
  const LIME_H  = 14; // lime accent bar height in px

  const limeBarBuf = await sharp({
    create: { width: STRIP_W, height: LIME_H, channels: 3, background: { r: 201, g: 255, b: 71 } },
  }).png().toBuffer();

  let stripBuf: Buffer | null = null;
  const coverUrl = event.cover_url ?? event.image_url ?? event.photo_url;
  try {
    let photoBuf: Buffer | null = null;
    if (coverUrl) {
      const res = await fetch(coverUrl);
      if (res.ok) {
        const raw = Buffer.from(await res.arrayBuffer());
        photoBuf = await sharp(raw)
          .resize(STRIP_W, STRIP_H - LIME_H, { fit: 'cover', position: 'centre' })
          .png()
          .toBuffer();
      }
    }
    const compositeInputs = photoBuf
      ? [{ input: limeBarBuf, top: 0, left: 0 }, { input: photoBuf, top: LIME_H, left: 0 }]
      : [{ input: limeBarBuf, top: 0, left: 0 }];

    stripBuf = await sharp({
      create: { width: STRIP_W, height: STRIP_H, channels: 3, background: { r: 18, g: 18, b: 18 } },
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
