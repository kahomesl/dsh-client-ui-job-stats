/**
 * Host half of the background-job statistics plugin: the terminal-outcome recorder.
 *
 * The browser half reads `ctx.jobs`, the roster mirror, which is a *live* set: a
 * foreground command's record is removed as soon as the call that started it
 * collected the output — frequently inside the coalescing window that would have
 * reported its settlement — so the panel sees a task running and then gone, and
 * can never learn whether it succeeded. The registry's own event stream does carry
 * that projection: a `settled` event is emitted before any removal.
 *
 * This half subscribes to that stream, keeps a bounded ring of terminal records per
 * session, and serves them to the panel over one host route. The panel resolves
 * that route document-relatively, the pattern the shipped market UI uses.
 *
 * Loaded as its own Loader row (`dsh-client-ui-job-stats/recorder`), because the row
 * that publishes the browser half must stay a bare package specifier: a subpath
 * specifier is invisible to the client-module scanner by construction.
 * @module dsh-client-ui-job-stats/recorder
 */

/** Route the panel reads recorded outcomes from. */
const ROUTE = '/dsh-job-stats/outcomes';
/** Marker carried by the response body. */
const SCHEMA = 'dsh-job-stats/outcomes/v1';
/** How many terminal records the ring keeps; the oldest are evicted first. */
const RING_LIMIT = 2000;
/** Statuses that mean the job will not run again. */
const TERMINAL = new Set(['completed', 'failed', 'killed']);

export const name = 'job-stats-recorder';
/** The registry is required; the route carrier is injected optionally. */
export const inject = ['jobs'];

/** Compact, JSON-safe projection of one settled job. */
function recordOf(job) {
  const bytes = job.output === null || typeof job.output !== 'object' ? undefined : job.output.total;
  return {
    id: job.id,
    // An unowned job is visible to every session, so it is recorded without one.
    sessionId: typeof job.owner === 'string' && job.owner !== '' ? job.owner : null,
    kind: typeof job.kind === 'string' ? job.kind : '',
    label: typeof job.label === 'string' ? job.label : '',
    status: job.status,
    ...(typeof job.detail === 'string' && job.detail !== '' ? { detail: job.detail } : {}),
    startedAt: typeof job.startedAt === 'number' && Number.isFinite(job.startedAt) ? job.startedAt : 0,
    ...(typeof job.finishedAt === 'number' && Number.isFinite(job.finishedAt) ? { finishedAt: job.finishedAt } : {}),
    bytes: typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0 ? bytes : 0,
  };
}

/**
 * Install the recorder.
 *
 * The ring lives for the plugin's lifetime: unloading the row drops it, which is
 * what a composition reload is allowed to forget (the browser keeps its own
 * accumulated ledger across such a reload, and re-reads it after one).
 * @param ctx - Host context carrying the job registry.
 */
export function apply(ctx) {
  /** Insertion-ordered ring of terminal records, keyed by job id. */
  const outcomes = new Map();

  try {
    ctx.effect(() => {
      const unsubscribe = ctx.jobs.events.subscribe({ owners: 'all' }, (event) => {
        if (event === null || typeof event !== 'object' || event.type !== 'settled') return;
        const job = event.job;
        if (job === null || typeof job !== 'object') return;
        if (typeof job.id !== 'string' || job.id === '') return;
        if (!TERMINAL.has(job.status)) return;
        // Re-inserting keeps the ring in settlement order, so eviction drops the
        // oldest settlement rather than an arbitrary one.
        outcomes.delete(job.id);
        outcomes.set(job.id, recordOf(job));
        while (outcomes.size > RING_LIMIT) {
          const oldest = outcomes.keys().next().value;
          if (oldest === undefined) break;
          outcomes.delete(oldest);
        }
      });
      return () => {
        unsubscribe();
        outcomes.clear();
      };
    }, 'job-stats: settle recorder');
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
