import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { UserProvider } from '@/components/context/UserContext';
import AppLayout from '@/components/layout/AppLayout';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'BILSEN Review System',
  description: 'Manage paper reviews and coordinators workflow.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-background text-foreground antialiased`}>
        <UserProvider>
          <AppLayout>
            {children}
          </AppLayout>
        </UserProvider>
      </body>
    </html>
  );
}
