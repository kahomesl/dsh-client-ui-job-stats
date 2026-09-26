/**
 * Host half: the terminal-outcome ledger.
 *
 * The browser can never see a collected command's settlement — its roster record
 * is removed inside the coalescing window that would have reported it — so the
 * registry's own event stream is the only witness. These specs drive that stream
 * through the recorder's real subscription, read the route it serves, and check
 * the ledger file it keeps.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { apply, assertImportFits, inject, ledgerPathFor, name, resolveHome } from '../lib/recorder.js';

/**
 * The ledger resolves its file from the host's own facts, so every spec runs
 * against a throwaway home: a spec that forgot this would write into the real
 * profile's ledger — and read another spec's records back. `DSH_PROFILE_DIR`
 * outranks the other facts, so a harness that exports it (the DSH agent shell
 * does) is neutralised here too.
 */
let home;
let ledgerPath;
let previousHome;
let previousProfile;
let previousProfileDirectory;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-job-stats-spec-'));
  ledgerPath = join(home, 'profiles', 'spec', '.job-stats', 'ledger.json');
  previousHome = process.env.DSH_HOME;
  previousProfile = process.env.DSH_PROFILE;
  previousProfileDirectory = process.env.DSH_PROFILE_DIR;
  process.env.DSH_HOME = home;
  process.env.DSH_PROFILE = 'spec';
  delete process.env.DSH_PROFILE_DIR;
});

afterEach(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
  if (previousProfile === undefined) delete process.env.DSH_PROFILE;
  else process.env.DSH_PROFILE = previousProfile;
  if (previousProfileDirectory === undefined) delete process.env.DSH_PROFILE_DIR;
  else process.env.DSH_PROFILE_DIR = previousProfileDirectory;
  rmSync(home, { recursive: true, force: true });
});

/** The ledger file's records, or an empty list when it was never written. */
function fileRecords() {
  try {
    return JSON.parse(readFileSync(ledgerPath, 'utf8')).records;
  } catch {
    return [];
  }
}

/** A settled job projection, as the registry's `settled` event carries it. */
function settledJob(overrides = {}) {
  return {
    id: 'pwsh-1',
    owner: 'session-a',
    kind: 'pwsh',
    label: 'pnpm install',
    status: 'completed',
    detail: 'exit code: 0',
    startedAt: 1_700_000_000_000,
    finishedAt: 1_700_000_012_000,
    output: { total: 2_048, earliest: 0 },
    ...overrides,
  };
}

