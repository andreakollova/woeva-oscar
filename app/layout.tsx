import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Woeva Oscar',
  description: 'Instagram content automation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
