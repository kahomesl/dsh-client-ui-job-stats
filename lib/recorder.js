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
 * ledger on one host route, which the panel resolves document-relatively, and that
 * route also carries this row's own health: where the ledger lives, whether the
 * last write landed, and whether the event subscription is still attached.
 *
 * Loaded as its own Loader row (`dsh-client-ui-job-stats/recorder`), because the row
 * that publishes the browser half must stay a bare package specifier: a subpath
 * specifier is invisible to the client-module scanner by construction.
 * @module dsh-client-ui-job-stats/recorder
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

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
/** Longest delay before retrying a failed write or a failed subscription. */
const RETRY_MAX_MS = 30_000;
/** Delay before the first retry of a subscription that could not be attached. */
const SUBSCRIBE_RETRY_MS = 1000;
/** Statuses that mean the job will not run again. */
const TERMINAL = new Set(['completed', 'failed', 'killed']);

export const name = 'job-stats-recorder';
/** The registry is required; the route carrier is injected optionally. */
export const inject = ['jobs'];

/** Compare two absolute paths the way this platform compares them. */
function samePath(left, right) {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/**
 * The Harness home, resolved exactly as the framework resolves it: `$DSH_HOME`
 * when it is set, `~/.dsh` otherwise.
 *
 * Reading only the variable is what made this ledger silently memory-only: the
 * Desktop host process does not export `DSH_HOME` (nor `DSH_PROFILE`), so the
 * resolved path came back undefined and every restart began with an empty
 * ledger. The framework's own default is used instead, which is the same
 * directory every other part of DSH treats as the harness home.
 * @param env - environment to read.
 * @returns the absolute harness home.
 */
export function resolveHome(env = process.env) {
  const explicit = typeof env.DSH_HOME === 'string' && env.DSH_HOME !== '' ? env.DSH_HOME : undefined;
  return explicit ?? join(homedir(), '.dsh');
}

/**
 * The profile directory named by the launcher's own command line.
 *
 * `dsh-desktop-host` spawns the Host as
 * `.../dsh-desktop-host/lib/index.js <appRoot> <profileDir> ...`, so the profile
 * directory is on argv even when no environment variable carries it. Only an
 * absolute argument that is exactly `<home>/profiles/<name>` is accepted, so an
 * unrelated argument can never redirect the ledger.
 * @param argv - the process command line.
 * @param home - the resolved harness home.
 * @returns the profile directory, or undefined when argv names none.
 */
function profileDirectoryFromArgv(argv, home) {
  const profiles = resolve(home, 'profiles');
  const root = resolve(home);
  for (const argument of argv) {
    if (typeof argument !== 'string' || argument === '' || !isAbsolute(argument)) continue;
    const candidate = resolve(argument);
    if (!samePath(dirname(candidate), profiles)) continue;
    if (!samePath(dirname(dirname(candidate)), root)) continue;
    return candidate;
  }
  return undefined;
}

/**
 * Where the ledger lives, and which fact decided it.
 *
 * Preference order, most specific first: an explicit profile directory, a named
 * profile under the harness home, the profile directory the launcher passed on
 * argv, and finally one ledger for the whole harness home. `source` is reported
 * on the route so a deployment can see which rule applied.
 * @param options - environment, command line and home overrides (tests use them).
 * @returns the absolute ledger path and the rule that produced it.
 */
export function ledgerPathFor({ env = process.env, argv = process.argv, home = resolveHome(env) } = {}) {
  const profileDirectory = typeof env.DSH_PROFILE_DIR === 'string' && env.DSH_PROFILE_DIR !== '' ? env.DSH_PROFILE_DIR : undefined;
  if (profileDirectory !== undefined) {
    return { path: join(profileDirectory, '.job-stats', 'ledger.json'), source: 'DSH_PROFILE_DIR' };
  }
  const profile = typeof env.DSH_PROFILE === 'string' && env.DSH_PROFILE !== '' ? env.DSH_PROFILE : undefined;
  if (profile !== undefined) {
    return { path: join(home, 'profiles', profile, '.job-stats', 'ledger.json'), source: 'DSH_PROFILE' };
  }
  const fromArgv = profileDirectoryFromArgv(argv, home);
  if (fromArgv !== undefined) {
    return { path: join(fromArgv, '.job-stats', 'ledger.json'), source: 'launcher argument' };
  }
  return { path: join(home, '.job-stats', 'ledger.json'), source: 'harness home' };
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

/**
 * Write the ledger, temp-file-then-rename so a crash cannot leave it half written.
 *
 * The write is synchronous on purpose: one call writes one complete file, so two
 * writers can never interleave and a scheduled trailing write can never publish a
 * half-updated ledger.
 * @param path - the ledger path.
 * @param records - the live ledger.
 * @returns true on success, or the failure message.
 */
function saveLedger(path, records) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const body = JSON.stringify({ schema: LEDGER_SCHEMA, records: [...records.values()] });
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, body);
    renameSync(temporary, path);
    return true;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Parse one ledger file into records, or undefined when it is not this format. */
function readLedgerFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object') return undefined;
  // The schema marker is the file's own claim about its shape: a file that does
  // not carry this one is left alone rather than half-read.
  if (parsed.schema !== LEDGER_SCHEMA) return { ignored: String(parsed.schema ?? 'none') };
  if (!Array.isArray(parsed.records)) return undefined;
  const records = new Map();
  for (const record of parsed.records) {
    if (record === null || typeof record !== 'object') continue;
    if (typeof record.id !== 'string' || record.id === '') continue;
    if (!TERMINAL.has(record.status)) continue;
    records.set(record.id, record);
  }
  return { records };
}

