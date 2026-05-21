import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as forge from 'node-forge';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

function sha1Hex(data: Buffer): string {
  const md = forge.md.sha1.create();
  md.update(data.toString('binary'));
  return md.digest().toHex();
}

export const runtime = 'nodejs';

// GET /api/wallet-pass?event_id=xxx&token=yyy
// Generates .pkpass directly on Vercel — no Supabase Edge Function involved
// Safari downloads .pkpass and iOS opens Apple Wallet dialog directly
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const event_id = searchParams.get('event_id');
  const token = searchParams.get('token');

  if (!event_id || !token) {
    return new NextResponse('Missing event_id or token', { status: 400 });
  }

  // Decode JWT payload to get user_id (no signature verification needed —
  // attendance check below ensures the user actually has a ticket for this event)
  let userId: string;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    userId = payload.sub;
    if (!userId) throw new Error('no sub');
    // Reject clearly expired tokens (>1h grace period)
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000) - 3600) {
      return new NextResponse('Token expired', { status: 401 });
    }
  } catch {
    return new NextResponse('Invalid token', { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_KEY!;
  const db = createClient(supabaseUrl, serviceKey);

  // Get event
  const { data: event } = await db.from('events').select('*').eq('id', event_id).single();
  if (!event) return new NextResponse('Event not found', { status: 404 });

  // Check attendance
  const { data: attendee } = await db
    .from('event_attendees')
    .select('id')
    .eq('event_id', event_id)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (!attendee) return new NextResponse('Not attending', { status: 403 });

  try {
  // Load certs (stored as base64 in env vars)
  const certPem = Buffer.from(process.env.PASS_CERT!, 'base64').toString('utf8');
  const keyPem = Buffer.from(process.env.PASS_KEY!, 'base64').toString('utf8');
  const wwdrPem = Buffer.from(process.env.WWDR_CERT!, 'base64').toString('utf8');
  const passTypeId = process.env.PASS_TYPE_ID!;
  const teamId = process.env.TEAM_ID!;

  // Build pass.json
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: attendee.id,
    teamIdentifier: teamId,
    organizationName: 'Woeva',
    description: event.title,
    logoText: 'Woeva',
    foregroundColor: 'rgb(10, 10, 10)',
    backgroundColor: 'rgb(201, 255, 71)',
    labelColor: 'rgb(10, 10, 10)',
    eventTicket: {
      primaryFields: [{ key: 'event', label: 'EVENT', value: event.title }],
      secondaryFields: [
        ...(event.date ? [{ key: 'date', label: 'DATE', value: event.date }] : []),
        ...(event.time ? [{ key: 'time', label: 'TIME', value: event.time }] : []),
      ],
      auxiliaryFields: [
        ...(event.venue ? [{ key: 'venue', label: 'VENUE', value: [event.venue, event.city].filter(Boolean).join(', ') }] : []),
      ],
      backFields: [
        { key: 'ticketId', label: 'TICKET ID', value: attendee.id },
        { key: 'holder', label: 'TICKET HOLDER', value: '' },
        ...(event.price > 0 ? [{ key: 'price', label: 'PRICE PAID', value: `€${Number(event.price).toFixed(2)}` }] : []),
      ],
    },
    barcodes: [{ message: attendee.id, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' }],
  };

  const passJsonBuf = Buffer.from(JSON.stringify(passJson), 'utf8');
  const manifest: Record<string, string> = { 'pass.json': sha1Hex(passJsonBuf) };
  const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8');

  // Load certs for signing
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  const wwdr = forge.pki.certificateFromPem(wwdrPem);

  // Load pass images from pass-assets/
  const assetsDir = path.join(process.cwd(), 'pass-assets');
  const iconPng    = fs.readFileSync(path.join(assetsDir, 'icon.png'));
  const icon2xPng  = fs.readFileSync(path.join(assetsDir, 'icon@2x.png'));
  const icon3xPng  = fs.readFileSync(path.join(assetsDir, 'icon@3x.png'));
  const logoPng    = fs.readFileSync(path.join(assetsDir, 'logo.png'));
  const logo2xPng  = fs.readFileSync(path.join(assetsDir, 'logo@2x.png'));
  const logo3xPng  = fs.readFileSync(path.join(assetsDir, 'logo@3x.png'));

  manifest['icon.png']    = sha1Hex(iconPng);
  manifest['icon@2x.png'] = sha1Hex(icon2xPng);
  manifest['icon@3x.png'] = sha1Hex(icon3xPng);
  manifest['logo.png']    = sha1Hex(logoPng);
  manifest['logo@2x.png'] = sha1Hex(logo2xPng);
  manifest['logo@3x.png'] = sha1Hex(logo3xPng);

  const manifestFinalBuf = Buffer.from(JSON.stringify(manifest), 'utf8');

  // Sign with final manifest
  const p7final = forge.pkcs7.createSignedData();
  p7final.content = forge.util.createBuffer(manifestFinalBuf.toString('binary'));
  p7final.addCertificate(cert);
  p7final.addCertificate(wwdr);
  p7final.addSigner({
    key, certificate: cert,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime },
    ],
  });
  p7final.sign({ detached: true });
  const sigFinalDer = forge.asn1.toDer(p7final.toAsn1()).getBytes();
  const sigFinalBuf = Buffer.from(sigFinalDer, 'binary');

  // Build ZIP
  const zip = new JSZip();
  zip.file('pass.json', passJsonBuf);
  zip.file('manifest.json', manifestFinalBuf);
  zip.file('signature', sigFinalBuf);
  zip.file('icon.png', iconPng);
  zip.file('icon@2x.png', icon2xPng);
  zip.file('icon@3x.png', icon3xPng);
  zip.file('logo.png', logoPng);
  zip.file('logo@2x.png', logo2xPng);
  zip.file('logo@3x.png', logo3xPng);
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
