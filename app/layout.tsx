import './globals.css';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { SettingsProvider } from '@/components/settings-context';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'VoiceRx - "Any Agent You Want"',
  description: 'Build any voice agent for any industry using OpenAI Realtime API with dynamic config generation'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} min-h-screen bg-neutral-950 text-neutral-100 antialiased`}>
        <SettingsProvider>
          {children}
        </SettingsProvider>
      </body>
    </html>
  );
}