/** A Host context stub carrying the registry seam and a capture of the route. */
function createHost({ withWebServer = true, failSubscribes = 0 } = {}) {
  const listeners = new Set();
  const routes = [];
  const effects = [];
  const ctx = {
    effect(mount) {
      const dispose = mount();
      effects.push(typeof dispose === 'function' ? dispose : () => {});
      return dispose;
    },
    inject(dependencies, mount) {
      if (withWebServer && dependencies.includes('webServer')) mount({ webServer: ctx.webServer, effect: ctx.effect });
      return undefined;
    },
    jobs: {
      events: {
        subscribe(filter, listener) {
          subscriptions.push(filter);
          // A hub that is not ready yet: the recorder is expected to retry.
          if (attempts++ < failSubscribes) throw new Error('the event hub is not ready');
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    },
    webServer: {
      register(route) {
        routes.push(route);
        return () => {
          const index = routes.indexOf(route);
          if (index >= 0) routes.splice(index, 1);
        };
      },
    },
  };
  let attempts = 0;
  const subscriptions = [];
  /** Everything the recorder logged, so the low-noise rules are testable. */
  const logs = { warn: [], info: [] };
  ctx.logger = {
    warn: (message) => logs.warn.push(String(message)),
    info: (message) => logs.info.push(String(message)),
  };
  const emit = (event) => {
    for (const listener of [...listeners]) listener(event);
  };
  const get = (url, method = 'GET') => {
    const route = routes.find((candidate) => candidate.kind === 'exact');
    const response = {
      status: undefined,
      headers: undefined,
      body: undefined,
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
      },
      end(body) {
        this.body = body;
      },
    };
    // No route means the row was disposed (or never served one): the request is
    // answered by nothing, which is what the harness reports.
    if (route === undefined) {
      response.status = 404;
      return { ...response, json: () => undefined };
    }
    route.handler({ method, url }, response);
    return { ...response, json: () => JSON.parse(response.body) };
  };
  return { ctx, emit, get, routes, subscriptions, effects, logs };
}

describe('the recorder row', () => {
  test('asks for the registry and nothing it cannot live without', () => {
    expect(name).toBe('job-stats-recorder');
    expect(inject).toEqual(['jobs']);
  });

  test('subscribes to every owner’s events and serves one exact route', () => {
    const host = createHost();
    apply(host.ctx);
    expect(host.subscriptions).toEqual([{ owners: 'all' }]);
    expect(host.routes).toHaveLength(1);
    expect(host.routes[0].kind).toBe('exact');
    expect(host.routes[0].path).toBe('/dsh-job-stats/outcomes');
  });

  test('records a settlement the browser could never see', () => {
    const host = createHost();
    apply(host.ctx);
    host.emit({ type: 'settled', job: settledJob() });
    const answer = host.get('/dsh-job-stats/outcomes?sessionId=session-a');
    expect(answer.status).toBe(200);
    expect(answer.headers['cache-control']).toBe('no-store');
    expect(answer.json().schema).toBe('dsh-job-stats/outcomes/v1');
    expect(answer.json().outcomes).toEqual([{
      key: expect.stringMatching(/:session-a:pwsh-1$/u),
      bootId: expect.any(String),
      id: 'pwsh-1',
      sessionId: 'session-a',
      kind: 'pwsh',
      label: 'pnpm install',
      status: 'completed',
      detail: 'exit code: 0',
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_012_000,
      bytes: 2_048,
    }]);
  });

  test('keeps each session’s outcomes apart, and shares unowned ones', () => {
    const host = createHost();
    apply(host.ctx);
    host.emit({ type: 'settled', job: settledJob({ id: 'mine' }) });
    host.emit({ type: 'settled', job: settledJob({ id: 'theirs', owner: 'session-b' }) });
    host.emit({ type: 'settled', job: settledJob({ id: 'shared', owner: undefined, status: 'killed' }) });

    const mine = host.get('/dsh-job-stats/outcomes?sessionId=session-a').json().outcomes.map((record) => record.id);
    expect(mine).toEqual(['mine', 'shared']);
    const theirs = host.get('/dsh-job-stats/outcomes?sessionId=session-b').json().outcomes.map((record) => record.id);
    expect(theirs).toEqual(['theirs', 'shared']);
    // Without a session every record is served, which is what a caller asking for
    // the whole process sees.
    expect(host.get('/dsh-job-stats/outcomes').json().outcomes).toHaveLength(3);
  });

  test('records settlements only, and only terminal ones', () => {
    const host = createHost();
    apply(host.ctx);
    host.emit({ type: 'registered', job: settledJob({ id: 'live', status: 'running' }) });
    host.emit({ type: 'progress', job: settledJob({ id: 'live', status: 'running' }) });
    host.emit({ type: 'stopping', job: settledJob({ id: 'live', status: 'stopping' }) });
    host.emit({ type: 'removed', job: settledJob({ id: 'live' }) });
    expect(host.get('/dsh-job-stats/outcomes').json().outcomes).toEqual([]);
    host.emit({ type: 'settled', job: settledJob({ id: 'live' }) });
    expect(host.get('/dsh-job-stats/outcomes').json().outcomes.map((record) => record.id)).toEqual(['live']);
  });

  test('survives forged events, and re-settling one job replaces its record', () => {
    const host = createHost();
    apply(host.ctx);
    for (const event of [null, undefined, {}, { type: 'settled' }, { type: 'settled', job: null }, { type: 'settled', job: { id: '' } }]) {
      expect(() => host.emit(event)).not.toThrow();
    }
    expect(host.get('/dsh-job-stats/outcomes').json().outcomes).toEqual([]);

    host.emit({ type: 'settled', job: settledJob({ status: 'failed', detail: 'exit 1' }) });
    host.emit({ type: 'settled', job: settledJob({ status: 'completed', detail: 'exit code: 0' }) });
    const outcomes = host.get('/dsh-job-stats/outcomes').json().outcomes;
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].status).toBe('completed');
  });

  test('keeps 200 records per session, the oldest settlements first out', () => {
    const host = createHost();
    apply(host.ctx);
    for (let index = 0; index < 250; index += 1) {
      host.emit({ type: 'settled', job: settledJob({ id: `job-${index}` }) });
    }
    const outcomes = host.get('/dsh-job-stats/outcomes').json().outcomes;
    expect(outcomes).toHaveLength(200);
    expect(outcomes[0].id).toBe('job-50');
    expect(outcomes.at(-1).id).toBe('job-249');
  });

  test('answers a non-GET with 405 and stops when it is disposed', () => {
    const host = createHost();
    apply(host.ctx);
    const refused = host.get('/dsh-job-stats/outcomes', 'POST');
    expect(refused.status).toBe(405);
    expect(refused.headers.allow).toBe('GET');

    host.emit({ type: 'settled', job: settledJob() });
    for (const dispose of host.effects) dispose();
    expect(host.routes).toHaveLength(0);
    expect(host.get('/dsh-job-stats/outcomes').status).toBe(404);
    // The subscription is released too: a later settlement is not recorded anywhere.
    expect(() => host.emit({ type: 'settled', job: settledJob({ id: 'after' }) })).not.toThrow();
  });

  test('still records when the composition serves no route', () => {
    const host = createHost({ withWebServer: false });
    // A Host without a web server must not fail activation: the recorder simply has
    // no way to be read, and the panel falls back to its own ledger.
    expect(() => apply(host.ctx)).not.toThrow();
    expect(host.routes).toHaveLength(0);
    expect(() => host.emit({ type: 'settled', job: settledJob() })).not.toThrow();
  });

  test('does not touch the registry beyond subscribing', () => {
    const host = createHost();
    const list = vi.fn();
    host.ctx.jobs.list = list;
    apply(host.ctx);
    host.emit({ type: 'settled', job: settledJob() });
    host.get('/dsh-job-stats/outcomes?sessionId=session-a');
    expect(list).not.toHaveBeenCalled();
  });
});

