import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import forge from 'node-forge';
import JSZip from 'jszip';

function sha1Hex(data: Buffer): string {
  const md = forge.md.sha1.create();
  md.update(data.toString('binary'));
  return md.digest().toHex();
}

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

  // Verify user via Supabase REST API
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_KEY!;
  const db = createClient(supabaseUrl, serviceKey);

  // Verify the user's JWT
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Get event
  const { data: event } = await db.from('events').select('*').eq('id', event_id).single();
  if (!event) return new NextResponse('Event not found', { status: 404 });

  // Check attendance
  const { data: attendee } = await db
    .from('event_attendees')
    .select('id')
    .eq('event_id', event_id)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!attendee) return new NextResponse('Not attending', { status: 403 });

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
        { key: 'holder', label: 'TICKET HOLDER', value: user.email ?? '' },
        ...(event.price > 0 ? [{ key: 'price', label: 'PRICE PAID', value: `€${Number(event.price).toFixed(2)}` }] : []),
      ],
    },
    barcodes: [{ message: attendee.id, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' }],
  };

  const passJsonBuf = Buffer.from(JSON.stringify(passJson), 'utf8');
  const manifest: Record<string, string> = { 'pass.json': sha1Hex(passJsonBuf) };
  const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8');

  // PKCS7 signature
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  const wwdr = forge.pki.certificateFromPem(wwdrPem);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestBuf.toString('binary'));
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

  const sigDer = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const sigBuf = Buffer.from(sigDer, 'binary');

  // Build ZIP
  const zip = new JSZip();
  zip.file('pass.json', passJsonBuf);
  zip.file('manifest.json', manifestBuf);
  zip.file('signature', sigBuf);
  const pkpass = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  return new NextResponse(pkpass, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': 'attachment; filename="woeva-ticket.pkpass"',
      'Cache-Control': 'no-store',
    },
  });
}
