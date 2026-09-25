/**
 * Spec harness.
 *
 * Two halves, both deliberately real:
 *
 * - the shipped browser bundle is loaded exactly as the page loads it (a classic
 *   script registering one lazy factory into `window.__ModuleLoader__`), and
 *   materialized with React and nothing else, so an accidental Harness Client
 *   import fails the spec instead of the running page;
 * - the slot registry is the production `SlotCore` from
 *   `@deepseek-ai/dsh-client-ui-slots`, so declaration, registration, shadowing
 *   and disposal behaviour under test is the framework's, not this harness's.
 *
 * Everything else (locale service, roster store, session binding source) is a
 * minimal stand-in for the service this plugin injects, with the same shape.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';

/**
 * Absolute path of the browser half under test. Vitest's jsdom environment gives
 * modules a document-relative `import.meta.url`, so the package root is taken
 * from the test run's working directory (the project root) instead.
 */
export const BUNDLE_PATH = resolve(process.cwd(), 'client', 'client.js');

/** Substitute `{name}` placeholders exactly as the client locale service does. */
export function format(template, values) {
  return String(template).replace(/\{(\w+)\}/gu, (match, key) => (
    Object.prototype.hasOwnProperty.call(values ?? {}, key) ? String(values[key]) : match
  ));
}

/**
 * Load the browser bundle the way the module system does.
 * @returns the single `{ id, factory }` registration the bundle makes.
 */
export function loadRegistration() {
  const source = readFileSync(BUNDLE_PATH, 'utf8');
  const registrations = [];
  const window = {
    __ModuleLoader__: { load(registration) { registrations.push(registration); } },
    // The bundle reads browser storage for its accumulated ledger, exactly as it
    // would in a page; the shim hands it the jsdom store the specs control.
    localStorage: globalThis.localStorage,
    // Lifecycle events (`pagehide`) arrive on the page's own window, so the shim
    // delegates them to jsdom's rather than swallowing the registration.
    addEventListener: globalThis.addEventListener.bind(globalThis),
    removeEventListener: globalThis.removeEventListener.bind(globalThis),
  };
  // Bundles are classic scripts: no imports, no exports, one registration.
  new Function('window', source)(window);
  if (registrations.length !== 1) {
    throw new Error(`expected exactly one module registration, received ${registrations.length}`);
  }
  return registrations[0];
}

/**
 * Materialize the plugin face, recording every module request the factory makes.
 * @returns the registration, the plugin face, and the requested specifiers.
 */
export function materialize(registration = loadRegistration()) {
  const requests = [];
  const require = (specifier) => {
    requests.push(specifier);
    if (specifier === 'react') return React;
    throw new Error(`the bundle requested an unexpected module: ${specifier}`);
  };
  return { registration, face: registration.factory(require), requests };
}

/** A roster store shaped like `ctx.jobs.state` (whole-snapshot rows per session). */
export function createRosterStore(rows = {}) {
  const listeners = new Set();
  const state = { rows };
  return {
    state,
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Replace one session's rows and notify, as a roster frame would. */
    set(sessionId, next) {
      state.rows = { ...state.rows, [sessionId]: next };
      for (const listener of [...listeners]) listener();
    },
  };
}

/** The roster store hook the slot registry would inject as `useJobs`. */
export function createRosterHook(store) {
  return function useJobs(select) {
    return React.useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()));
  };
}

/** The current-session binding source ui-session publishes as `adapter.current`. */
export function createSessionSource(initialKey) {
  let value = { key: initialKey };
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Point the source at another session, as selecting one does. */
    select(key) {
      value = { key };
      for (const listener of [...listeners]) listener();
    },
  };
}

/**
 * A client context carrying the production slot core.
 * @param options - the selected session key and the initial roster.
 * @returns the context, its core, and the observations specs assert on.
 */