/**
 * Read the ledger file.
 *
 * A missing file is a first run and a corrupt one is not worth refusing to boot
 * over: both start empty. A file written by another schema is ignored, and a
 * temporary file left behind by a kill between write and rename is promoted when
 * the ledger itself is missing — that is exactly the crash window the rename
 * exists for.
 * @param path - the ledger path.
 * @returns the records in settlement order, plus what the read did.
 */
function loadLedger(path) {
  const outcome = { records: new Map(), loaded: 0, note: 'absent or unreadable' };
  const read = readLedgerFile(path);
  if (read?.records !== undefined) {
    outcome.records = read.records;
    outcome.loaded = read.records.size;
    outcome.note = 'read';
    // A temporary file next to a readable ledger is debris from an older crash.
    try {
      rmSync(`${path}.tmp`, { force: true });
    } catch {
      /* nothing to clean */
    }
    return outcome;
  }
  if (read?.ignored !== undefined) {
    outcome.note = `ignored a file carrying schema ${read.ignored}`;
    return outcome;
  }
  const temporary = readLedgerFile(`${path}.tmp`);
  if (temporary?.records !== undefined && temporary.records.size > 0) {
    outcome.records = temporary.records;
    outcome.loaded = temporary.records.size;
    try {
      renameSync(`${path}.tmp`, path);
      outcome.note = 'recovered from a temporary file';
    } catch {
      outcome.note = 'read a temporary file that could not be promoted';
    }
    return outcome;
  }
  return outcome;
}

/**
 * Durable-write schedule for one ledger file.
 *
 * Three facts drive it: `dirty` (the ledger changed since the last *successful*
 * write), `lastWrittenAt` (when that write landed) and one pending `timer`. A
 * settlement writes immediately when the window has elapsed, and otherwise marks
 * the ledger dirty and arms a single trailing write for the end of the window — so
 * the last batch always reaches the file, however many settlements were merged
 * into it. The timer is never re-armed earlier and never duplicated, the write
 * always serializes the *live* ledger (a late timer therefore cannot publish stale
 * records), and a failed write leaves the ledger dirty and re-arms itself with a
 * bounded backoff instead of losing the batch.
 * @param options - path, save function, clock, timer and failure hook.
 * @returns the scheduler and its state.
 */
function createPersist({
  path,
  save = saveLedger,
  // Resolved through the globals on every call, so a spec that installs fake
  // timers drives this schedule as well.
  now = () => Date.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (handle) => clearTimeout(handle),
  intervalMs = SAVE_INTERVAL_MS,
  maxRetryMs = RETRY_MAX_MS,
  onFailure = () => {},
}) {
  let dirty = false;
  let timer = null;
  let lastWrittenAt = 0;
  let lastAttemptAt = 0;
  let failures = 0;
  let writes = 0;
  let lastError = null;
  let retryMs = intervalMs;

  const clearTimer = () => {
    if (timer === null) return;
    cancel(timer);
    timer = null;
  };

  const write = (records) => {
    lastAttemptAt = now();
    const result = save(path, records);
    if (result === true) {
      writes += 1;
      failures = 0;
      retryMs = intervalMs;
      lastError = null;
      lastWrittenAt = lastAttemptAt;
      dirty = false;
      return true;
    }
    failures += 1;
    lastError = result;
    retryMs = Math.min(retryMs * 2, maxRetryMs);
    // The batch is still only in memory: keep it dirty so the next attempt — or
    // the next settlement — writes everything, and try again on its own.
    dirty = true;
    onFailure(lastError, failures);
    return false;
  };

  const arm = (records, delay) => {
    if (timer !== null || !dirty) return;
    timer = schedule(() => {
      timer = null;
      if (!dirty) return;
      write(records);
      if (dirty) arm(records, retryMs);
    }, Math.max(0, delay));
  };

  return {
    /** A settlement landed: write now when the window allows, else arm the tail. */
    touch(records) {
      dirty = true;
      const elapsed = now() - lastWrittenAt;
      if (elapsed >= intervalMs) {
        clearTimer();
        write(records);
        if (dirty) arm(records, retryMs);
        return;
      }
      arm(records, intervalMs - elapsed);
    },
    /** Unloading: publish the pending batch at once and stop the schedule. */
    flush(records) {
      clearTimer();
      if (dirty) write(records);
    },
    state() {
      return {
        dirty,
        pending: timer !== null,
        lastWrittenAt: lastWrittenAt === 0 ? null : lastWrittenAt,
        lastAttemptAt: lastAttemptAt === 0 ? null : lastAttemptAt,
        writes,
        failures,
        lastError,
      };
    },
  };
}

