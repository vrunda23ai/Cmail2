'use client';
import Link from 'next/link';
import { Inbox, Sparkles, Calendar, ListTodo, ArrowRight } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Inbox className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">Cmail</span>
        </div>
        <Link href="/auth" className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-muted">
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" /> Powered by Grok / Hugging Face
          </span>
          <h1 className="mt-6 text-5xl font-medium leading-[1.05] tracking-tight md:text-6xl">
            The inbox that <span className="italic text-primary">knows</span> what matters.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Cmail reads your Gmail, ranks emails by importance, extracts action items into a todo list, and drops them on a calendar. It learns from every thumbs up.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/auth" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:brightness-110">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#how" className="inline-flex items-center rounded-md border border-border bg-secondary px-5 py-2.5 text-sm hover:bg-muted">How it works</a>
          </div>
        </div>

        <section id="how" className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { icon: Sparkles, title: 'Importance ranking', body: 'Each email gets a 0-100 score. Important ones surface at the top. Newsletters and noise get pushed down.' },
            { icon: ListTodo, title: 'Auto-extracted todos', body: 'Action items and deadlines pulled out of email bodies into a real todo list you can check off.' },
            { icon: Calendar, title: 'Built-in calendar', body: 'Anything with a date lands on a clean calendar - plus manual events.' },
          ].map(({ icon: I, title, body }) => (
            <div key={title} className="card-surface p-6">
              <div className="mb-4 grid h-9 w-9 place-items-center rounded-md bg-secondary text-primary">
                <I className="h-4 w-4" />
              </div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
