'use client';

import { useState, useEffect, useRef } from 'react';

type QueueItem = {
  id: string;
  photo_url: string;
  type: 'lifestyle' | 'animation' | 'event' | 'reel';
  status: 'pending' | 'processing' | 'sent' | 'posted' | 'failed';
  position: number;
  caption: string | null;
  created_at: string;
};

type UploadTab = 'lifestyle' | 'animation' | 'event' | 'reel';

const TYPE_META = {
  lifestyle: { label: 'Lifestyle', emoji: '🖼', badgeBg: '#C8FF00', badgeColor: '#111' },
  animation: { label: 'Animacia', emoji: '🎬', badgeBg: '#1a1a1a', badgeColor: '#C8FF00' },
  event:     { label: 'Event',    emoji: '📸', badgeBg: '#818cf8', badgeColor: '#fff' },
  reel:      { label: 'Reel',     emoji: '🎞', badgeBg: '#f472b6', badgeColor: '#fff' },
} as const;

function formatSlot(daysOffset: number, time: string): string {
  if (daysOffset === 0) return `Dnes · ${time}`;
  if (daysOffset === 1) return `Zajtra · ${time}`;
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toLocaleDateString('sk-SK', { weekday: 'short', day: 'numeric', month: 'numeric' }) + ` · ${time}`;
}

