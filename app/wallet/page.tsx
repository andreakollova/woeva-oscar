'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function WalletLoader() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');

  useEffect(() => {
    const event_id = searchParams.get('event_id');
    const token = searchParams.get('token');
    if (!event_id || !token) {
      setStatus('error');
      return;
    }
    // Small delay so the page renders before Safari navigates away
    const timer = setTimeout(() => {
      window.location.href = `/api/wallet-pass?event_id=${event_id}&token=${encodeURIComponent(token)}`;
      // After triggering download, show done state
      setTimeout(() => setStatus('done'), 2000);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchParams]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f0f0f',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '24px',
    }}>
      {/* Logo */}
      <div style={{
        width: 64,
        height: 64,
        backgroundColor: '#C9FF47',
        borderRadius: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
        fontSize: 28,
        fontWeight: 800,
        color: '#0f0f0f',
        letterSpacing: -1,
      }}>
        W
      </div>

      {status === 'error' ? (
        <>
          <p style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>Invalid link</p>
          <p style={{ color: '#888', fontSize: 14, marginTop: 8 }}>This ticket link is missing required info.</p>
        </>
      ) : status === 'done' ? (
        <>
          {/* Checkmark */}
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            backgroundColor: '#C9FF47',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}>
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="#0f0f0f" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>Ticket ready</p>
          <p style={{ color: '#888', fontSize: 14, marginTop: 8, textAlign: 'center', maxWidth: 260 }}>
            Tap <strong style={{ color: '#fff' }}>Add</strong> in the Apple Wallet prompt to save your ticket.
          </p>
        </>
      ) : (
        <>
          {/* Spinner */}
          <div style={{ marginBottom: 24 }}>
            <svg width={48} height={48} viewBox="0 0 48 48" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx={24} cy={24} r={20} stroke="#222" strokeWidth={4} />
              <path d="M24 4a20 20 0 0 1 20 20" stroke="#C9FF47" strokeWidth={4} strokeLinecap="round" />
            </svg>
          </div>
          <p style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>Preparing your ticket...</p>
          <p style={{ color: '#888', fontSize: 14, marginTop: 8, textAlign: 'center', maxWidth: 260 }}>
            Your Apple Wallet pass is being generated.
          </p>
        </>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#0f0f0f' }} />
    }>
      <WalletLoader />
    </Suspense>
  );
}