export function createContext(options = {}) {
  const core = new SlotCore();
  const disposers = [];
  const dictionaryCalls = [];
  const dictionaries = new Map();
  const watch = { opened: [], disposals: 0 };
  const roster = createRosterStore(options.rows ?? {});
  const session = createSessionSource(options.sessionKey);
  /** Disposer of the current frame declaration, when one is declared. */
  let frameDispose;

  /** Register the frame's own slots: ui-layout declares `main` (keyed, root) and
   *  ui-sidebar declares `sidebar.panellist` (list, root), both as children of an
   *  entry they own; ui-sidebar-right declares the dock's pane seats (keyed,
   *  session-scoped) the same way. */
  const declareFrame = () => {
    frameDispose = core.register({
      name: 'root',
      children: {
        main: { kind: 'keyed', scope: 'root' },
        'sidebar.panellist': { kind: 'list', scope: 'root' },
        'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' },
        'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session' },
      },
    }, () => null);
    disposers.push(frameDispose);
    return frameDispose;
  };

  /** Tear the frame declaration down, as unloading the shell plugin does. */
  const collapseFrame = () => {
    if (frameDispose === undefined) throw new Error('no frame declaration is active');
    const dispose = frameDispose;
    frameDispose = undefined;
    dispose();
  };
  const slots = {
    register: (options, component) => core.register(options, component),
    entries: (name) => core.entries(name),
    entriesOfSlot: (name) => core.entriesOfSlot(name),
    subscribe: (name, listener) => core.subscribe(name, listener),
    subscribeDeclaration: (name, listener) => core.subscribeDeclaration(name, listener),
    /**
     * Declaration-aware injection, mirroring the runtime registry: the mount
     * callback runs when the slot is declared and its registrations are released
     * when the declaration collapses or the injection is disposed.
     */
    inject(name, mount) {
      let installed;
      const declared = () => core.specDynamic(name) !== undefined;
      const install = () => {
        if (installed !== undefined || !declared()) return;
        const release = mount();
        installed = typeof release === 'function' ? release : () => {};
      };
      const uninstall = () => {
        if (installed === undefined) return;
        const release = installed;
        installed = undefined;
        release();
      };
      const off = core.subscribeDeclaration(name, () => {
        if (declared()) install();
        else uninstall();
      });
      install();
      return () => {
        off();
        uninstall();
      };
    },
  };

  const locale = {
    register(namespace, dicts) {
      dictionaryCalls.push({ namespace, locales: Object.keys(dicts) });
      dictionaries.set(namespace, dicts);
      return () => {};
    },
    bind(namespace) {
      const zh = dictionaries.get(namespace)?.zh ?? {};
      return (key, values) => format(zh[key] ?? key, values);
    },
    subscribe: () => () => {},
  };

  const jobs = {
    state: createRosterHook(roster),
    watchRows(sessionId) {
      watch.opened.push(sessionId);
      let closed = false;
      return () => {
        if (closed) return;
        closed = true;
        watch.disposals += 1;
      };
    },
  };

  /** The dock's tab-type registry, as `ctx.sidebarRightTabs` exposes it. */
  const tabTypes = [];
  const sidebarRightTabs = {
    register(definition) {
      if (tabTypes.includes(definition)) return () => {};
      tabTypes.push(definition);
      // The real registry owns the contribution through the caller's effect; the
      // harness disposes it with the same collection so teardown is observable.
      const dispose = () => {
        const index = tabTypes.indexOf(definition);
        if (index >= 0) tabTypes.splice(index, 1);
      };
      disposers.push(dispose);
      return dispose;
    },
    entries: () => tabTypes,
    /** The guide cards the dock's start page would render, in registry order. */
    guide: () => tabTypes.flatMap((definition) => (definition.guide ?? []).map((entry) => ({
      ...entry,
      kind: definition.kind,
      providerId: definition.id,
    }))).sort((left, right) => (left.order ?? 0) - (right.order ?? 0)),
  };

  const services = { slots, locale, jobs, uiSession: { adapter: { current: session } }, sidebarRightTabs };
  // A deployment may not compose a given service at all; omitting it here is what
  // "the right Sidebar is not in this profile" looks like to a plugin.
  for (const name of options.omitServices ?? []) delete services[name];
  const ctx = {
    ...services,
    get: (name) => services[name],
    effect(mount) {
      const dispose = mount();
      if (typeof dispose === 'function') disposers.push(dispose);
    },
    /**
     * Optional-service injection, as cordis runs it: the callback receives a
     * context carrying the named services, and never runs when one is missing.
     */
    inject(dependencies, callback) {
      for (const name of dependencies) if (services[name] === undefined) return;
      callback(ctx);
    },
  };

  return {
    core,
    ctx,
    disposers,
    dictionaryCalls,
    dictionaries,
    roster,
    session,
    watch,
    tabTypes,
    sidebarRightTabs,
    declareFrame,
    collapseFrame,
    /** Run every disposer in reverse registration order, as teardown does. */
    dispose() {
      for (const dispose of [...disposers].reverse()) dispose();
      disposers.length = 0;
    },
  };
}

/** The entry this plugin registered under one slot key. */
export function entryOf(core, slot, match) {
  const entries = core.entries(slot);
  const entry = entries.find((candidate) => match(candidate.options));
  if (entry === undefined) throw new Error(`no entry matched in slot "${slot}"`);
  return entry;
}

