'use client';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function ChatRedirect() {
  const { eventId } = useParams<{ eventId: string }>();

  useEffect(() => {
    window.location.href = `woeva://chat/${eventId}`;
  }, [eventId]);

  return (
    <div style={{ fontFamily: 'sans-serif', textAlign: 'center', paddingTop: 80 }}>
      <p>Opening Woeva...</p>
      <p style={{ fontSize: 13, color: '#888', marginTop: 12 }}>
        If the app doesn&apos;t open,{' '}
        <a href="https://woeva.com">download Woeva</a>.
      </p>
    </div>
  );
}
