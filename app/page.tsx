'use client';

import { useState, useEffect, useRef } from 'react';

type QueueItem = {
  id: string;
  photo_url: string;
  style: 'dark' | 'light';
  status: 'pending' | 'processing' | 'sent' | 'posted' | 'failed';
  position: number;
  created_at: string;
};

export default function Home() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadQueue() {
    const res = await fetch('/api/queue', { headers: { 'x-password': password } });
    if (res.ok) setQueue(await res.json());
  }

  useEffect(() => { if (authed) loadQueue(); }, [authed]);

  function checkPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password) { setAuthed(true); setError(''); }
    else setError('Zadaj heslo');
  }

  async function handleFiles(files: FileList) {
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('style', 'dark');
      await fetch('/api/upload', {
        method: 'POST',
        headers: { 'x-password': password },
        body: fd,
      });
    }
    setUploading(false);
    loadQueue();
    if (fileRef.current) fileRef.current.value = '';
  }

  async function toggleStyle(item: QueueItem) {
    await fetch(`/api/queue/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-password': password },
      body: JSON.stringify({ style: item.style === 'dark' ? 'light' : 'dark' }),
    });
    loadQueue();
  }

  async function deleteItem(id: string) {
    await fetch(`/api/queue/${id}`, {
      method: 'DELETE',
      headers: { 'x-password': password },
    });
    loadQueue();
  }

  async function moveItem(id: string, dir: 'up' | 'down') {
    const idx = queue.findIndex(q => q.id === id);
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === queue.length - 1) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    const swapItem = queue[swapIdx];
    await Promise.all([
      fetch(`/api/queue/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-password': password }, body: JSON.stringify({ position: swapItem.position }) }),
      fetch(`/api/queue/${swapItem.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-password': password }, body: JSON.stringify({ position: queue[idx].position }) }),
    ]);
    loadQueue();
  }

  async function triggerNow() {
    setLoading(true);
    const res = await fetch('/api/cron', {
      method: 'POST',
      headers: { 'x-password': password },
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) setError(data.error || 'Chyba');
    else { setError(''); loadQueue(); }
  }

  const pending = queue.filter(q => q.status === 'pending');
  const sent = queue.filter(q => q.status !== 'pending');

  if (!authed) {
    return (
      <main style={{ minHeight: '100vh', background: '#F7F7F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '360px' }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '20px', background: '#C8FF00', marginBottom: '16px', boxShadow: '0 4px 20px rgba(200,255,0,0.3)' }}>
              <span style={{ fontSize: '28px', fontWeight: 900, color: '#000', lineHeight: 1 }}>O</span>
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#111', margin: '0 0 6px', letterSpacing: '-0.5px' }}>Woeva Oscar</h1>
            <p style={{ fontSize: '14px', color: '#999', margin: 0 }}>Instagram content automation</p>
          </div>

          {/* Form */}
          <form onSubmit={checkPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="password"
              placeholder="Heslo"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#fff', border: '1.5px solid #E5E5E5', borderRadius: '14px',
                padding: '14px 16px', fontSize: '15px', color: '#111',
                outline: 'none', transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = '#C8FF00'}
              onBlur={e => e.target.style.borderColor = '#E5E5E5'}
            />
            {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: '0 4px' }}>{error}</p>}
            <button type="submit" style={{
              background: '#111', color: '#fff', border: 'none', borderRadius: '14px',
              padding: '14px', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}>
              Vstúpiť
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#F7F7F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: '60px' }}>
      <div style={{ width: '100%', maxWidth: '520px', margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '13px', background: '#C8FF00', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(200,255,0,0.25)' }}>
              <span style={{ fontSize: '18px', fontWeight: 900, color: '#000' }}>O</span>
            </div>
            <div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#111', lineHeight: 1.2 }}>Woeva Oscar</div>
              <div style={{ fontSize: '12px', color: '#999', marginTop: '1px' }}>
                {pending.length === 0 ? 'Front je prázdny' : `${pending.length} fotiek v rade`}
              </div>
            </div>
          </div>
          <button
            onClick={triggerNow}
            disabled={loading || pending.length === 0}
            style={{
              padding: '9px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 600,
              border: '1.5px solid #E5E5E5', background: '#fff', color: '#555',
              cursor: pending.length === 0 ? 'not-allowed' : 'pointer',
              opacity: pending.length === 0 ? 0.4 : 1, transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'Generujem...' : '▶ Spusti'}
          </button>
        </div>

        {error && (
          <div style={{ background: '#fff0f0', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', color: '#ef4444', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {/* Upload area */}
        <label
          style={{ display: 'block', cursor: 'pointer', marginBottom: '24px' }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
        >
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); }} />
          <div style={{
            background: dragOver ? '#f0fff0' : '#fff',
            border: `2px dashed ${dragOver ? '#C8FF00' : '#E5E5E5'}`,
            borderRadius: '18px', padding: '32px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
            transition: 'all 0.15s',
          }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#F7F7F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
              📷
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#333' }}>
                {uploading ? 'Nahrávam...' : 'Nahraj fotky'}
              </div>
              <div style={{ fontSize: '12px', color: '#aaa', marginTop: '3px' }}>
                Môžeš vybrať viac naraz alebo pretiahnuť sem
              </div>
            </div>
          </div>
        </label>

        {/* Pending queue */}
        {pending.length > 0 && (
          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px', paddingLeft: '2px' }}>
              Front · {pending.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pending.map((item, idx) => (
                <QueueRow key={item.id} item={item} idx={idx} total={pending.length}
                  onToggle={() => toggleStyle(item)}
                  onDelete={() => deleteItem(item.id)}
                  onMove={dir => moveItem(item.id, dir)}
                  isNext={idx === 0}
                />
              ))}
            </div>
          </div>
        )}

        {/* Sent/posted */}
        {sent.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px', paddingLeft: '2px' }}>
              Odoslané · {sent.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sent.map((item, idx) => (
                <QueueRow key={item.id} item={item} idx={idx} total={sent.length}
                  onToggle={() => {}} onDelete={() => deleteItem(item.id)}
                  onMove={() => {}} isNext={false} readOnly
                />
              ))}
            </div>
          </div>
        )}

        {queue.length === 0 && !uploading && (
          <div style={{ textAlign: 'center', color: '#bbb', fontSize: '14px', marginTop: '60px' }}>
            Nahraj prvé fotky a Oscar sa postará o zvyšok
          </div>
        )}
      </div>
    </main>
  );
}

function QueueRow({ item, idx, total, onToggle, onDelete, onMove, isNext, readOnly }: {
  item: QueueItem; idx: number; total: number;
  onToggle: () => void; onDelete: () => void;
  onMove: (dir: 'up' | 'down') => void;
  isNext: boolean; readOnly?: boolean;
}) {
  const statusConfig = {
    pending: { label: isNext ? 'Ďalšia' : 'Čaká', color: isNext ? '#111' : '#999', bg: isNext ? '#C8FF00' : '#F0F0F0' },
    processing: { label: 'Generuje...', color: '#111', bg: '#C8FF00' },
    sent: { label: 'V Discorde', color: '#555', bg: '#F0F0F0' },
    posted: { label: 'Postnuté', color: '#16a34a', bg: '#dcfce7' },
    failed: { label: 'Chyba', color: '#dc2626', bg: '#fee2e2' },
  }[item.status];

  return (
    <div style={{
      background: '#fff',
      border: `1.5px solid ${isNext ? '#C8FF00' : '#EFEFEF'}`,
      borderRadius: '16px', padding: '12px',
      display: 'flex', alignItems: 'center', gap: '12px',
      boxShadow: isNext ? '0 2px 12px rgba(200,255,0,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
      transition: 'all 0.15s',
    }}>
      {/* Thumbnail */}
      <div style={{ width: '52px', height: '52px', borderRadius: '12px', overflow: 'hidden', flexShrink: 0, background: '#F0F0F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={item.photo_url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{
            fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
            color: statusConfig?.color, background: statusConfig?.bg,
          }}>
            {statusConfig?.label}
          </span>
          <span style={{ fontSize: '11px', color: '#ccc', fontFamily: 'monospace' }}>#{idx + 1}</span>
        </div>
        {!readOnly ? (
          <button onClick={onToggle} style={{
            fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '8px', cursor: 'pointer',
            border: '1.5px solid #EFEFEF', background: item.style === 'dark' ? '#F7F7F7' : '#FFFBEB',
            color: item.style === 'dark' ? '#555' : '#B45309', transition: 'all 0.15s',
          }}>
            {item.style === 'dark' ? '🌑 Dark' : '☀️ Light'}
          </button>
        ) : (
          <span style={{ fontSize: '12px', color: '#bbb' }}>
            {item.style === 'dark' ? '🌑 Dark' : '☀️ Light'}
          </span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
        {!readOnly && (
          <>
            <button onClick={() => onMove('up')} disabled={idx === 0} style={{
              width: '30px', height: '30px', border: 'none', background: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer',
              color: '#ccc', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: idx === 0 ? 0.3 : 1, borderRadius: '8px', transition: 'all 0.15s',
            }}>↑</button>
            <button onClick={() => onMove('down')} disabled={idx === total - 1} style={{
              width: '30px', height: '30px', border: 'none', background: 'none', cursor: idx === total - 1 ? 'not-allowed' : 'pointer',
              color: '#ccc', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: idx === total - 1 ? 0.3 : 1, borderRadius: '8px', transition: 'all 0.15s',
            }}>↓</button>
          </>
        )}
        <button onClick={onDelete} style={{
          width: '30px', height: '30px', border: 'none', background: 'none', cursor: 'pointer',
          color: '#ddd', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '8px', transition: 'color 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#ddd')}
        >✕</button>
      </div>
    </div>
  );
}
