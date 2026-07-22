'use client';
import useSWR, { mutate } from 'swr';
import { useState } from 'react';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { ThumbsUp, ThumbsDown, RefreshCw, Sparkles, Trash2, Mail, Download } from 'lucide-react';
import { format } from 'date-fns';

const fetcher = (u) => fetch(u).then((r) => r.json());

export default function InboxPage() {
  const { data: emails = [], isLoading } = useSWR('/api/emails', fetcher);
  const { data: status } = useSWR('/api/gmail/status', fetcher);
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState('all');
  const rows = (Array.isArray(emails) ? emails : []).filter((e) => filter === 'all' || e.is_important);

  async function call(url, opts, key) {
    setBusy(key);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...opts });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      return j;
    } finally { setBusy(''); }
  }

  const supabase = getSupabaseBrowser();

  const connectGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'https://www.googleapis.com/auth/gmail.readonly email profile',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
  };

  const syncGmail = async () => {
    try {
      const r = await call('/api/gmail/sync', {}, 'sync');
      const msg = r.failures ? `Imported ${r.imported}, analyzed ${r.processed}, ${r.failures} failed (Re-analyze to retry)` : `Imported ${r.imported} new emails (analyzed ${r.processed})`;
      toast.success(msg);
      mutate('/api/emails');
    } catch (e) { toast.error(e.message); }
  };
  const loadDemo = async () => {
    try {
      const r = await call('/api/emails/demo', {}, 'demo');
      const msg = r.failures ? `Generated ${r.count}, analyzed ${r.processed}, ${r.failures} failed` : `Generated ${r.count} sample emails, analyzed ${r.processed}`;
      toast.success(msg);
      mutate('/api/emails');
    } catch (e) { toast.error(e.message); }
  };
  const reanalyze = async () => {
    try {
      const r = await call('/api/emails/process', {}, 'proc');
      const msg = r.failures ? `Re-analyzed ${r.processed}/${r.attempted}, ${r.failures} still failing` : `Re-analyzed ${r.processed} emails`;
      toast.success(msg);
      mutate('/api/emails');
    } catch (e) { toast.error(e.message); }
  };
  const clearDemo = async () => {
    try { await call('/api/emails/clear-demo', {}, 'clr'); toast.success('Cleared demo'); mutate('/api/emails'); }
    catch (e) { toast.error(e.message); }
  };
  const feedback = async (email_id, label) => {
    try {
      const r = await call('/api/emails/feedback', { body: JSON.stringify({ email_id, label }) }, 'fb');
      toast.success(`Feedback saved (${r.feedbackCount} total)`);
      mutate('/api/emails');
    } catch (e) { toast.error(e.message); }
  };

  const connected = !!status?.connected;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Inbox</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {connected ? (
                <>Connected as <span className="text-foreground">{status?.email}</span> · Ranked by importance. Thumbs teach it.</>
              ) : (
                'Sign in with Google (Gmail scope) to sync, or load a demo below.'
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {connected ? (
              <>
                <Button size="sm" onClick={syncGmail} disabled={busy === 'sync'}>
                  <Download className={`mr-1.5 h-3.5 w-3.5 ${busy === 'sync' ? 'animate-pulse' : ''}`} /> {busy === 'sync' ? 'Syncing...' : 'Sync Gmail'}
                </Button>
                <Button variant="secondary" size="sm" onClick={reanalyze} disabled={busy === 'proc'}>
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy === 'proc' ? 'animate-spin' : ''}`} /> Re-analyze
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={connectGoogle}>
                  <Mail className="mr-1.5 h-3.5 w-3.5" /> Connect Gmail
                </Button>
                <Button variant="secondary" size="sm" onClick={loadDemo} disabled={busy === 'demo'}>
                  <Sparkles className={`mr-1.5 h-3.5 w-3.5 ${busy === 'demo' ? 'animate-pulse' : ''}`} /> {busy === 'demo' ? 'Generating...' : 'Load demo'}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="inline-flex rounded-md border border-border bg-secondary p-0.5 text-xs">
            {['all', 'important'].map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`rounded px-3 py-1 capitalize ${filter === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
                {f}
              </button>
            ))}
          </div>
          {emails.some?.((e) => e.is_demo) && (
            <button onClick={clearDemo} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3 w-3" /> Clear demo
            </button>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading...</p>}
          {!isLoading && rows.length === 0 && (
            <div className="card-surface p-10 text-center">
              <p className="text-sm text-muted-foreground">No emails yet. Connect Gmail or load a demo.</p>
            </div>
          )}
          {rows.map((e) => (
            <div key={e.id} className={`card-surface p-4 ${e.is_important ? 'important-glow' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{e.from_name || e.from_email}</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{format(new Date(e.received_at), 'MMM d, HH:mm')}</span>
                  </div>
                  <h3 className="mt-1 truncate text-base font-medium">{e.subject || '(no subject)'}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{e.summary || e.snippet}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${e.is_important ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {Math.round(Number(e.importance_score))}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => feedback(e.id, 'important')} className="rounded border border-border p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary" title="Important">
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => feedback(e.id, 'not_important')} className="rounded border border-border p-1.5 text-muted-foreground hover:bg-muted" title="Not important">
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
