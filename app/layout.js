import './globals.css';
import { Toaster } from 'sonner';

export const metadata = {
  title: 'Cmail — the inbox that knows what matters',
  description: 'AI-powered Gmail summarizer that ranks importance, extracts todos, and builds a calendar.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
