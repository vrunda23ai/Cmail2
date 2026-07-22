'use client';
import useSWR from 'swr';
import AppShell from '@/components/AppShell';
import { format, isSameDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth } from 'date-fns';
import { useState } from 'react';

const fetcher = (u) => fetch(u).then((r) => r.json());

export default function CalendarPage() {
  const { data: events = [] } = useSWR('/api/events', fetcher);
  const [month, setMonth] = useState(new Date());

  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const list = Array.isArray(events) ? events : [];

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">{format(month, 'MMMM yyyy')}</h1>
          <div className="flex gap-2">
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-md border border-border px-3 py-1 text-sm hover:bg-secondary">Prev</button>
            <button onClick={() => setMonth(new Date())} className="rounded-md border border-border px-3 py-1 text-sm hover:bg-secondary">Today</button>
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-md border border-border px-3 py-1 text-sm hover:bg-secondary">Next</button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="bg-secondary px-2 py-1.5 text-center font-medium text-muted-foreground">{d}</div>
          ))}
          {days.map((d) => {
            const dayEvents = list.filter((e) => isSameDay(new Date(e.starts_at), d));
            const inMonth = isSameMonth(d, month);
            const isToday = isSameDay(d, new Date());
            return (
              <div key={d.toISOString()} className={`min-h-[92px] bg-card p-1.5 ${inMonth ? '' : 'opacity-40'}`}>
                <div className={`text-[11px] font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>{format(d, 'd')}</div>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div key={ev.id} className="truncate rounded bg-primary/15 px-1 py-0.5 text-[10px] text-primary" title={ev.title}>{ev.title}</div>
                  ))}
                  {dayEvents.length > 3 && <div className="text-[9px] text-muted-foreground">+{dayEvents.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
