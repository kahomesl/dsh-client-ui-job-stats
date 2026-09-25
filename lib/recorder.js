/**
 * Host half of the background-job statistics plugin: the terminal-outcome ledger.
 *
 * The browser half reads `ctx.jobs`, the roster mirror, which is a *live* set: a
 * foreground command's record is removed as soon as the call that started it
 * collected the output — frequently inside the coalescing window that would have
 * reported its settlement — so the panel sees a task running and then gone, and
 * can never learn whether it succeeded. The registry's own event stream does carry
 * that projection: a `settled` event is emitted before any removal.
 *
 * This half subscribes to that stream and keeps the settled records **durably**, in
 * `.job-stats/ledger.json` inside the profile, so a panel opened after the Host (or
 * the page) has restarted still knows what the previous run settled. It serves the
 * ledger on one host route, which the panel resolves document-relatively.
 *
 * Loaded as its own Loader row (`dsh-client-ui-job-stats/recorder`), because the row
 * that publishes the browser half must stay a bare package specifier: a subpath
 * specifier is invisible to the client-module scanner by construction.
 * @module dsh-client-ui-job-stats/recorder
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Route the panel reads recorded outcomes from. */
const ROUTE = '/dsh-job-stats/outcomes';
/** Marker carried by the response body. */
const SCHEMA = 'dsh-job-stats/outcomes/v1';
/** Marker carried by the ledger file. */
const LEDGER_SCHEMA = 'dsh-job-stats/ledger/v1';
/** How many settled records one session keeps; the oldest settlements go first. */
const SESSION_LIMIT = 200;
/** How many sessions the ledger keeps; the least recently settled go first. */
const SESSION_KEEP = 32;
/** Longest label stored per record, so one huge command cannot bloat the file. */
const LABEL_LIMIT = 2000;
/** Shortest gap between two writes while settlements keep arriving. */
const SAVE_INTERVAL_MS = 1000;
/** Statuses that mean the job will not run again. */
const TERMINAL = new Set(['completed', 'failed', 'killed']);

export const name = 'job-stats-recorder';
/** The registry is required; the route carrier is injected optionally. */
export const inject = ['jobs'];

/**
 * Where the ledger lives: `<DSH_HOME>/profiles/<profile>/.job-stats/ledger.json`,
 * the per-profile data directory other plugins keep their state in too. Without
 * those environment facts it stays in memory rather than writing somewhere
 * unexpected.
 * @returns the absolute path, or undefined when nothing can be resolved.
 */
function storePath() {
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== '' ? process.env.DSH_HOME : undefined;
  if (home === undefined) return undefined;
  const profile = typeof process.env.DSH_PROFILE === 'string' && process.env.DSH_PROFILE !== '' ? process.env.DSH_PROFILE : undefined;
  const root = profile === undefined ? home : join(home, 'profiles', profile);
  return join(root, '.job-stats', 'ledger.json');
}

/** Compact, JSON-safe projection of one settled job. */
function recordOf(job) {
  const bytes = job.output === null || typeof job.output !== 'object' ? undefined : job.output.total;
  const label = typeof job.label === 'string' ? job.label : '';
  return {
    id: job.id,
    // An unowned job is visible to every session, so it is recorded without one.
    sessionId: typeof job.owner === 'string' && job.owner !== '' ? job.owner : null,
    kind: typeof job.kind === 'string' ? job.kind : '',
    label: label.length > LABEL_LIMIT ? label.slice(0, LABEL_LIMIT) : label,
    status: job.status,
    ...(typeof job.detail === 'string' && job.detail !== '' ? { detail: job.detail } : {}),
    startedAt: typeof job.startedAt === 'number' && Number.isFinite(job.startedAt) ? job.startedAt : 0,
    ...(typeof job.finishedAt === 'number' && Number.isFinite(job.finishedAt) ? { finishedAt: job.finishedAt } : {}),
    bytes: typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0 ? bytes : 0,
  };
}

/**
 * Read the ledger file.
 *
 * A missing file is a first run and a corrupt one is not worth refusing to boot
 * over: both start empty.
 * @param path - the ledger path, or undefined for memory only.
 * @returns settled records by job id, in settlement order.
 */
function loadLedger(path) {
  const records = new Map();
  if (path === undefined) return records;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.records)) return records;
    for (const record of parsed.records) {
      if (record === null || typeof record !== 'object') continue;
      if (typeof record.id !== 'string' || record.id === '') continue;
      if (!TERMINAL.has(record.status)) continue;
      records.set(record.id, record);
    }
  } catch {
    /* absent, unreadable or corrupt: start empty */
  }
  return records;
}

