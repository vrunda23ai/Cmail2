import { NextResponse } from 'next/server';
import { getSupabaseServer, getSupabaseAdmin } from '@/lib/supabase/server';
import { chatComplete, parseJsonLoose } from '@/lib/ai';
import { gmailFetch, extractPlainText, headerVal, parseFrom } from '@/lib/gmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// -------------------- helpers --------------------
async function requireUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { error: NextResponse.json({ error: 'Supabase not configured' }, { status: 503 }) };
  }
  const supabase = await getSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  return { user, supabase };
}

function ok(data) { return NextResponse.json(data); }
function bad(msg, status = 400) { return NextResponse.json({ error: msg }, { status }); }

// ---------- Feature extraction / scoring ----------
function extractFeatures(email) {
  const domain = (email.from_email || '').split('@')[1]?.toLowerCase() || 'unknown';
  const text = `${email.subject || ''} ${email.snippet || ''} ${email.body_text || ''}`.toLowerCase();
  const kw = (w) => (text.includes(w) ? 1 : 0);
  const hour = email.received_at ? new Date(email.received_at).getUTCHours() : 12;
  return {
    [`domain:${domain}`]: 1,
    kw_urgent: kw('urgent'),
    kw_asap: kw('asap'),
    kw_deadline: kw('deadline') || kw('due'),
    kw_meeting: kw('meeting') || kw('call'),
    kw_invoice: kw('invoice') || kw('payment'),
    kw_action: kw('please') || kw('could you') || kw('can you'),
    kw_newsletter: kw('unsubscribe') || kw('newsletter'),
    kw_promo: kw('sale') || kw('discount') || kw('% off'),
    is_business_hours: hour >= 9 && hour <= 17 ? 1 : 0,
  };
}

function scoreWithWeights(features, weights, baseline) {
  let s = Number(baseline) || 0;
  for (const [k, v] of Object.entries(features)) s += (weights[k] || 0) * v;
  return Math.max(0, Math.min(100, Math.round(s)));
}

async function analyzeEmail(em) {
  const prompt = `You are analyzing an email for a busy professional.
Return ONLY compact JSON (no prose, no markdown) with this exact shape:
{"importance": <0-100 integer>, "summary": "<=160 chars", "action_items": [{"title":"<=120 chars task the reader must do","due_iso":"<ISO datetime or null>"}]}

Rules:
- importance: 0-30 = noise/newsletters/promos; 30-50 = FYI/informational; 50-70 = worth reading, mild ask; 70-100 = clearly requires the reader to do something soon.
- action_items: extract EVERY concrete task the reader needs to do. Use imperative phrasing ("Reply to Sarah with Q3 numbers", "Pay invoice #1234 by Friday"). Include due_iso whenever the email mentions any date/time. Empty array [] only if there truly is nothing to do (pure promo/FYI).
- Max 5 action items.

From: ${em.from_name || ''} <${em.from_email || ''}>
Subject: ${em.subject || ''}
Body: ${(em.body_text || em.snippet || '').slice(0, 3000)}`;

  // One retry with lower temperature on any transient failure or parse error.
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await chatComplete(prompt, { temperature: attempt === 0 ? 0.2 : 0.0, maxTokens: 700 });
      const parsed = parseJsonLoose(text);
      // sanity-clamp
      if (typeof parsed.importance !== 'number') parsed.importance = 0;
      parsed.importance = Math.max(0, Math.min(100, Math.round(parsed.importance)));
      if (!Array.isArray(parsed.action_items)) parsed.action_items = [];
      parsed.summary = String(parsed.summary || '').slice(0, 200);
      return parsed;
    } catch (e) {
      lastErr = e;
      // Small backoff between attempts to survive short rate-limit blips
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastErr;
}