export default function Home() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAnim, setLoadingAnim] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [dragOverFile, setDragOverFile] = useState(false);
  const [tab, setTab] = useState<UploadTab>('lifestyle');
  const [captionText, setCaptionText] = useState('');
  const [savingCaptions, setSavingCaptions] = useState(false);
  const [captionCounts, setCaptionCounts] = useState({ lifestyle: 0, animation: 0 });
  const [reelCaption, setReelCaption] = useState('');
  const [planDragId, setPlanDragId] = useState<string | null>(null);
  const [planDragOverId, setPlanDragOverId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadQueue() {
    const res = await fetch('/api/queue', { headers: { 'x-password': password } });
    if (res.ok) setQueue(await res.json());
  }

  async function loadCaptionCounts() {
    const res = await fetch('/api/upload-caption', { headers: { 'x-password': password } });
    if (res.ok) setCaptionCounts(await res.json());
  }

  useEffect(() => {
    if (authed) { loadQueue(); loadCaptionCounts(); }
  }, [authed]);

  function checkPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password) { setAuthed(true); setError(''); }
    else setError('Zadaj heslo');
  }

  async function handleFiles(files: FileList) {
    setFileUploading(true);
    setError('');

    if (tab === 'event') {
      const fd = new FormData();
      fd.append('file', files[0]);
      const res = await fetch('/api/upload-event', { method: 'POST', headers: { 'x-password': password }, body: fd });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Chyba');
    } else if (tab === 'reel') {
      const fd = new FormData();
      fd.append('file', files[0]);
      fd.append('caption', reelCaption);
      const res = await fetch('/api/upload-reel', { method: 'POST', headers: { 'x-password': password }, body: fd });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Chyba');
      else setReelCaption('');
    } else {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        await fetch('/api/upload', { method: 'POST', headers: { 'x-password': password }, body: fd });
      }
    }

    setFileUploading(false);
    loadQueue();
    if (fileRef.current) fileRef.current.value = '';
  }

  async function saveCaptions() {
    if (!captionText.trim()) return;
    setSavingCaptions(true);
    const captions = captionText.split('---').map(c => c.trim()).filter(Boolean);
    const res = await fetch('/api/upload-caption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-password': password },
      body: JSON.stringify({ captions, type: tab === 'animation' ? 'animation' : 'lifestyle' }),
    });
    const data = await res.json();
    setSavingCaptions(false);
    if (res.ok) { setCaptionText(''); loadCaptionCounts(); }
    else setError(data.error || 'Chyba');
  }

  async function deleteItem(id: string) {
    await fetch(`/api/queue/${id}`, { method: 'DELETE', headers: { 'x-password': password } });
    loadQueue();
  }

  async function triggerNow() {
    const isAnim = tab === 'animation';
    const setter = isAnim ? setLoadingAnim : setLoading;
    setter(true);
    const res = await fetch(isAnim ? '/api/cron-animation' : '/api/cron', {
      method: 'POST', headers: { 'x-password': password },
    });
    const data = await res.json();
    setter(false);
    if (!res.ok) setError(data.error || 'Chyba');
    else { setError(''); loadQueue(); loadCaptionCounts(); }
  }

  async function handlePlanDrop(targetId: string) {
    if (!planDragId || planDragId === targetId) { setPlanDragId(null); setPlanDragOverId(null); return; }
    const dragged = queue.find(q => q.id === planDragId);
    const target = queue.find(q => q.id === targetId);
    if (!dragged || !target || dragged.type !== target.type) { setPlanDragId(null); setPlanDragOverId(null); return; }

    const typeItems = queue
      .filter(q => q.type === dragged.type && q.status === 'pending')
      .sort((a, b) => a.position - b.position);

    const fromIdx = typeItems.findIndex(q => q.id === planDragId);
    const toIdx = typeItems.findIndex(q => q.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setPlanDragId(null); setPlanDragOverId(null); return; }

    const reordered = [...typeItems];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, typeItems[fromIdx]);

    setPlanDragId(null);
    setPlanDragOverId(null);

    await Promise.all(
      reordered.map((item, idx) =>
        fetch(`/api/queue/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-password': password },
          body: JSON.stringify({ position: idx }),
        })
      )
    );
    loadQueue();
  }

  // Compute plan items (pending lifestyle + animation interleaved by expected time)
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const lifestyleRanToday = utcH > 7 || (utcH === 7 && utcM >= 15);
  const animationRanToday = utcH >= 13;

  const lifestylePending = queue
    .filter(q => q.type === 'lifestyle' && q.status === 'pending')
    .sort((a, b) => a.position - b.position)
    .map((item, idx) => {
      const d = lifestyleRanToday ? idx + 1 : idx;
      return { item, slot: formatSlot(d, '9:15'), sortKey: d * 2 };
    });

  const animationPending = queue
    .filter(q => q.type === 'animation' && q.status === 'pending')
    .sort((a, b) => a.position - b.position)
    .map((item, idx) => {
      const d = animationRanToday ? idx + 1 : idx;
      return { item, slot: formatSlot(d, '15:00'), sortKey: d * 2 + 1 };
    });

  const planItems = [...lifestylePending, ...animationPending].sort((a, b) => a.sortKey - b.sortKey);
  const discordItems = queue
    .filter(q => q.status === 'sent')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const pendingForTab = queue.filter(q => q.type === tab && q.status === 'pending').sort((a, b) => a.position - b.position);
  const captionCount = tab === 'animation' ? captionCounts.animation : captionCounts.lifestyle;

  if (!authed) {
    return (
      <main style={{ minHeight: '100vh', background: '#F7F7F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '360px' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '20px', background: '#C8FF00', marginBottom: '16px', boxShadow: '0 4px 20px rgba(200,255,0,0.3)' }}>
              <span style={{ fontSize: '28px', fontWeight: 900, color: '#000', lineHeight: 1 }}>O</span>
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#111', margin: '0 0 6px', letterSpacing: '-0.5px' }}>Woeva Oscar</h1>
            <p style={{ fontSize: '14px', color: '#999', margin: 0 }}>Instagram content automation</p>
          </div>
          <form onSubmit={checkPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="password" placeholder="Heslo" value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: '1.5px solid #E5E5E5', borderRadius: '14px', padding: '14px 16px', fontSize: '15px', color: '#111', outline: 'none' }}
              onFocus={e => e.target.style.borderColor = '#C8FF00'}
              onBlur={e => e.target.style.borderColor = '#E5E5E5'}
            />
            {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: '0 4px' }}>{error}</p>}
            <button type="submit" style={{ background: '#111', color: '#fff', border: 'none', borderRadius: '14px', padding: '14px', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
              Vstúpit
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
                {planItems.length === 0 ? 'Plán je prázdny' : `${planItems.length} naplánovaných`}
                {discordItems.length > 0 && ` · ${discordItems.length} v Discorde`}
              </div>
            </div>
          </div>
          <button onClick={loadQueue} style={{ width: '34px', height: '34px', border: '1.5px solid #E5E5E5', background: '#fff', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
            ↻
          </button>
        </div>

        {error && (
          <div style={{ background: '#fff0f0', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', color: '#ef4444', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {/* Content Plan */}
        {planItems.length > 0 && (
          <section style={{ marginBottom: '24px' }}>
            <SectionLabel text={`Plan · ${planItems.length}`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {planItems.map(({ item, slot }) => {
                const draggedItem = planDragId ? queue.find(q => q.id === planDragId) : null;
                const canDrop = !draggedItem || draggedItem.type === item.type;
                const isDragOver = planDragOverId === item.id && canDrop;
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setPlanDragId(item.id)}
                    onDragOver={e => { e.preventDefault(); if (canDrop) setPlanDragOverId(item.id); }}
                    onDragLeave={() => setPlanDragOverId(null)}
                    onDrop={() => handlePlanDrop(item.id)}
                    onDragEnd={() => { setPlanDragId(null); setPlanDragOverId(null); }}
                    style={{
                      background: '#fff',
                      border: `1.5px solid ${isDragOver ? '#C8FF00' : planDragId === item.id ? '#ddd' : '#EFEFEF'}`,
                      borderRadius: '14px', padding: '10px 12px',
                      display: 'flex', alignItems: 'center', gap: '10px',
                      opacity: planDragId === item.id ? 0.4 : 1,
                      cursor: 'grab', transition: 'all 0.1s',
                      boxShadow: isDragOver ? '0 2px 12px rgba(200,255,0,0.2)' : '0 1px 3px rgba(0,0,0,0.04)',
                    }}
                  >
                    {/* Drag handle */}
                    <span style={{ fontSize: '14px', color: '#ccc', userSelect: 'none', flexShrink: 0 }}>⠿</span>

                    {/* Thumbnail */}
                    <div style={{ width: '40px', height: '40px', borderRadius: '9px', overflow: 'hidden', flexShrink: 0, background: '#F0F0F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.type === 'animation' ? (
                        <span style={{ fontSize: '18px' }}>🎬</span>
                      ) : (
                        <img src={item.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: TYPE_META[item.type].badgeBg, color: TYPE_META[item.type].badgeColor, flexShrink: 0 }}>
                          {TYPE_META[item.type].label}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#555', fontWeight: 500 }}>{slot}</div>
                    </div>

                    {/* Delete */}
                    <button onClick={() => deleteItem(item.id)} style={{ width: '28px', height: '28px', border: 'none', background: 'none', cursor: 'pointer', color: '#ddd', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '7px', transition: 'color 0.15s', flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#ddd')}
                    >✕</button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Discord queue */}
        {discordItems.length > 0 && (
          <section style={{ marginBottom: '24px' }}>
            <SectionLabel text={`V Discorde · ${discordItems.length}`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {discordItems.map(item => (
                <DiscordRow
                  key={item.id} item={item} password={password}
                  onDelete={() => deleteItem(item.id)}
                  onRefresh={() => { loadQueue(); loadCaptionCounts(); }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Divider */}
        <div style={{ height: '1px', background: '#EBEBEB', marginBottom: '20px' }} />

        {/* Upload Tabs */}
        <div style={{ background: '#EFEFEF', borderRadius: '12px', padding: '4px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '3px', marginBottom: '16px' }}>
          {(['lifestyle', 'animation', 'event', 'reel'] as UploadTab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setCaptionText(''); setReelCaption(''); if (fileRef.current) fileRef.current.value = ''; }}
              style={{
                padding: '7px 4px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                fontSize: '11px', fontWeight: 600, transition: 'all 0.15s',
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? '#111' : '#888',
                boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                whiteSpace: 'nowrap',
              }}>
              {TYPE_META[t].emoji} {t === 'lifestyle' ? 'Lifestyle' : t === 'animation' ? 'Animacia' : t === 'event' ? 'Event' : 'Reel'}
            </button>
          ))}
        </div>

        {/* Reel caption input */}
        {tab === 'reel' && (
          <div style={{ marginBottom: '12px', background: '#fff', border: '1.5px solid #EFEFEF', borderRadius: '18px', padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', marginBottom: '8px' }}>✏️ Popis reelu</div>
            <textarea
              value={reelCaption}
              onChange={e => setReelCaption(e.target.value)}
              placeholder="Napíš popis reelu..."
              rows={4}
              style={{
                width: '100%', boxSizing: 'border-box', border: '1.5px solid #F0F0F0', borderRadius: '12px',
                padding: '12px', fontSize: '13px', color: '#333', lineHeight: 1.5,
                resize: 'vertical', outline: 'none', background: '#FAFAFA',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}
              onFocus={e => e.target.style.borderColor = '#C8FF00'}
              onBlur={e => e.target.style.borderColor = '#F0F0F0'}
            />
          </div>
        )}

        {/* File upload area */}
        <label
          style={{ display: 'block', cursor: 'pointer', marginBottom: '12px' }}
          onDragOver={e => { e.preventDefault(); setDragOverFile(true); }}
          onDragLeave={() => setDragOverFile(false)}
          onDrop={e => { e.preventDefault(); setDragOverFile(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
        >
          <input ref={fileRef} type="file"
            accept={tab === 'animation' || tab === 'reel' ? 'video/*' : 'image/*'}
            multiple={tab === 'lifestyle' || tab === 'animation'}
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); }}
          />
          <div style={{
            background: dragOverFile ? '#f0fff0' : '#fff',
            border: `2px dashed ${dragOverFile ? '#C8FF00' : '#E5E5E5'}`,
            borderRadius: '18px', padding: '28px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
            transition: 'all 0.15s',
          }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: '#F7F7F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
              {tab === 'animation' || tab === 'reel' ? '🎬' : tab === 'event' ? '📸' : '🖼'}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#333' }}>
                {fileUploading
                  ? (tab === 'event' ? 'Generujem popis...' : 'Nahravam...')
                  : tab === 'lifestyle' ? 'Nahraj fotky'
                  : tab === 'animation' ? 'Nahraj videa'
                  : tab === 'event' ? 'Nahraj screenshot eventu'
                  : 'Nahraj video reelu'}
              </div>
              <div style={{ fontSize: '12px', color: '#aaa', marginTop: '3px' }}>
                {tab === 'event'
                  ? 'AI vygeneruje popis a posle do Discordu'
                  : tab === 'reel'
                  ? 'Posle sa do Discordu s tvojim popisom'
                  : 'Môzes vybrat viac naraz alebo pretiahnút sem'}
              </div>
            </div>
          </div>
        </label>

        {/* Caption pool (lifestyle / animation) */}
        {(tab === 'lifestyle' || tab === 'animation') && (
          <div style={{ marginBottom: '16px', background: '#fff', border: '1.5px solid #EFEFEF', borderRadius: '18px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>
                ✏️ Popisy {captionCount > 0 && <span style={{ background: '#C8FF00', color: '#111', borderRadius: '6px', padding: '1px 7px', fontSize: '11px', fontWeight: 700, marginLeft: '6px' }}>{captionCount} volnych</span>}
              </div>
              <button onClick={saveCaptions} disabled={savingCaptions || !captionText.trim()} style={{
                fontSize: '12px', fontWeight: 700, padding: '5px 14px', borderRadius: '8px', border: 'none',
                background: captionText.trim() ? '#111' : '#E5E5E5',
                color: captionText.trim() ? '#fff' : '#aaa',
                cursor: captionText.trim() ? 'pointer' : 'not-allowed',
              }}>
                {savingCaptions ? 'Ukladam...' : 'Ulozit'}
              </button>
            </div>
            <textarea
              value={captionText} onChange={e => setCaptionText(e.target.value)}
              placeholder={`Vloz popisy — oddel pomocou ---`}
              rows={5}
              style={{
                width: '100%', boxSizing: 'border-box', border: '1.5px solid #F0F0F0', borderRadius: '12px',
                padding: '12px', fontSize: '13px', color: '#333', lineHeight: 1.5,
                resize: 'vertical', outline: 'none', background: '#FAFAFA',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}
              onFocus={e => e.target.style.borderColor = '#C8FF00'}
              onBlur={e => e.target.style.borderColor = '#F0F0F0'}
            />
            <div style={{ fontSize: '11px', color: '#bbb' }}>Kazdy popis oddel pomocou <strong>---</strong> na novom riadku</div>
          </div>
        )}

        {/* Trigger button (lifestyle / animation) */}
        {(tab === 'lifestyle' || tab === 'animation') && (
          <button
            onClick={triggerNow}
            disabled={(tab === 'animation' ? loadingAnim : loading) || pendingForTab.length === 0}
            style={{
              width: '100%', padding: '13px', borderRadius: '14px', fontSize: '14px', fontWeight: 700,
              border: '1.5px solid #E5E5E5', background: '#fff', color: '#555', cursor: pendingForTab.length === 0 ? 'not-allowed' : 'pointer',
              opacity: pendingForTab.length === 0 ? 0.4 : 1, marginBottom: '28px',
            }}
          >
            {(tab === 'animation' ? loadingAnim : loading) ? 'Posielam...' : `▶ Spusti ${tab === 'animation' ? 'Animaciu' : 'Lifestyle'} teraz`}
          </button>
        )}
      </div>
    </main>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: 700, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px', paddingLeft: '2px' }}>
      {text}
    </div>
  );
}

function DiscordRow({ item, password, onDelete, onRefresh }: {
  item: QueueItem;
  password: string;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const [regenning, setRegenning] = useState(false);
  const meta = TYPE_META[item.type];
  const isVideo = item.type === 'animation' || item.type === 'reel';

  async function regenCaption() {
    setRegenning(true);
    await fetch('/api/regenerate-caption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-password': password },
      body: JSON.stringify({ itemId: item.id }),
    });
    setRegenning(false);
    onRefresh();
  }

  return (
    <div style={{
      background: '#fff', border: '1.5px solid #EFEFEF', borderRadius: '14px', padding: '10px 12px',
      display: 'flex', alignItems: 'center', gap: '10px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Thumbnail */}
      <div style={{ width: '40px', height: '40px', borderRadius: '9px', overflow: 'hidden', flexShrink: 0, background: '#F0F0F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isVideo ? (
          <span style={{ fontSize: '18px' }}>{meta.emoji}</span>
        ) : (
          <img src={item.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: meta.badgeBg, color: meta.badgeColor, flexShrink: 0 }}>
            {meta.label}
          </span>
          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', background: '#F0F0F0', color: '#555' }}>
            Discord
          </span>
        </div>
        {item.caption && (
          <div style={{ fontSize: '11px', color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>
            {item.caption.replace(/\n/g, ' ')}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        {item.type !== 'reel' && (
          <button onClick={regenCaption} disabled={regenning} style={{
            fontSize: '11px', padding: '4px 9px', borderRadius: '7px', cursor: 'pointer',
            border: '1.5px solid #E5E5E5', background: '#fff', color: '#888',
            opacity: regenning ? 0.5 : 1,
          }}>
            {regenning ? '...' : '↺'}
          </button>
        )}
        <button onClick={onDelete} style={{ width: '28px', height: '28px', border: 'none', background: 'none', cursor: 'pointer', color: '#ddd', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '7px', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#ddd')}
        >✕</button>
      </div>
    </div>
  );
}