/** Keep the ledger inside its per-session and per-session-count bounds. */
function pruneLedger(records) {
  const perSession = new Map();
  const latest = new Map();
  for (const record of records.values()) {
    const key = typeof record.sessionId === 'string' ? record.sessionId : '';
    perSession.set(key, (perSession.get(key) ?? 0) + 1);
    const stamp = typeof record.finishedAt === 'number' ? record.finishedAt : 0;
    latest.set(key, Math.max(latest.get(key) ?? 0, stamp));
  }
  for (const [key, count] of perSession) {
    let excess = count - SESSION_LIMIT;
    if (excess <= 0) continue;
    for (const [id, record] of records) {
      if (excess <= 0) break;
      if ((typeof record.sessionId === 'string' ? record.sessionId : '') !== key) continue;
      records.delete(id);
      excess -= 1;
    }
  }
  if (latest.size > SESSION_KEEP) {
    const dropped = [...latest.entries()]
      .sort((left, right) => left[1] - right[1])
      .slice(0, latest.size - SESSION_KEEP)
      .map(([key]) => key);
    for (const key of dropped) {
      for (const [id, record] of records) {
        if ((typeof record.sessionId === 'string' ? record.sessionId : '') === key) records.delete(id);
      }
    }
  }
}

/** Write the ledger, temp-file-then-rename so a crash cannot leave it half written. */
function saveLedger(path, records) {
  if (path === undefined) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const body = JSON.stringify({ schema: LEDGER_SCHEMA, records: [...records.values()] });
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, body);
    renameSync(temporary, path);
  } catch {
    /* a read-only or full disk keeps the in-memory ledger only */
  }
}

/**
 * Install the ledger.
 *
 * The route serves the durable set, so a panel opened after a restart still sees
 * what the previous run settled. Unloading the row flushes and forgets the
 * in-memory copy; the file stays.
 * @param ctx - Host context carrying the job registry.
 */
export function apply(ctx) {
  const path = storePath();
  /** Insertion-ordered ledger, keyed by job id. */
  const outcomes = loadLedger(path);
  let writtenAt = 0;
  const persist = (force) => {
    const stamp = Date.now();
    if (!force && stamp - writtenAt < SAVE_INTERVAL_MS) return;
    writtenAt = stamp;
    saveLedger(path, outcomes);
  };
  if (outcomes.size > 0) {
    ctx.logger?.info?.(`job-stats: ${String(outcomes.size)} recorded job outcomes loaded from ${String(path)}`);
  }

  try {
    ctx.effect(() => {
      const unsubscribe = ctx.jobs.events.subscribe({ owners: 'all' }, (event) => {
        if (event === null || typeof event !== 'object' || event.type !== 'settled') return;
        const job = event.job;
        if (job === null || typeof job !== 'object') return;
        if (typeof job.id !== 'string' || job.id === '') return;
        if (!TERMINAL.has(job.status)) return;
        // Re-inserting keeps the ledger in settlement order, so both caps evict the
        // oldest settlement rather than an arbitrary one.
        outcomes.delete(job.id);
        outcomes.set(job.id, recordOf(job));
        pruneLedger(outcomes);
        persist(false);
      });
      return () => {
        unsubscribe();
        persist(true);
        outcomes.clear();
      };
    }, 'job-stats: settle ledger');
  } catch (error) {
    // A registry whose event hub is not reachable must not fail activation: the
    // panel simply keeps its roster-only story.
    ctx.logger?.warn?.(`job-stats: cannot subscribe to job events: ${String(error)}`);
  }

  ctx.inject(['webServer'], (web) => {
    try {
      web.effect(() => web.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: (request, response) => {
          if (request.method !== 'GET') {
            response.writeHead(405, { allow: 'GET' });
            response.end();
            return;
          }
          let sessionId = null;
          try {
            sessionId = new URL(request.url ?? '/', 'http://localhost').searchParams.get('sessionId');
          } catch {
            sessionId = null;
          }
          const list = [];
          for (const record of outcomes.values()) {
            // Unowned records belong to every session; the rest are the caller's.
            if (sessionId !== null && sessionId !== '' && record.sessionId !== null && record.sessionId !== sessionId) continue;
            list.push(record);
          }
          const body = JSON.stringify({ schema: SCHEMA, outcomes: list });
          response.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          });
          response.end(body);
        },
      }), 'job-stats: outcomes route');
    } catch (error) {
      ctx.logger?.warn?.(`job-stats: cannot serve outcomes: ${String(error)}`);
    }
  });
}