describe('the ledger file', () => {
  test('writes settlements durably and serves them after a restart', () => {
    const first = createHost();
    apply(first.ctx);
    first.emit({ type: 'settled', job: settledJob({ id: 'before-restart', owner: 'session-a' }) });
    first.emit({ type: 'settled', job: settledJob({ id: 'other', owner: 'session-b' }) });
    for (const dispose of [...first.effects].reverse()) dispose();

    expect(fileRecords().map((record) => record.id)).toEqual(['before-restart', 'other']);

    // A fresh process: the ring is empty until the file is read back.
    const second = createHost();
    apply(second.ctx);
    const served = second.get('/dsh-job-stats/outcomes?sessionId=session-a').json().outcomes;
    expect(served.map((record) => record.id)).toEqual(['before-restart']);
    expect(served[0].status).toBe('completed');
    expect(served[0].detail).toBe('exit code: 0');
  });

  test('keeps the file small: 200 settled commands stay well under 120 KB', () => {
    const host = createHost();
    apply(host.ctx);
    // A command label of the length this panel actually sees.
    const label = `cd D:\\AI\\some-project && pnpm exec vitest run --reporter=verbose ${'x'.repeat(60)}`;
    for (let index = 0; index < 200; index += 1) {
      host.emit({ type: 'settled', job: settledJob({ id: `pwsh-${index}`, label }) });
    }
    for (const dispose of [...host.effects].reverse()) dispose();
    const size = readFileSync(ledgerPath, 'utf8').length;
    expect(size).toBeLessThan(120 * 1024);
    expect(fileRecords()).toHaveLength(200);
  });

  test('truncates a very long label so one command cannot bloat the file', () => {
    const host = createHost();
    apply(host.ctx);
    host.emit({ type: 'settled', job: settledJob({ id: 'huge', label: 'y'.repeat(50_000) }) });
    for (const dispose of [...host.effects].reverse()) dispose();
    const [record] = fileRecords();
    expect(record.label).toHaveLength(2000);
  });

  test('drops the least recently settled sessions once it holds too many', () => {
    const host = createHost();
    apply(host.ctx);
    for (let index = 0; index < 33; index += 1) {
      host.emit({ type: 'settled', job: settledJob({ id: `job-${index}`, owner: `session-${index}`, finishedAt: 1_700_000_000_000 + index }) });
    }
    for (const dispose of [...host.effects].reverse()) dispose();
    const kept = new Set(fileRecords().map((record) => record.sessionId));
    expect(kept.size).toBe(32);
    expect(kept.has('session-0')).toBe(false);
    expect(kept.has('session-32')).toBe(true);
  });

  test('a corrupt ledger starts empty instead of refusing to boot', () => {
    mkdirSync(dirname(ledgerPath), { recursive: true });
    writeFileSync(ledgerPath, '{ not json at all');
    const host = createHost();
    expect(() => apply(host.ctx)).not.toThrow();
    expect(host.get('/dsh-job-stats/outcomes').json().outcomes).toEqual([]);
    // It heals on the next settlement rather than staying broken.
    host.emit({ type: 'settled', job: settledJob({ id: 'after-corruption' }) });
    for (const dispose of [...host.effects].reverse()) dispose();
    expect(fileRecords().map((record) => record.id)).toEqual(['after-corruption']);
  });

  test('reads the ledger of the profile the launcher named on argv', () => {
    // The Desktop host exports neither DSH_HOME nor DSH_PROFILE, and passes the
    // profile directory as an argument instead: without this rule the ledger was
    // silently memory-only, which is what made a restart lose everything between
    // the two runs.
    const base = join(home, 'harness');
    const profile = join(base, 'profiles', 'desktop');
    const resolved = ledgerPathFor({
      env: {},
      argv: ['node.exe', 'app.asar/dsh', profile, '--no-open'],
      home: base,
    });
    expect(resolved).toEqual({ path: join(profile, '.job-stats', 'ledger.json'), source: 'launcher argument' });
  });

  test('ignores an unrelated absolute argument and keeps its own home', () => {
    const base = join(home, 'harness');
    const elsewhere = join(home, 'somewhere', 'desktop');
    expect(ledgerPathFor({ env: {}, argv: ['node.exe', elsewhere], home: base })).toEqual({
      path: join(base, '.job-stats', 'ledger.json'),
      source: 'harness home',
    });
  });

  test('falls back to ~/.dsh exactly as the framework does', () => {
    expect(resolveHome({})).toBe(join(homedir(), '.dsh'));
    expect(resolveHome({ DSH_HOME: 'C:\\explicit' })).toBe('C:\\explicit');
    const home = join(tmpdir(), 'dsh-job-stats-home');
    expect(ledgerPathFor({ env: {}, argv: [], home })).toEqual({
      path: join(home, '.job-stats', 'ledger.json'),
      source: 'harness home',
    });
  });

  test('prefers an exported profile directory, then a named profile', () => {
    const base = join(home, 'harness');
    expect(ledgerPathFor({ env: { DSH_PROFILE_DIR: join(base, 'profiles', 'desk') }, argv: [], home: base }).source).toBe('DSH_PROFILE_DIR');
    expect(ledgerPathFor({ env: { DSH_PROFILE: 'desk' }, argv: [], home: base })).toEqual({
      path: join(base, 'profiles', 'desk', '.job-stats', 'ledger.json'),
      source: 'DSH_PROFILE',
    });
  });
});

