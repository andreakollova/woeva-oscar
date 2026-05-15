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
  const fileRef = useRef<HTMLInputElement>(null);

  const input = "w-full bg-[#141414] border border-[#222] rounded-2xl px-4 py-3.5 text-white placeholder-[#555] focus:outline-none focus:border-[#C8FF00] transition-colors text-[15px]";

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
      <main className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-5">
        <div className="w-full max-w-[360px]">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#C8FF00] mb-5">
              <span className="text-2xl font-black text-black">O</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Woeva Oscar</h1>
            <p className="text-[#555] text-sm mt-1">Instagram automation</p>
          </div>
          <form onSubmit={checkPassword} className="space-y-3">
            <input type="password" placeholder="Heslo" value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              className={input} autoFocus />
            {error && <p className="text-red-400 text-sm px-1">{error}</p>}
            <button type="submit" className="w-full bg-[#C8FF00] text-black font-bold py-3.5 rounded-2xl hover:bg-[#b4e800] transition-all text-[15px]">
              Vstúpiť
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0A0A0A] p-5 pt-10 pb-16">
      <div className="w-full max-w-[480px] mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#C8FF00] flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-black text-black">O</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">Woeva Oscar</h1>
              <p className="text-[#555] text-xs">{pending.length} fotiek v rade</p>
            </div>
          </div>
          <button onClick={triggerNow} disabled={loading || pending.length === 0}
            className="px-4 py-2 bg-[#1a1a1a] border border-[#333] text-[#888] text-sm rounded-xl hover:border-[#C8FF00]/40 hover:text-white disabled:opacity-30 transition-all">
            {loading ? 'Generujem...' : '▶ Spusti teraz'}
          </button>
        </div>

        {error && <p className="text-red-400 text-sm mb-4 px-1">{error}</p>}

        {/* Upload */}
        <label className="cursor-pointer block mb-6">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); }} />
          <div className="border border-dashed border-[#333] rounded-2xl py-5 px-4 flex items-center justify-center gap-3 hover:border-[#C8FF00]/40 transition-colors">
            <span className="text-2xl">📷</span>
            <span className="text-[#555] text-sm">
              {uploading ? 'Nahrávam...' : 'Nahraj fotky (môžeš vybrať viac naraz)'}
            </span>
          </div>
        </label>

        {/* Queue */}
        {pending.length > 0 && (
          <>
            <p className="text-[#555] text-xs uppercase tracking-widest px-1 mb-3">Front ({pending.length})</p>
            <div className="space-y-2 mb-8">
              {pending.map((item, idx) => (
                <QueueRow key={item.id} item={item} idx={idx} total={pending.length}
                  onToggle={() => toggleStyle(item)}
                  onDelete={() => deleteItem(item.id)}
                  onMove={dir => moveItem(item.id, dir)}
                  isNext={idx === 0}
                />
              ))}
            </div>
          </>
        )}

        {/* Sent/posted */}
        {sent.length > 0 && (
          <>
            <p className="text-[#555] text-xs uppercase tracking-widest px-1 mb-3">Odoslané</p>
            <div className="space-y-2">
              {sent.map((item, idx) => (
                <QueueRow key={item.id} item={item} idx={idx} total={sent.length}
                  onToggle={() => {}}
                  onDelete={() => deleteItem(item.id)}
                  onMove={() => {}}
                  isNext={false}
                  readOnly
                />
              ))}
            </div>
          </>
        )}

        {queue.length === 0 && !uploading && (
          <p className="text-center text-[#444] text-sm mt-16">Front je prázdny — nahraj fotky</p>
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
  const statusColor = {
    pending: isNext ? '#C8FF00' : '#555',
    processing: '#C8FF00',
    sent: '#888',
    posted: '#22c55e',
    failed: '#ef4444',
  }[item.status];

  const statusLabel = {
    pending: isNext ? 'Dalsia' : 'Caka',
    processing: 'Generujem...',
    sent: 'V Discorde',
    posted: 'Postnuté',
    failed: 'Chyba',
  }[item.status];

  return (
    <div className={`bg-[#141414] border rounded-2xl p-3 flex items-center gap-3 ${isNext ? 'border-[#C8FF00]/30' : 'border-[#222]'}`}>
      {/* Thumb */}
      <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-[#222]">
        <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono text-[#444]">#{idx + 1}</span>
          <span style={{ color: statusColor }} className="text-xs font-semibold">{statusLabel}</span>
        </div>
        {!readOnly ? (
          <button onClick={onToggle}
            className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${
              item.style === 'dark'
                ? 'bg-[#1a1a1a] text-[#888] border border-[#333] hover:border-[#555]'
                : 'bg-[#fffbe6]/10 text-[#ffd700] border border-[#ffd700]/30 hover:border-[#ffd700]/60'
            }`}>
            {item.style === 'dark' ? '🌑 Dark' : '☀️ Light'}
          </button>
        ) : (
          <span className={`text-xs px-2 py-0.5 rounded-lg ${item.style === 'dark' ? 'text-[#555]' : 'text-[#888]'}`}>
            {item.style === 'dark' ? '🌑 Dark' : '☀️ Light'}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {!readOnly && (
          <>
            <button onClick={() => onMove('up')} disabled={idx === 0}
              className="w-7 h-7 flex items-center justify-center text-[#444] hover:text-[#888] disabled:opacity-20 transition-colors text-xs">↑</button>
            <button onClick={() => onMove('down')} disabled={idx === total - 1}
              className="w-7 h-7 flex items-center justify-center text-[#444] hover:text-[#888] disabled:opacity-20 transition-colors text-xs">↓</button>
          </>
        )}
        <button onClick={onDelete}
          className="w-7 h-7 flex items-center justify-center text-[#333] hover:text-red-400 transition-colors text-xs">✕</button>
      </div>
    </div>
  );
}
