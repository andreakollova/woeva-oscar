'use client';
import { useEffect, useState } from 'react';

const APP_STORE_URL = 'https://apps.apple.com/sk/app/woeva/id6767314046?l=sk';

function formatDate(date?: string, time?: string) {
  if (!date) return '';
  const d = new Date(date + 'T00:00:00');
  const dateStr = d.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const cap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  return time ? `${cap} · ${time.slice(0, 5)}` : cap;
}

export default function EventClientPage({ event, id }: { event: any; id: string }) {
  const [status, setStatus] = useState<'idle' | 'trying' | 'noapp'>('idle');

  useEffect(() => {
    // Auto-try deep link on load
    tryOpen();
  }, []);

  function tryOpen() {
    setStatus('trying');
    const start = Date.now();
    window.location.href = `woeva://event/${id}`;
    const timer = setTimeout(() => {
      // If we're still here after 1.8s, app is not installed
      if (Date.now() - start < 3000) {
        setStatus('noapp');
      }
    }, 1800);
    // If page hides (app opened), clear timer
    const onBlur = () => clearTimeout(timer);
    window.addEventListener('blur', onBlur, { once: true });
  }

  const venue = [event?.venue, event?.city].filter(Boolean).join(', ');
  const price = event?.is_free ? 'Zadarmo' : event?.price > 0 ? `€${Number(event.price).toFixed(2)}` : null;

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: '#0f0f0f',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: '0',
  };

  return (
    <div style={containerStyle}>
      {/* Cover image */}
      {event?.cover_url && (
        <div style={{ width: '100%', maxWidth: 480, height: 280, overflow: 'hidden', position: 'relative' }}>
          <img src={event.cover_url} alt={event?.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, #0f0f0f 100%)' }} />
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 480, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Logo */}
        <img src="/assets/mainlogoapp.png" alt="Woeva" style={{ height: 28, width: 'auto', marginBottom: 20 }} />

        {/* Title */}
        <h1 style={{ margin: '0 0 12px', fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: -0.5, lineHeight: 1.1 }}>
          {event?.title ?? 'Event'}
        </h1>

        {/* Meta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {event?.date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>📅</span>
              <span style={{ fontSize: 14, color: '#aaa' }}>{formatDate(event.date, event.time)}</span>
            </div>
          )}
          {venue && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>📍</span>
              <span style={{ fontSize: 14, color: '#aaa' }}>{venue}</span>
            </div>
          )}
          {price && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>🎟️</span>
              <span style={{ fontSize: 14, color: '#C9FF47', fontWeight: 600 }}>{price}</span>
            </div>
          )}
        </div>

        {/* CTA */}
        {status === 'noapp' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: '#888', fontSize: 14, margin: '0 0 4px', textAlign: 'center' }}>
              Stiahni si Woeva appku a pridaj sa na tento event.
            </p>
            <a
              href={APP_STORE_URL}
              style={{
                backgroundColor: '#C9FF47', color: '#0f0f0f', fontWeight: 700,
                fontSize: 16, padding: '16px', borderRadius: 50, textDecoration: 'none',
                textAlign: 'center', display: 'block',
              }}
            >
              Stiahnuť Woeva na iPhone
            </a>
            <button
              onClick={tryOpen}
              style={{
                backgroundColor: 'transparent', color: '#888', fontWeight: 500,
                fontSize: 14, padding: '12px', borderRadius: 50, border: '1px solid #333',
                cursor: 'pointer',
              }}
            >
              Mám appku → Otvoriť event
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            {status === 'trying' && (
              <p style={{ color: '#888', fontSize: 14, margin: 0 }}>Otvárame v appke...</p>
            )}
            <button
              onClick={tryOpen}
              style={{
                backgroundColor: '#C9FF47', color: '#0f0f0f', fontWeight: 700,
                fontSize: 16, padding: '16px', borderRadius: 50, border: 'none',
                cursor: 'pointer', width: '100%',
              }}
            >
              Otvoriť v Woeva appke
            </button>
            <a
              href={APP_STORE_URL}
              style={{ color: '#555', fontSize: 13, textDecoration: 'none' }}
            >
              Nemám appku → Stiahnuť zadarmo
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