async function runProcessing(admin, userId, limit = 20) {
  const { data: unproc } = await admin.from('emails').select('*').eq('user_id', userId).eq('processed', false).limit(limit);
  const { data: wRow } = await admin.from('user_weights').select('*').eq('user_id', userId).maybeSingle();
  const weights = wRow?.weights || {};
  let processed = 0;
  let failures = 0;
  for (const em of unproc || []) {
    try {
      const a = await analyzeEmail(em);
      const feats = extractFeatures(em);
      const score = scoreWithWeights(feats, weights, a.importance);
      const isImportant = score >= 70;
      await admin.from('emails').update({
        importance_score: score, is_important: isImportant, summary: a.summary || '', processed: true,
      }).eq('id', em.id);

      // Auto-create todos + calendar entries when the email meets the bar.
      // Threshold: score >= 50 with at least one concrete task.
      const shouldExtract = score >= 50 && Array.isArray(a.action_items) && a.action_items.length > 0;
      if (shouldExtract) {
        const todoRows = a.action_items.slice(0, 5)
          .filter((x) => (x.title || '').trim().length > 3)
          .map((x) => ({
            user_id: userId,
            email_id: em.id,
            title: (x.title || '').slice(0, 200),
            notes: a.summary ? `From: ${em.subject || '(no subject)'} — ${a.summary}`.slice(0, 500) : `From: ${em.subject || '(no subject)'}`,
            due_at: x.due_iso || null,
          }));
        if (todoRows.length) {
          const { data: inserted } = await admin.from('todos').insert(todoRows).select('id, title, due_at, notes');
          const events = (inserted || []).filter((t) => t.due_at).map((t) => {
            const start = new Date(t.due_at);
            return {
              user_id: userId, todo_id: t.id, email_id: em.id,
              title: t.title, description: t.notes || null,
              starts_at: start.toISOString(),
              ends_at: new Date(start.getTime() + 30 * 60_000).toISOString(),
              source: 'email',
            };
          });
          if (events.length) await admin.from('calendar_events').insert(events);
        }
      }
      processed++;
    } catch (e) {
      failures++;
      console.error('process email failed', em.id, e?.message || e);
      // IMPORTANT: leave processed=false so the next Re-analyze picks it up
      // again. Only surface a hint of the error in the summary field.
      const errMsg = String(e?.message || 'unknown error').slice(0, 200);
      await admin.from('emails').update({ summary: `(AI error - retry needed) ${errMsg}` }).eq('id', em.id);
    }
  }
  return { processed, failures, attempted: (unproc || []).length };
}

// -------------------- routes --------------------
export async function GET(request, { params }) {
  const path = ((await params).path || []).join('/');

  if (path === 'health') return ok({ ok: true, provider: process.env.AI_PROVIDER || 'grok' });

  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { user, supabase } = auth;
  const admin = getSupabaseAdmin();

  if (path === 'emails') {
    // Fix #2: sort by importance_score DESC, then received_at DESC.
    // This is what makes the inbox "priority-sorted".
    const { data } = await supabase
      .from('emails')
      .select('*')
      .order('importance_score', { ascending: false })
      .order('received_at', { ascending: false })
      .limit(100);
    return ok(data || []);
  }
  if (path === 'todos') {
    const { data } = await supabase.from('todos').select('*').order('due_at', { ascending: true, nullsFirst: false });
    return ok(data || []);
  }
  // Returns { [todo_id]: event_id } for all todos that have a calendar event.
  // Used by the Todos UI to render the calendar-toggle button state.
  if (path === 'todos/scheduled') {
    const { data } = await supabase.from('calendar_events').select('id, todo_id').not('todo_id', 'is', null);
    const map = {};
    (data || []).forEach((e) => { map[e.todo_id] = e.id; });
    return ok(map);
  }
  if (path === 'events') {
    const { data } = await supabase.from('calendar_events').select('*').order('starts_at', { ascending: true });
    return ok(data || []);
  }
  if (path === 'gmail/status') {
    // Check if we have Google provider token on the session
    const { data: session } = await supabase.auth.getSession();
    const hasToken = !!session.session?.provider_token;
    return ok({ connected: hasToken, email: user.email });
  }
  return bad('Not found', 404);
}