/**
 * Attach the settlement listener, retrying until the hub accepts it.
 *
 * A registry that is composing, or whose event hub is momentarily unreachable,
 * must not leave this row recording nothing for the rest of the process: the
 * subscription is retried behind an exponential backoff and its state is reported
 * on the route. Replacing the registry itself is the loader's business — this row
 * injects `jobs`, so cordis disposes and re-applies it with the service.
 * @param hub - `ctx.jobs.events`.
 * @param listener - the settlement listener.
 * @param options - logger, timers and backoff.
 * @returns the health record and a disposer.
 */
function subscribeJobs(hub, listener, {
  logger,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (handle) => clearTimeout(handle),
  now = () => Date.now(),
  retryMs = SUBSCRIBE_RETRY_MS,
  maxRetryMs = RETRY_MAX_MS,
} = {}) {
  const health = { state: 'connecting', attempts: 0, since: null, lastError: null };
  let unsubscribe = null;
  let timer = null;
  let delay = retryMs;
  let stopped = false;

  const attach = () => {
    if (stopped) return;
    health.attempts += 1;
    try {
      unsubscribe = hub.subscribe({ owners: 'all' }, listener);
      health.state = 'subscribed';
      health.since = now();
      health.lastError = null;
      const attempts = health.attempts;
      delay = retryMs;
      if (attempts > 1) logger?.info?.(`job-stats: job event subscription recovered after ${String(attempts - 1)} failed attempt(s)`);
    } catch (error) {
      health.state = 'retrying';
      health.lastError = error instanceof Error ? error.message : String(error);
      const wait = delay;
      const attempts = health.attempts;
      // Low noise: the first failure, then only on every doubling attempt.
      if (attempts === 1 || (attempts & (attempts - 1)) === 0) {
        logger?.warn?.(`job-stats: cannot subscribe to job events (attempt ${String(attempts)}): ${health.lastError}; retrying in ${String(wait)}ms`);
      }
      timer = schedule(() => {
        timer = null;
        attach();
      }, wait);
      delay = Math.min(delay * 2, maxRetryMs);
    }
  };

  attach();

  return {
    health,
    dispose() {
      stopped = true;
      if (timer !== null) {
        cancel(timer);
        timer = null;
      }
      try {
        unsubscribe?.();
      } catch {
        /* a released hub is not an error */
      }
      unsubscribe = null;
    },
  };
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
  const resolved = ledgerPathFor();
  const path = resolved.path;
  const loaded = loadLedger(path);
  const outcomes = loaded.records;
  const boot = randomUUID().slice(0, 8);
  const persist = createPersist({
    path,
    onFailure: (message, failures) => {
      // Low noise: the first failure and then only every doubling.
      if (failures === 1 || (failures & (failures - 1)) === 0) {
        ctx.logger?.warn?.(`job-stats: cannot write the ledger at ${path} (failure ${String(failures)}): ${message}`);
      }
    },
  });
  ctx.logger?.info?.(
    `job-stats: ledger ${path} (${resolved.source}), ${String(loaded.loaded)} recorded job outcome(s) loaded (${loaded.note})`,
  );

  const hub = ctx.jobs?.events;
  const subscription = subscribeJobs(hub, (event) => {
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
    persist.touch(outcomes);
  }, { logger: ctx.logger });

  ctx.effect(() => () => {
    subscription.dispose();
    persist.flush(outcomes);
    outcomes.clear();
  }, 'job-stats: settle ledger');

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
          // The recorder's own health travels with the records: a panel that sees
          // an empty ledger can tell "nothing settled" from "this row is broken".
          const body = JSON.stringify({
            schema: SCHEMA,
            outcomes: list,
            recorder: {
              durable: true,
              path,
              pathSource: resolved.source,
              boot,
              records: outcomes.size,
              loadedFromFile: loaded.loaded,
              ledgerNote: loaded.note,
              persistence: persist.state(),
              subscription: subscription.health,
            },
          });
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
