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
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { apply, inject, name } from '../lib/recorder.js';

/**
 * The ledger resolves its file from `DSH_HOME`/`DSH_PROFILE`, so every spec runs
 * against a throwaway home: a spec that forgot this would write into the real
 * profile's ledger — and read another spec's records back.
 */
let home;
let ledgerPath;
let previousHome;
let previousProfile;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-job-stats-spec-'));
  ledgerPath = join(home, 'profiles', 'spec', '.job-stats', 'ledger.json');
  previousHome = process.env.DSH_HOME;
  previousProfile = process.env.DSH_PROFILE;
  process.env.DSH_HOME = home;
  process.env.DSH_PROFILE = 'spec';
});

afterEach(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
  if (previousProfile === undefined) delete process.env.DSH_PROFILE;
  else process.env.DSH_PROFILE = previousProfile;
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
function createHost({ withWebServer = true } = {}) {
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
  const subscriptions = [];
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
  return { ctx, emit, get, routes, subscriptions, effects };
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

  test('stays in memory when no host home is known', () => {
    delete process.env.DSH_HOME;
    delete process.env.DSH_PROFILE;
    const host = createHost();
    expect(() => apply(host.ctx)).not.toThrow();
    host.emit({ type: 'settled', job: settledJob({ id: 'memory-only' }) });
    expect(host.get('/dsh-job-stats/outcomes').json().outcomes.map((record) => record.id)).toEqual(['memory-only']);
    expect(existsSync(join(home, 'profiles', 'spec', '.job-stats'))).toBe(false);
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
