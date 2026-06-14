'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function WalletLoader() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'ready' | 'added' | 'error'>('loading');
  const linkRef = useRef<HTMLAnchorElement>(null);
  const passUrlRef = useRef<string>('');

  useEffect(() => {
    const event_id = searchParams.get('event_id');
    const token = searchParams.get('token');
    if (!event_id || !token) { setStatus('error'); return; }

    passUrlRef.current = `/api/wallet-pass?event_id=${event_id}&token=${encodeURIComponent(token)}`;

    // Show spinner briefly, then show the download button
    const t = setTimeout(() => {
      setStatus('ready');
      // Auto-click the hidden <a> tag — on iOS this triggers "Add to Wallet"
      // as a download (page stays open), unlike window.location.href which navigates away
      setTimeout(() => {
        linkRef.current?.click();
        // After triggering, show "added" state so user sees confirmation
        setTimeout(() => setStatus('added'), 1200);
      }, 300);
    }, 900);
    return () => clearTimeout(t);
  }, [searchParams]);

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: '#0f0f0f',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: '24px',
    gap: '0',
  };

  return (
    <div style={containerStyle}>
      {/* Hidden link — iOS treats <a href=".pkpass"> as a download, keeps page open */}
      <a ref={linkRef} href={passUrlRef.current} style={{ display: 'none' }} aria-hidden="true" />

      {/* Logo */}
      <img src="/assets/mainlogoapp.png" alt="Woeva" style={{ height: 36, width: 'auto', marginBottom: 40 }} />

      {status === 'error' && (
        <>
          <p style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>Neplatný odkaz</p>
          <p style={{ color: '#888', fontSize: 14, marginTop: 8 }}>Tento odkaz na lístok chýba potrebné informácie.</p>
        </>
      )}

      {status === 'loading' && (
        <>
          <div style={{ marginBottom: 24 }}>
            <svg width={48} height={48} viewBox="0 0 48 48" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx={24} cy={24} r={20} stroke="#222" strokeWidth={4} />
              <path d="M24 4a20 20 0 0 1 20 20" stroke="#C9FF47" strokeWidth={4} strokeLinecap="round" />
            </svg>
          </div>
          <p style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>Pripravujeme tvoj lístok...</p>
          <p style={{ color: '#888', fontSize: 14, marginTop: 8, textAlign: 'center', maxWidth: 260 }}>
            Generujeme tvoj Apple Wallet lístok.
          </p>
        </>
      )}

      {status === 'ready' && (
        <>
          <div style={{ marginBottom: 24 }}>
            <svg width={48} height={48} viewBox="0 0 48 48" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx={24} cy={24} r={20} stroke="#222" strokeWidth={4} />
              <path d="M24 4a20 20 0 0 1 20 20" stroke="#C9FF47" strokeWidth={4} strokeLinecap="round" />
            </svg>
          </div>
          <p style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>Otvárame Apple Wallet...</p>
          <p style={{ color: '#888', fontSize: 14, marginTop: 8, textAlign: 'center', maxWidth: 260 }}>
            Klikni <strong style={{ color: '#fff' }}>Pridať</strong> keď sa zobrazí výzva.
          </p>
        </>
      )}

      {status === 'added' && (
        <>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', backgroundColor: '#C9FF47',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
          }}>
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="#0f0f0f" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>Lístok pridaný do Peňaženky</p>
          <p style={{ color: '#888', fontSize: 14, marginTop: 8, marginBottom: 32, textAlign: 'center', maxWidth: 260 }}>
            Nájdeš ho v Apple Peňaženke kedykoľvek.
          </p>
          <a
            href="woeva://"
            style={{
              backgroundColor: '#C9FF47', color: '#0f0f0f', fontWeight: 700,
              fontSize: 15, padding: '14px 32px', borderRadius: 50,
              textDecoration: 'none', display: 'inline-block',
            }}
          >
            Späť do Woeva
          </a>
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0f0f0f' }} />}>
      <WalletLoader />
    </Suspense>
  );
}
