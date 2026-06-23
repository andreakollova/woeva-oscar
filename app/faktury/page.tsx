'use client';

import { useState, useEffect } from 'react';

const PASSWORD = 'hokejjehokej66';
const HINT = 'hokej';

type Invoice = {
  id: string;
  user_id: string;
  created_at: string;
  events: { title: string; date: string; price: number };
  attendeeName: string;
  attendeeEmail: string;
  invoiceNumber: string;
};

function getMonthLabel(m: string) {
  const [y, mo] = m.split('-');
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString('sk-SK', { month: 'long', year: 'numeric' });
}

function buildInvoiceNumber(row: any) {
  const seq = parseInt(row.id.replace(/-/g, '').slice(0, 8), 16) % 9999 + 1;
  const year = new Date(row.events.date + 'T00:00:00').getFullYear();
  return `WOEVA-${year}-${String(seq).padStart(4, '0')}`;
}

export default function FakturyPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [pwError, setPwError] = useState(false);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('faktury_authed') === '1') {
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    const secret = process.env.NEXT_PUBLIC_ADMIN_SECRET_HINT ?? PASSWORD;
    fetch(`/api/admin-invoice-list?secret=${encodeURIComponent(secret)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setInvoices(data.invoices ?? []);
      })
      .catch(() => setError('Nepodarilo sa načítať faktúry.'))
      .finally(() => setLoading(false));
  }, [authed]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (pw === PASSWORD) {
      sessionStorage.setItem('faktury_authed', '1');
      setAuthed(true);
      setPwError(false);
    } else {
      setPwError(true);
    }
  }

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleLogin} style={{ background: '#181818', borderRadius: 20, padding: '40px 36px', minWidth: 320, textAlign: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: 28, color: '#fff', letterSpacing: -1, marginBottom: 8 }}>Woeva</div>
          <div style={{ color: '#888', fontSize: 14, marginBottom: 28 }}>Faktúry — chránená sekcia</div>
          <input
            type="password"
            value={pw}
            onChange={e => { setPw(e.target.value); setPwError(false); }}
            placeholder="Heslo"
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 12,
              border: pwError ? '1.5px solid #ff4444' : '1.5px solid #333',
              background: '#111', color: '#fff', fontSize: 15, outline: 'none',
              boxSizing: 'border-box', marginBottom: 12,
            }}
            autoFocus
          />
          {pwError && <div style={{ color: '#ff4444', fontSize: 13, marginBottom: 10 }}>Nesprávne heslo</div>}
          <button type="submit" style={{
            width: '100%', padding: '13px', background: '#B9FF00', color: '#0a0a0a',
            fontWeight: 800, fontSize: 15, border: 'none', borderRadius: 50, cursor: 'pointer',
          }}>Prihlásiť sa</button>
          <button type="button" onClick={() => setShowHint(h => !h)}
            style={{ marginTop: 16, background: 'none', border: 'none', color: '#555', fontSize: 12, cursor: 'pointer' }}>
            {showHint ? `Nápoveda: ${HINT}` : 'Zabudol/a si heslo?'}
          </button>
        </form>
      </div>
    );
  }

  // Group by month
  const byMonth: Record<string, Invoice[]> = {};
  for (const inv of invoices) {
    const m = inv.created_at.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(inv);
  }
  const months = Object.keys(byMonth).sort().reverse();

  async function downloadOne(inv: Invoice) {
    setDownloading(inv.id);
    const secret = PASSWORD;
    const url = `/api/admin-invoice?secret=${encodeURIComponent(secret)}&attendee_id=${inv.id}`;
    const r = await fetch(url);
    if (!r.ok) { alert('Chyba pri generovaní PDF'); setDownloading(null); return; }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `faktura-${inv.invoiceNumber}.pdf`;
    a.click();
    setDownloading(null);
  }

  async function downloadZip(month: string) {
    setDownloading(`zip-${month}`);
    const secret = PASSWORD;
    const url = `/api/admin-invoice-bulk?secret=${encodeURIComponent(secret)}&month=${month}`;
    const r = await fetch(url);
    if (!r.ok) { alert('Chyba pri generovaní ZIP'); setDownloading(null); return; }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `faktury-${month}.zip`;
    a.click();
    setDownloading(null);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', padding: '40px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 26, letterSpacing: -0.5 }}>Faktúry</div>
            <div style={{ color: '#888', fontSize: 13 }}>Sportqo s.r.o. / Woeva</div>
          </div>
          <button onClick={() => { sessionStorage.removeItem('faktury_authed'); setAuthed(false); }}
            style={{ background: '#222', border: 'none', color: '#888', borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
            Odhlásiť
          </button>
        </div>

        {loading && <div style={{ color: '#888', textAlign: 'center', paddingTop: 60 }}>Načítavam...</div>}
        {error && <div style={{ color: '#ff4444', textAlign: 'center', paddingTop: 60 }}>{error}</div>}
        {!loading && !error && invoices.length === 0 && (
          <div style={{ color: '#888', textAlign: 'center', paddingTop: 60 }}>Žiadne faktúry</div>
        )}

        {months.map(month => (
          <div key={month} style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15, textTransform: 'capitalize' }}>{getMonthLabel(month)}</div>
              <button
                onClick={() => downloadZip(month)}
                disabled={downloading === `zip-${month}`}
                style={{
                  background: '#1a1a1a', border: '1px solid #333', color: '#B9FF00',
                  borderRadius: 10, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  opacity: downloading === `zip-${month}` ? 0.5 : 1,
                }}>
                {downloading === `zip-${month}` ? 'Generujem...' : '↓ Stiahnuť všetky (ZIP)'}
              </button>
            </div>
            <div style={{ background: '#111', borderRadius: 14, overflow: 'hidden' }}>
              {byMonth[month].map((inv, i) => (
                <div key={inv.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderBottom: i < byMonth[month].length - 1 ? '1px solid #1e1e1e' : 'none',
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2, color: '#B9FF00' }}>{inv.invoiceNumber}</div>
                    <div style={{ fontSize: 13, color: '#fff', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.events.title}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{inv.attendeeName} · {inv.attendeeEmail}</div>
                  </div>
                  <div style={{ textAlign: 'right', marginLeft: 16, flexShrink: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>€{Number(inv.events.price).toFixed(2)}</div>
                    <button
                      onClick={() => downloadOne(inv)}
                      disabled={downloading === inv.id}
                      style={{
                        marginTop: 6, background: '#B9FF00', color: '#0a0a0a',
                        border: 'none', borderRadius: 8, padding: '5px 12px',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        opacity: downloading === inv.id ? 0.5 : 1,
                      }}>
                      {downloading === inv.id ? '...' : '↓ PDF'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