describe('the recorder as a real cordis plugin', () => {
  /** A cordis service bundle providing the two seats the recorder asks for. */
  function services() {
    const listeners = new Set();
    const routes = [];
    class Jobs extends (class {}) {}
    const jobs = {
      events: {
        subscribe(filter, listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    };
    const webServer = {
      register(route) {
        routes.push(route);
        return () => {
          const index = routes.indexOf(route);
          if (index >= 0) routes.splice(index, 1);
        };
      },
    };
    return { jobs, webServer, routes, emit: (event) => { for (const listener of [...listeners]) listener(event); } };
  }

  test('mounts through ctx.plugin, serves the route, and unmounts clean', async () => {
    const { jobs, webServer, routes, emit } = services();
    const ctx = new Context();
    ctx.provide('jobs', jobs);
    ctx.provide('webServer', webServer);

    // The Loader treats an imported module as the plugin, so the namespace's
    // `inject` / `apply` / `name` exports are the whole contract.
    const fiber = ctx.plugin(await import('../lib/recorder.js'));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(fiber).toBeDefined();
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('/dsh-job-stats/outcomes');

    emit({ type: 'settled', job: settledJob({ id: 'real', owner: 'session-a' }) });
    const response = {
      writeHead() {},
      end(body) {
        this.body = body;
      },
    };
    routes[0].handler({ method: 'GET', url: '/dsh-job-stats/outcomes?sessionId=session-a' }, response);
    expect(JSON.parse(response.body).outcomes.map((record) => record.id)).toEqual(['real']);

    await fiber.dispose();
    expect(routes).toHaveLength(0);
  });
});

describe('durable persistence', () => {
  /** The recorder's own health block, as the panel's route serves it. */
  const health = (host) => host.get('/dsh-job-stats/outcomes').json().recorder;

  test('trailing flush persists settlements skipped by the write throttle', () => {
    vi.useFakeTimers();
    try {
      const host = createHost();
      apply(host.ctx);
      host.emit({ type: 'settled', job: settledJob({ id: 'A' }) });
      vi.advanceTimersByTime(100);
      host.emit({ type: 'settled', job: settledJob({ id: 'B' }) });
      vi.advanceTimersByTime(100);
      host.emit({ type: 'settled', job: settledJob({ id: 'C' }) });
      // Inside the window the file holds only what the immediate write published:
      // that is the throttle doing its job.
      expect(fileRecords().map((record) => record.id)).toEqual(['A']);
      // The window ends and the merged batch lands: nothing is left behind.
      vi.advanceTimersByTime(1_000);
      expect(fileRecords().map((record) => record.id)).toEqual(['A', 'B', 'C']);
      expect(health(host).persistence.dirty).toBe(false);
      expect(health(host).persistence.pending).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test('dispose flushes a pending trailing write immediately', () => {
    vi.useFakeTimers();
    try {
      const host = createHost();
      apply(host.ctx);
      host.emit({ type: 'settled', job: settledJob({ id: 'A' }) });
      vi.advanceTimersByTime(100);
      host.emit({ type: 'settled', job: settledJob({ id: 'B' }) });
      expect(fileRecords().map((record) => record.id)).toEqual(['A']);
      for (const dispose of [...host.effects].reverse()) dispose();
      expect(fileRecords().map((record) => record.id)).toEqual(['A', 'B']);
    } finally {
      vi.useRealTimers();
    }
  });

  test('a scheduled trailing write cannot overwrite a newer ledger', () => {
    vi.useFakeTimers();
    try {
      const host = createHost();
      apply(host.ctx);
      host.emit({ type: 'settled', job: settledJob({ id: 'A' }) });
      vi.advanceTimersByTime(100);
      host.emit({ type: 'settled', job: settledJob({ id: 'B' }) });
      vi.advanceTimersByTime(500);
      // Arrives while the tail is armed: the timer is neither duplicated nor reset.
      host.emit({ type: 'settled', job: settledJob({ id: 'C' }) });
      expect(health(host).persistence.pending).toBe(true);
      vi.advanceTimersByTime(500);
      // The tail serialized the live ledger, so C is on disk rather than the B snapshot.
      expect(fileRecords().map((record) => record.id)).toEqual(['A', 'B', 'C']);
      expect(health(host).persistence.writes).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test('save failure leaves the ledger dirty for retry', () => {
    vi.useFakeTimers();
    try {
      // A file where the ledger's directory belongs makes every write fail.
      writeFileSync(join(home, 'profiles'), 'not a directory');
      const host = createHost();
      apply(host.ctx);
      host.emit({ type: 'settled', job: settledJob({ id: 'A' }) });
      expect(health(host).persistence.failures).toBe(1);
      expect(health(host).persistence.dirty).toBe(true);
      expect(health(host).persistence.lastError).toBeTruthy();
      expect(host.logs.warn.join('\n')).toContain('cannot write the ledger');

      // The obstruction goes away: the batch is still in memory and lands on retry.
      rmSync(join(home, 'profiles'), { force: true });
      vi.advanceTimersByTime(30_000);
      expect(fileRecords().map((record) => record.id)).toEqual(['A']);
      expect(health(host).persistence.dirty).toBe(false);
      expect(health(host).persistence.failures).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test('rapid settlements survive a simulated ungraceful restart after trailing flush', () => {
    vi.useFakeTimers();
    try {
      const first = createHost();
      apply(first.ctx);
      for (const id of ['A', 'B', 'C']) {
        first.emit({ type: 'settled', job: settledJob({ id }) });
        vi.advanceTimersByTime(100);
      }
      // The process dies here: no disposer runs.
      vi.advanceTimersByTime(1_000);
      const second = createHost();
      apply(second.ctx);
      expect(second.get('/dsh-job-stats/outcomes?sessionId=session-a').json().outcomes.map((record) => record.id)).toEqual(['A', 'B', 'C']);
    } finally {
      vi.useRealTimers();
    }
  });

  test('without the trailing flush the same burst would have lost its tail', () => {
    vi.useFakeTimers();
    try {
      const host = createHost();
      apply(host.ctx);
      // Sanity check on the shape of the bug this replaced: the file is behind the
      // in-memory ledger for exactly as long as the window lasts, so a kill inside
      // it loses everything after the first write. The assertion is the reason the
      // trailing write exists.
      host.emit({ type: 'settled', job: settledJob({ id: 'A' }) });
      vi.advanceTimersByTime(100);
      host.emit({ type: 'settled', job: settledJob({ id: 'B' }) });
      expect(fileRecords().map((record) => record.id)).toEqual(['A']);
      expect(host.get('/dsh-job-stats/outcomes').json().outcomes.map((record) => record.id)).toEqual(['A', 'B']);
      expect(health(host).persistence.dirty).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the ledger file format', () => {
  test('ignores a file carrying a schema it does not own', () => {
    mkdirSync(dirname(ledgerPath), { recursive: true });
    writeFileSync(ledgerPath, JSON.stringify({ schema: 'some-other-plugin/ledger/v9', records: [settledJob({ id: 'foreign' })] }));
    const host = createHost();
    apply(host.ctx);
    expect(host.get('/dsh-job-stats/outcomes').json().outcomes).toEqual([]);
    expect(host.get('/dsh-job-stats/outcomes').json().recorder.ledgerNote).toContain('ignored');
    expect(host.logs.info.join('\n')).toContain('ignored a file carrying schema');
  });

  test('recovers the batch a kill left in the temporary file', () => {
    mkdirSync(dirname(ledgerPath), { recursive: true });
    writeFileSync(`${ledgerPath}.tmp`, JSON.stringify({ schema: 'dsh-job-stats/ledger/v1', records: [settledJob({ id: 'recovered' })] }));
    const host = createHost();
    apply(host.ctx);
    expect(host.get('/dsh-job-stats/outcomes').json().outcomes.map((record) => record.id)).toEqual(['recovered']);
    expect(existsSync(ledgerPath)).toBe(true);
    expect(existsSync(`${ledgerPath}.tmp`)).toBe(false);
  });

  test('reports where the ledger lives and how it is doing', () => {
    const host = createHost();
    apply(host.ctx);
    host.emit({ type: 'settled', job: settledJob({ id: 'reported' }) });
    const block = host.get('/dsh-job-stats/outcomes').json().recorder;
    expect(block.durable).toBe(true);
    expect(block.path).toBe(ledgerPath);
    expect(block.pathSource).toBe('DSH_PROFILE');
    expect(block.records).toBe(1);
    expect(block.loadedFromFile).toBe(0);
    expect(block.persistence.writes).toBe(1);
    expect(block.persistence.dirty).toBe(false);
    expect(block.subscription).toEqual({ state: 'subscribed', attempts: 1, since: expect.any(Number), lastError: null });
    expect(typeof block.boot).toBe('string');
    // The records themselves are unchanged: the extra block is additive.
    expect(host.get('/dsh-job-stats/outcomes').json().schema).toBe('dsh-job-stats/outcomes/v1');
  });
});

describe('identity across Host boots', () => {
  const close = (host) => {
    for (const dispose of [...host.effects].reverse()) dispose();
  };

  test('two host boots may both contain pwsh-1 without overwriting each other', () => {
    const first = createHost();
    apply(first.ctx);
    first.emit({ type: 'settled', job: settledJob({ id: 'pwsh-1', startedAt: 100, finishedAt: 200 }) });
    close(first);
    const second = createHost();
    apply(second.ctx);
    second.emit({ type: 'settled', job: settledJob({ id: 'pwsh-1', startedAt: 300, finishedAt: 400 }) });
    close(second);
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    expect(ledger.schema).toBe('dsh-job-stats/ledger/v2');
    expect(ledger.records.map((record) => record.id)).toEqual(['pwsh-1', 'pwsh-1']);
    expect(new Set(ledger.records.map((record) => record.key)).size).toBe(2);
    expect(ledger.records[0].bootId).not.toBe(ledger.records[1].bootId);
  });

  test('same session survives restart with repeated job ids', () => {
    for (const offset of [0, 10_000]) {
      const host = createHost();
      apply(host.ctx);
      for (let n = 1; n <= 2; n += 1) {
        host.emit({ type: 'settled', job: settledJob({ id: `pwsh-${n}`, startedAt: offset + n, finishedAt: offset + n + 10 }) });
      }
      close(host);
    }
    expect(fileRecords().map((record) => record.id)).toEqual(['pwsh-1', 'pwsh-2', 'pwsh-1', 'pwsh-2']);
    const third = createHost();
    apply(third.ctx);
    expect(third.get('/dsh-job-stats/outcomes?sessionId=session-a').json().outcomes).toHaveLength(4);
    close(third);
  });

  test('different sessions never collide when id is repeated in the same registry', () => {
    const host = createHost();
    apply(host.ctx);
    host.emit({ type: 'settled', job: settledJob({ id: 'pwsh-1', owner: 'session-a' }) });
    host.emit({ type: 'settled', job: settledJob({ id: 'pwsh-1', owner: 'session-b' }) });
    close(host);
    expect(fileRecords()).toHaveLength(2);
    expect(new Set(fileRecords().map((record) => record.key)).size).toBe(2);
  });

  test('unowned job identity cannot collide with a session named _unowned_', () => {
    const host = createHost();
    apply(host.ctx);
    host.emit({ type: 'settled', job: settledJob({ id: 'pwsh-1', owner: undefined }) });
    host.emit({ type: 'settled', job: settledJob({ id: 'pwsh-1', owner: '_unowned_' }) });
    close(host);
    expect(fileRecords()).toHaveLength(2);
    expect(new Set(fileRecords().map((record) => record.key)).size).toBe(2);
    expect(fileRecords().map((record) => record.sessionId)).toEqual([null, '_unowned_']);
  });

  test('200-record pruning still uses oldest finishedAt rather than canonical key order', () => {
    const host = createHost();
    apply(host.ctx);
    host.emit({ type: 'settled', job: settledJob({ id: 'late', finishedAt: 5000 }) });
    host.emit({ type: 'settled', job: settledJob({ id: 'early', finishedAt: 1 }) });
    for (let n = 0; n < 199; n += 1) {
      host.emit({ type: 'settled', job: settledJob({ id: `item-${n}`, finishedAt: n + 2 }) });
    }
    close(host);
    const ids = fileRecords().map((record) => record.id);
    expect(ids).toHaveLength(200);
    expect(ids).toContain('late');
    expect(ids).not.toContain('early');
  });

  test('a v1 ledger loads into v2 without discarding surviving records', () => {
    mkdirSync(dirname(ledgerPath), { recursive: true });
    writeFileSync(ledgerPath, JSON.stringify({ schema: 'dsh-job-stats/ledger/v1', records: [
      { id: 'pwsh-1', sessionId: 'session-a', status: 'completed', startedAt: 100, finishedAt: 200 },
    ] }));
    const host = createHost();
    apply(host.ctx);
    host.emit({ type: 'settled', job: settledJob({ id: 'pwsh-1', startedAt: 300, finishedAt: 400 }) });
    close(host);
    expect(fileRecords()).toHaveLength(2);
    expect(fileRecords()[0].key).toMatch(/^legacy-v1:session-a:pwsh-1$/u);
  });

  test('refuses a full session or 33rd session before a staged import is acknowledged', () => {
    const existing = Array.from({ length: 200 }, (_, index) => ({ key: `new-${index}`, sessionId: 'session-a' }));
    expect(() => assertImportFits(existing, [{ key: 'old', sessionId: 'session-a' }])).toThrow(/200 records/u);
    const sessions = Array.from({ length: 32 }, (_, index) => ({ key: `new-${index}`, sessionId: `session-${index}` }));
    expect(() => assertImportFits(sessions, [{ key: 'old', sessionId: 'extra' }])).toThrow(/33 sessions/u);
  });

  test('a legal staged import above 8 MiB still loads under the 200/32 caps', () => {
    mkdirSync(dirname(ledgerPath), { recursive: true });
    const bootId = 'legacy-import-large';
    const records = [];
    for (let session = 0; session < 32; session += 1) {
      for (let index = 0; index < 200; index += 1) {
        records.push({ id: `pwsh-${index}`, sessionId: `session-${session}`, kind: 'pwsh',
          label: 'x'.repeat(1500), status: 'completed', startedAt: index + 1, finishedAt: index + 2 });
      }
    }
    const stage = `${ledgerPath}.legacy-import.json`;
    writeFileSync(stage, JSON.stringify({ schema: 'dsh-job-stats/legacy-import/v1', bootId, records }));
    expect(readFileSync(stage).length).toBeGreaterThan(8 * 1024 * 1024);
    const host = createHost();
    apply(host.ctx);
    expect(host.get('/dsh-job-stats/outcomes?sessionId=session-0').json().outcomes).toHaveLength(200);
    expect(fileRecords()).toHaveLength(6400);
    expect(existsSync(stage)).toBe(false);
    for (const dispose of [...host.effects].reverse()) dispose();
  });

  test('rejects empty owner rather than write a key that restart drops', () => {
    mkdirSync(dirname(ledgerPath), { recursive: true });
    const stage = `${ledgerPath}.legacy-import.json`;
    writeFileSync(stage, JSON.stringify({ schema: 'dsh-job-stats/legacy-import/v1', bootId: 'legacy-import-bad', records: [
      { id: 'pwsh-1', sessionId: '', status: 'completed', startedAt: 1, finishedAt: 2 },
    ] }));
    const host = createHost();
    apply(host.ctx);
    expect(host.get('/dsh-job-stats/outcomes').json().outcomes).toHaveLength(0);
    expect(existsSync(stage)).toBe(true);
    for (const dispose of [...host.effects].reverse()) dispose();
  });

  test('replaying the same staged import adds nothing', () => {
    mkdirSync(dirname(ledgerPath), { recursive: true });
    const staged = { schema: 'dsh-job-stats/legacy-import/v1', bootId: 'legacy-import-replay', records: [
      { id: 'pwsh-1', sessionId: 'session-a', kind: 'pwsh', label: 'legacy', status: 'completed', startedAt: 100, finishedAt: 200 },
    ] };
    const stage = `${ledgerPath}.legacy-import.json`;
    writeFileSync(stage, JSON.stringify(staged));
    const first = createHost();
    apply(first.ctx);
    expect(first.get('/dsh-job-stats/outcomes').json().outcomes).toHaveLength(1);
    expect(existsSync(stage)).toBe(false);
    for (const dispose of [...first.effects].reverse()) dispose();

    // A kill after the write but before the removal replays the same keys: the
    // import is idempotent because identity is the canonical key, not the file.
    writeFileSync(stage, JSON.stringify(staged));
    const second = createHost();
    apply(second.ctx);
    expect(second.get('/dsh-job-stats/outcomes').json().outcomes).toHaveLength(1);
    expect(existsSync(stage)).toBe(false);
    expect(fileRecords()).toHaveLength(1);
    for (const dispose of [...second.effects].reverse()) dispose();
  });

  test('staged legacy Host backup imports once without overwriting fresh jobs', () => {
    const host = createHost();
    apply(host.ctx);
    host.emit({ type: 'settled', job: settledJob({ id: 'pwsh-1', startedAt: 300, finishedAt: 400 }) });
    const stage = `${ledgerPath}.legacy-import.json`;
    writeFileSync(stage, JSON.stringify({ schema: 'dsh-job-stats/legacy-import/v1', bootId: 'legacy-import-20260925-232958', records: [
      { id: 'pwsh-1', sessionId: 'session-a', kind: 'pwsh', label: 'old', status: 'completed', startedAt: 100, finishedAt: 200, bytes: 1 },
    ] }));
    const answer = host.get('/dsh-job-stats/outcomes?sessionId=session-a').json();
    expect(answer.outcomes).toHaveLength(2);
    expect(answer.outcomes.map((record) => record.id)).toEqual(['pwsh-1', 'pwsh-1']);
    expect(fileRecords()).toHaveLength(2);
    expect(existsSync(stage)).toBe(false);
    expect(host.get('/dsh-job-stats/outcomes').json().outcomes).toHaveLength(2);
    close(host);
  });
});

describe('the event subscription', () => {
  test('retries until the hub accepts it, then records again', () => {
    vi.useFakeTimers();
    try {
      const host = createHost({ failSubscribes: 2 });
      apply(host.ctx);
      expect(host.get('/dsh-job-stats/outcomes').json().recorder.subscription.state).toBe('retrying');
      expect(host.logs.warn.join('\n')).toContain('cannot subscribe to job events');

      // First retry after 1s, second after 2s: the third attempt succeeds.
      vi.advanceTimersByTime(1_000);
      expect(host.subscriptions).toHaveLength(2);
      vi.advanceTimersByTime(2_000);
      expect(host.subscriptions).toHaveLength(3);
      const block = host.get('/dsh-job-stats/outcomes').json().recorder;
      expect(block.subscription.state).toBe('subscribed');
      expect(block.subscription.attempts).toBe(3);

      // The recovered subscription is live: a settlement is recorded and written.
      host.emit({ type: 'settled', job: settledJob({ id: 'after-retry' }) });
      expect(host.get('/dsh-job-stats/outcomes').json().outcomes.map((record) => record.id)).toEqual(['after-retry']);
      expect(host.logs.info.join('\n')).toContain('subscription recovered');

      // Unloading cancels a pending retry instead of leaving a timer behind.
      for (const dispose of [...host.effects].reverse()) dispose();
      vi.advanceTimersByTime(60_000);
      expect(host.subscriptions).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  test('keeps one warning per doubling while the hub stays unreachable', () => {
    vi.useFakeTimers();
    try {
      const host = createHost({ failSubscribes: 100 });
      apply(host.ctx);
      vi.advanceTimersByTime(1_000 + 2_000 + 4_000 + 8_000);
      // Attempts 1..5 happened; only 1, 2 and 4 are announced.
      expect(host.subscriptions).toHaveLength(5);
      expect(host.logs.warn).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
