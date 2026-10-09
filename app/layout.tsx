import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'AHL Task Manager',
  description: 'AHL Delegation & Task Management System',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'AHL Tasks',
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}

