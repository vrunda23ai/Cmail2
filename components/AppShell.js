'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { Inbox, LayoutDashboard, ListTodo, Calendar, LogOut } from 'lucide-react';

export default function AppShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabaseBrowser();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    // Give the SSR cookies a moment to hydrate on first paint after the
    // OAuth callback. If we still have no session after a short poll, then
    // redirect to /auth. This prevents the "signed in but bounced back" loop.
    async function check() {
      const start = Date.now();
      while (!cancelled && Date.now() - start < 3000) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setUser(data.session.user);
          setLoading(false);
          return;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!cancelled) router.replace('/auth');
    }
    check();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) { setUser(session.user); setLoading(false); }
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const nav = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/inbox', label: 'Inbox', icon: Inbox },
    { href: '/todos', label: 'Todos', icon: ListTodo },
    { href: '/calendar', label: 'Calendar', icon: Calendar },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card p-4 md:block">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Inbox className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">Cmail</span>
        </Link>
        <nav className="space-y-1">
          {nav.map(({ href, label, icon: I }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${pathname === href ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`}>
              <I className="h-4 w-4" /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-border pt-4">
          <div className="px-3 pb-2 text-xs text-muted-foreground truncate">{user?.email}</div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.replace('/'); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
