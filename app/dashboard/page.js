'use client';
import useSWR from 'swr';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { format, isSameDay } from 'date-fns';
import { Sparkles, ListTodo, Calendar as CalIcon, ArrowUpRight } from 'lucide-react';

const fetcher = (u) => fetch(u).then((r) => r.json());

export default function Dashboard() {
  const { data: emails = [] } = useSWR('/api/emails', fetcher);
  const { data: todos = [] } = useSWR('/api/todos', fetcher);
  const { data: events = [] } = useSWR('/api/events', fetcher);

  const important = (Array.isArray(emails) ? emails : []).filter((e) => e.is_important).slice(0, 5);
  const openTodos = (Array.isArray(todos) ? todos : []).filter((t) => !t.done).slice(0, 5);
  const today = new Date();
  const todaysEvents = (Array.isArray(events) ? events : []).filter((e) => isSameDay(new Date(e.starts_at), today));
  const hasAny = (emails || []).length > 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div>
          <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, MMMM d')}</p>
          <h1 className="mt-1 text-4xl font-medium italic">Good to see you.</h1>
        </div>

        {!hasAny ? (
          <div className="mt-10 card-surface p-10 text-center">
            <p className="text-sm text-muted-foreground">Nothing here yet. <Link href="/inbox" className="text-primary underline">Connect Gmail or load a demo</Link>.</p>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <Card title="Important today" icon={Sparkles} href="/inbox">
              {important.length === 0 && <Muted>Nothing flagged right now.</Muted>}
              {important.map((e) => (
                <div key={e.id} className="border-b border-border py-3 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{e.subject || '(no subject)'}</span>
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{Math.round(Number(e.importance_score))}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.summary || e.snippet}</p>
                </div>
              ))}
            </Card>

            <Card title="Open todos" icon={ListTodo} href="/todos">
              {openTodos.length === 0 && <Muted>All caught up.</Muted>}
              {openTodos.map((t) => (
                <div key={t.id} className="flex items-center justify-between border-b border-border py-2.5 last:border-0">
                  <span className="truncate text-sm">{t.title}</span>
                  {t.due_at && <span className="shrink-0 text-[10px] text-muted-foreground">{format(new Date(t.due_at), 'MMM d')}</span>}
                </div>
              ))}
            </Card>

            <Card title="Today's schedule" icon={CalIcon} href="/calendar">
              {todaysEvents.length === 0 && <Muted>Nothing on the calendar today.</Muted>}
              {todaysEvents.map((e) => (
                <div key={e.id} className="border-b border-border py-2.5 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm">{e.title}</span>
                    <span className="text-[10px] text-muted-foreground">{format(new Date(e.starts_at), 'HH:mm')}</span>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Card({ title, icon: I, href, children }) {
  return (
    <div className="card-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <I className="h-4 w-4 text-primary" /> {title}
        </div>
        <Link href={href} className="rounded p-1 text-muted-foreground hover:text-foreground"><ArrowUpRight className="h-4 w-4" /></Link>
      </div>
      <div>{children}</div>
    </div>
  );
}
function Muted({ children }) { return <p className="py-4 text-center text-xs text-muted-foreground">{children}</p>; }