export async function POST(request, { params }) {
  const path = ((await params).path || []).join('/');
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { user, supabase } = auth;
  const admin = getSupabaseAdmin();
  const body = await request.json().catch(() => ({}));

  // ---- Gmail sync (uses Supabase-provided Google token) ----
  if (path === 'gmail/sync') {
    const { data: session } = await supabase.auth.getSession();
    const accessToken = session.session?.provider_token;
    if (!accessToken) return bad('Google access token missing. Sign in with Google again (accept Gmail scope).', 400);

    try {
      // First-time sync = fetch everything in the inbox from the last 7 days.
      // Subsequent syncs still get anything from the last 7 days that isn't
      // already stored (we dedupe by gmail_id below), which effectively acts
      // as an incremental sync.
      const { count: existingCount } = await admin.from('emails').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_demo', false);
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);
      const y = weekAgo.getUTCFullYear();
      const m = String(weekAgo.getUTCMonth() + 1).padStart(2, '0');
      const d = String(weekAgo.getUTCDate()).padStart(2, '0');
      // On first sync (no prior emails): grab everything from the last 7 days.
      // On subsequent syncs: still last 7 days (dedup will handle it), which
      // catches recent items even if user marked them read.
      const query = `in:inbox after:${y}/${m}/${d}`;
      const maxResults = existingCount && existingCount > 0 ? 50 : 100;

      const list = await gmailFetch(
        `/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
        accessToken
      );
      const ids = (list.messages || []).map((m) => m.id);
      if (!ids.length) return ok({ fetched: 0, imported: 0, processed: 0 });

      const { data: existing } = await admin.from('emails').select('gmail_id').eq('user_id', user.id).in('gmail_id', ids);
      const have = new Set((existing || []).map((e) => e.gmail_id));
      const toFetch = ids.filter((id) => !have.has(id));

      let imported = 0;
      for (const id of toFetch) {
        try {
          const msg = await gmailFetch(`/gmail/v1/users/me/messages/${id}?format=full`, accessToken);
          const headers = msg.payload?.headers || [];
          const from = parseFrom(headerVal(headers, 'From'));
          const subject = headerVal(headers, 'Subject');
          const dateHdr = headerVal(headers, 'Date');
          const received_at = dateHdr ? new Date(dateHdr).toISOString() : new Date(Number(msg.internalDate) || Date.now()).toISOString();
          const body_text = extractPlainText(msg.payload).slice(0, 10000);
          const snippet = String(msg.snippet || '').slice(0, 500);
          const { error } = await admin.from('emails').insert({
            user_id: user.id, gmail_id: id, from_email: from.email, from_name: from.name,
            subject, snippet, body_text, received_at, is_demo: false, processed: false,
          });
          if (!error) imported++;
        } catch (e) { console.error('gmail msg fetch failed', id, e); }
      }
      const r = imported > 0 ? await runProcessing(admin, user.id, imported) : { processed: 0, failures: 0 };
      return ok({ fetched: ids.length, imported, processed: r.processed, failures: r.failures, firstRun: !existingCount });
    } catch (e) {
      return bad(e.message || 'Gmail sync failed', 500);
    }
  }

  // ---- Generate demo emails ----
  if (path === 'emails/demo') {
    try {
      const prompt = `Return ONLY compact JSON, no prose, no markdown, matching:
{"emails":[{"from_name":"","from_email":"","subject":"","snippet":"","body":"","hours_ago":<0-72 integer>}]}

Generate exactly 10 realistic sample emails a mid-career professional might receive in the last 3 days. Mix: 2 urgent work emails needing action with deadlines, 2 meeting requests with specific dates, 2 informational updates from teammates, 2 newsletters/marketing, 1 personal email from a friend, 1 invoice/billing. Vary senders and tone. Include specific dates in the next 2 weeks where relevant.`;
      const text = await chatComplete(prompt, { temperature: 0.7, maxTokens: 1800 });
      const out = parseJsonLoose(text);
      if (!out.emails?.length) return bad('Model returned no emails', 500);
      const now = Date.now();
      const rows = out.emails.map((e) => ({
        user_id: user.id,
        from_email: e.from_email, from_name: e.from_name, subject: e.subject,
        snippet: e.snippet, body_text: e.body,
        received_at: new Date(now - (Number(e.hours_ago) || 0) * 3600_000).toISOString(),
        is_demo: true, gmail_id: `demo-${crypto.randomUUID()}`,
      }));
      const { error } = await admin.from('emails').insert(rows);
      if (error) return bad(error.message, 500);
      const r = await runProcessing(admin, user.id, 20);
      return ok({ count: rows.length, processed: r.processed, failures: r.failures });
    } catch (e) {
      return bad(e.message || 'Demo generation failed', 500);
    }
  }

  // ---- Re-analyze all (Fix #3) ----
  // Also cleans up prior AI-created todos/events so re-analyze produces a
  // fresh, correct list instead of duplicating.
  if (path === 'emails/process') {
    // Clear AI-created todos and their linked events so we don't duplicate
    await admin.from('calendar_events').delete().eq('user_id', user.id).eq('source', 'email');
    const { data: aiTodos } = await admin.from('todos').select('id').eq('user_id', user.id).not('email_id', 'is', null);
    if (aiTodos?.length) await admin.from('todos').delete().in('id', aiTodos.map((t) => t.id));
    await admin.from('emails').update({ processed: false, summary: null }).eq('user_id', user.id);
    const r = await runProcessing(admin, user.id, 100);
    return ok({ processed: r.processed, failures: r.failures, attempted: r.attempted });
  }

  // ---- Clear demo ----
  if (path === 'emails/clear-demo') {
    await admin.from('emails').delete().eq('user_id', user.id).eq('is_demo', true);
    return ok({ ok: true });
  }

  // ---- Feedback (learning) ----
  if (path === 'emails/feedback') {
    const { email_id, label } = body || {};
    if (!email_id || !['important', 'not_important'].includes(label)) return bad('Bad payload');
    const { data: email } = await admin.from('emails').select('*').eq('id', email_id).eq('user_id', user.id).maybeSingle();
    if (!email) return bad('Email not found', 404);
    const features = extractFeatures(email);
    await admin.from('email_feedback').insert({ user_id: user.id, email_id, label, features });
    const sign = label === 'important' ? 1 : -1;
    const LR = 5;
    const { data: wRow } = await admin.from('user_weights').select('*').eq('user_id', user.id).maybeSingle();
    const weights = wRow?.weights || {};
    for (const [k, v] of Object.entries(features)) weights[k] = (weights[k] || 0) + sign * LR * v;
    const feedbackCount = (wRow?.feedback_count || 0) + 1;
    await admin.from('user_weights').upsert({ user_id: user.id, weights, feedback_count: feedbackCount, updated_at: new Date().toISOString() });
    const newScore = label === 'important' ? Math.max(email.importance_score, 80) : Math.min(email.importance_score, 30);
    await admin.from('emails').update({ importance_score: newScore, is_important: label === 'important' }).eq('id', email_id);
    return ok({ ok: true, feedbackCount });
  }

  // ---- Todos CRUD ----
  if (path === 'todos') {
    const { title, notes, due_at } = body || {};
    if (!title) return bad('title required');
    const { data, error } = await admin.from('todos').insert({ user_id: user.id, title, notes, due_at }).select().single();
    if (error) return bad(error.message, 500);
    return ok(data);
  }

  // ---- Toggle a todo on/off the calendar (Fix #5).
  //   POST /api/todos/:id/schedule
  //   - If no calendar_event exists for this todo, one is created.
  //   - If one already exists, it is removed.
  // Body: { starts_at?, duration_min? } (only used on create)
  if (path.startsWith('todos/') && path.endsWith('/schedule')) {
    const id = path.split('/')[1];
    const { data: todo } = await admin.from('todos').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (!todo) return bad('Todo not found', 404);

    // Check if there's already a calendar event for this todo -> toggle behavior
    const { data: existing } = await admin.from('calendar_events').select('id').eq('user_id', user.id).eq('todo_id', todo.id).limit(1);
    if (existing && existing.length > 0) {
      await admin.from('calendar_events').delete().eq('id', existing[0].id).eq('user_id', user.id);
      return ok({ scheduled: false, removed: existing[0].id });
    }

    const start = todo.due_at ? new Date(todo.due_at) : (body?.starts_at ? new Date(body.starts_at) : new Date(Date.now() + 3600_000));
    const durationMin = Number(body?.duration_min) || 30;
    const { data, error } = await admin.from('calendar_events').insert({
      user_id: user.id, todo_id: todo.id, email_id: todo.email_id || null,
      title: todo.title, description: todo.notes || null,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + durationMin * 60_000).toISOString(),
      source: 'todo',
    }).select().single();
    if (error) return bad(error.message, 500);
    return ok({ scheduled: true, event: data });
  }

  // ---- Events CRUD ----
  if (path === 'events') {
    const { title, description, starts_at, ends_at } = body || {};
    if (!title || !starts_at || !ends_at) return bad('title, starts_at, ends_at required');
    const { data, error } = await admin.from('calendar_events').insert({ user_id: user.id, title, description, starts_at, ends_at, source: 'manual' }).select().single();
    if (error) return bad(error.message, 500);
    return ok(data);
  }

  return bad('Not found', 404);
}

export async function PATCH(request, { params }) {
  const path = ((await params).path || []).join('/');
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { user } = auth;
  const admin = getSupabaseAdmin();
  const body = await request.json().catch(() => ({}));

  if (path.startsWith('todos/')) {
    const id = path.split('/')[1];
    const { data, error } = await admin.from('todos').update(body).eq('id', id).eq('user_id', user.id).select().single();
    if (error) return bad(error.message, 500);
    return ok(data);
  }
  return bad('Not found', 404);
}

export async function DELETE(request, { params }) {
  const path = ((await params).path || []).join('/');
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { user } = auth;
  const admin = getSupabaseAdmin();

  if (path.startsWith('todos/')) {
    const id = path.split('/')[1];
    await admin.from('todos').delete().eq('id', id).eq('user_id', user.id);
    return ok({ ok: true });
  }
  if (path.startsWith('events/')) {
    const id = path.split('/')[1];
    await admin.from('calendar_events').delete().eq('id', id).eq('user_id', user.id);
    return ok({ ok: true });
  }
  return bad('Not found', 404);
}
