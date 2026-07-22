'use client';
import useSWR, { mutate } from 'swr';
import { useState } from 'react';
import { toast } from 'sonner';
import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Trash2, Plus, CalendarPlus, CalendarCheck } from 'lucide-react';
import { format } from 'date-fns';

const fetcher = (u) => fetch(u).then((r) => r.json());

export default function TodosPage() {
  const { data: todos = [] } = useSWR('/api/todos', fetcher);
  const { data: scheduledMap = {} } = useSWR('/api/todos/scheduled', fetcher);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busyId, setBusyId] = useState(null);

  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const r = await fetch('/api/todos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, due_at: due || null }),
    });
    if (r.ok) { setTitle(''); setDue(''); mutate('/api/todos'); }
    else toast.error('Failed');
  };

  const toggle = async (t) => {
    await fetch(`/api/todos/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !t.done }),
    });
    mutate('/api/todos');
  };
  const del = async (id) => {
    await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    mutate('/api/todos');
    mutate('/api/todos/scheduled');
    mutate('/api/events');
  };

  // Fix #5: click once to schedule, click again to remove from calendar (toggle).
  const toggleCalendar = async (t) => {
    let starts_at = t.due_at || null;
    const alreadyScheduled = !!scheduledMap[t.id];

    // Ask for a datetime only when we're about to create AND the todo has no due_at.
    if (!alreadyScheduled && !starts_at) {
      const guess = new Date();
      guess.setHours(guess.getHours() + 1, 0, 0, 0);
      const iso = new Date(guess.getTime() - guess.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16);
      const input = window.prompt('When should this land on the calendar? (YYYY-MM-DDTHH:mm)', iso);
      if (!input) return;
      starts_at = new Date(input).toISOString();
    }

    setBusyId(t.id);
    try {
      const r = await fetch(`/api/todos/${t.id}/schedule`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starts_at, duration_min: 30 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      toast.success(j.scheduled ? 'Added to calendar' : 'Removed from calendar');
      mutate('/api/todos/scheduled');
      mutate('/api/events');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const list = Array.isArray(todos) ? todos : [];

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Todos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Extracted from important emails, plus anything you add.</p>

        <form onSubmit={add} className="mt-6 flex flex-wrap gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task..." className="flex-1 min-w-[200px]" />
          <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="w-56" />
          <Button type="submit"><Plus className="mr-1 h-4 w-4" /> Add</Button>
        </form>

        <div className="mt-6 space-y-2">
          {list.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No todos yet.</p>}
          {list.map((t) => {
            const onCal = !!scheduledMap[t.id];
            return (
              <div key={t.id} className="card-surface flex items-center gap-3 p-3">
                <button
                  onClick={() => toggle(t)}
                  className={`grid h-6 w-6 place-items-center rounded-md border ${t.done ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
                  title={t.done ? 'Mark undone' : 'Mark done'}
                >
                  {t.done && <Check className="h-3.5 w-3.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${t.done ? 'line-through text-muted-foreground' : ''}`}>{t.title}</div>
                  {t.notes && <div className="text-[11px] text-muted-foreground truncate">{t.notes}</div>}
                  {t.due_at && <div className="text-[10px] text-muted-foreground">Due {format(new Date(t.due_at), 'MMM d, HH:mm')}</div>}
                </div>
                <button
                  onClick={() => toggleCalendar(t)}
                  disabled={busyId === t.id}
                  className={`rounded p-1.5 disabled:opacity-50 ${
                    onCal
                      ? 'bg-primary/15 text-primary hover:bg-primary/25'
                      : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                  }`}
                  title={onCal ? 'On the calendar — click to remove' : 'Add to calendar'}
                  aria-pressed={onCal}
                >
                  {onCal
                    ? <CalendarCheck className={`h-3.5 w-3.5 ${busyId === t.id ? 'animate-pulse' : ''}`} />
                    : <CalendarPlus className={`h-3.5 w-3.5 ${busyId === t.id ? 'animate-pulse' : ''}`} />
                  }
                </button>
                <button
                  onClick={() => del(t.id)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
