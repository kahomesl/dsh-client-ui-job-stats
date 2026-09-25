/**
 * Preview host: mounts the plugin's own dock components in a page.
 *
 * It plays the part the renderer plays in the real app — a module table for
 * `require('react')`, the service context the bundle asks for, and the props the
 * dock composes (`sessionId`, the roster hook, `watchRows`, the translator) — so the
 * markup and copy in the screenshot are the shipped ones.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';

/** Dark-theme token values, read from the app's own palette. */
const TOKENS = `
:root{
  --dsw-alias-label-primary:#f9fafb;
  --dsw-alias-label-secondary:#cfd3d6;
  --dsw-alias-label-tertiary:#adb2b8;
  --dsw-alias-bg-layer-1:#232324;
  --dsw-alias-bg-layer-2:#2c2c2e;
  --dsw-alias-fill-l1:rgba(255,255,255,.05);
  --dsw-alias-border-l1:#ffffff0f;
  --dsw-alias-border-l3:#ffffff29;
  --dsw-alias-interactive-bg-hover:#ffffff14;
  --dsw-alias-state-business-primary:#7aaaff;
  --dsw-alias-state-success-primary:#22c55e;
  --dsw-alias-state-error-primary:#f25a5a;
  --dsw-alias-state-warn-label:#dd8629;
  --dsw-radius-md:8px;
}
body{margin:0;background:#1a1a1b;font:400 14px/22px "Segoe UI","Microsoft YaHei",system-ui,sans-serif}
[data-preview-frame]{display:flex;flex-direction:column;width:380px;height:100vh;margin:0 auto;box-sizing:border-box;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
[data-preview-strip]{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);flex:none}
[data-preview-body]{flex:1 1 auto;min-height:0;display:flex;overflow:hidden}
`;

/** The session the preview pretends to be. */
const SESSION = 'session-preview';
// Anchored to the clock so the running row's duration reads like a real one.
const NOW = Date.now();

/** Sample rows: the shapes this panel actually sees, with representative command lines. */
const ROWS = [
  {
    id: 'pwsh-21',
    owner: SESSION,
    kind: 'pwsh',
    label: 'cd D:\\AI\\dsh-client-ui-job-stats; $node=\'C:\\node.exe\'; & $node $pnpm install 2>&1 | Select-Object -Last 12',
    status: 'running',
    progress: '下载依赖中',
    startedAt: NOW - 41_000,
    output: { total: 18_432 },
  },
  {
    id: 'pwsh-20',
    owner: SESSION,
    kind: 'pwsh',
    label: 'cd D:\\AI\\dsh-client-ui-job-stats; git add -A; git commit -q -m "feat: durable host ledger"',
    status: 'completed',
    detail: 'exit code: 0',
    startedAt: NOW - 300_000,
    finishedAt: NOW - 294_000,
    output: { total: 1_204 },
  },
  {
    id: 'pwsh-19',
    owner: SESSION,
    kind: 'pwsh',
    label: '$node=\'C:\\node.exe\'; & $node \'D:\\AI\\dsh-client-ui-job-stats\\node_modules\\vitest\\vitest.mjs\' run',
    status: 'completed',
    detail: 'exit code: 0',
    startedAt: NOW - 600_000,
    finishedAt: NOW - 585_000,
    output: { total: 42_118 },
  },
  {
    id: 'pwsh-18',
    owner: SESSION,
    kind: 'pwsh',
    label: 'Start-Sleep -Seconds 75; $h=@{ \'User-Agent\'=\'probe\' }; $r=Invoke-WebRequest -Uri \'https://api.github.com/repos/x\'',
    status: 'failed',
    detail: 'exit code: 1',
    startedAt: NOW - 900_000,
    finishedAt: NOW - 880_000,
    output: { total: 3_512 },
  },
  {
    id: 'pwsh-17',
    owner: SESSION,
    kind: 'pwsh',
    label: '$p=\'D:\\AI\\dsh-client-ui-job-stats\\.job-stats\\ledger.json\'; $c=Get-Content $p -Raw | ConvertFrom-Json',
    status: 'completed',
    detail: 'exit code: 0',
    startedAt: NOW - 1_200_000,
    finishedAt: NOW - 1_199_000,
    output: { total: 986 },
  },
  {
    id: 'pwsh-16',
    owner: SESSION,
    kind: 'pwsh',
    label: 'Remove-Item node_modules -Recurse -Force -ErrorAction SilentlyContinue',
    status: 'killed',
    detail: 'signal: SIGINT',
    startedAt: NOW - 1_500_000,
    finishedAt: NOW - 1_470_000,
    output: { total: 210 },
  },
  {
    id: 'pwsh-15',
    owner: SESSION,
    kind: 'pwsh',
    label: 'Invoke-WebRequest -Uri \'https://api.github.com/repos/kahomesl/dsh-client-ui-job-stats/actions/runs\' -UseBasicParsing',
    status: 'completed',
    detail: 'exit code: 0',
    startedAt: NOW - 1_800_000,
    finishedAt: NOW - 1_798_000,
    output: { total: 7_640 },
  },
  {
    id: 'pwsh-14',
    owner: SESSION,
    kind: 'pwsh',
    label: 'Get-ChildItem -Force | Select-Object Mode,Name | Format-Table -AutoSize',
    status: 'completed',
    detail: 'exit code: 0',
    startedAt: NOW - 2_100_000,
    finishedAt: NOW - 2_100_000,
    output: { total: 1_502 },
  },
];

function installTokens() {
  const style = document.createElement('style');
  style.textContent = TOKENS;
  document.head.append(style);
}

/** Load the registered components out of the plugin bundle. */
function loadPlugin() {
  const registration = (window.__registrations ?? [])[0];
  if (registration === undefined) throw new Error('the plugin bundle did not register');
  return registration.factory((specifier) => {
    if (specifier === 'react') return React;
    throw new Error(`unexpected require: ${specifier}`);
  });
}

/** Mount one state: `list` (the panel) or `expanded` (a row opened). */
window.__preview = {
  mount(params) {
    installTokens();
    const face = loadPlugin();
    const dictionaries = {};
    const registered = { body: undefined, title: undefined };
    const slots = {
      inject(name, factory) {
        factory();
        return () => {};
      },
      register(spec, component) {
        if (spec.name === 'sidebar.right.pane.tab') registered.body = component;
        else if (spec.name === 'sidebar.right.pane.tab.title') registered.title = component;
        return () => {};
      },
    };
    const jobs = { state: {}, watchRows: () => () => {}, observe: () => () => {}, kill: async () => ({ ok: true }) };
    const dock = {
      effect(mount) { const dispose = mount(); return dispose; },
      slots,
      sidebarRightTabs: { register: () => () => {} },
    };
    const ctx = {
      effect(mount) { const dispose = mount(); return dispose; },
      inject(dependencies, mount) {
        if (dependencies.includes('sidebarRightTabs')) mount(dock);
        return undefined;
      },
      locale: {
        register(namespace, dictionary) { dictionaries[namespace] = dictionary; return () => {}; },
        bind() { return undefined; },
      },
      slots,
      jobs,
    };
    face.apply(ctx);

    const zh = dictionaries[Object.keys(dictionaries)[0]].zh;
    const t = (key, values) => String(zh[key] ?? key).replace(/\{(\w+)\}/gu, (match, name) => (
      values !== undefined && Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
    ));

    const root = createRoot(document.getElementById('dock'));
    root.render(React.createElement('div', { 'data-preview-frame': '' }, [
      React.createElement('div', { key: 'strip', 'data-preview-strip': '' },
        React.createElement(registered.title, { key: 'tab', useTabInfo: () => ({ tab: { id: 't1', title: zh.typeLabel } }) })),
      React.createElement('div', { key: 'body', 'data-preview-body': '' },
        React.createElement(registered.body, {
          key: 'panel',
          sessionId: SESSION,
          useJobs: (selector) => selector({ rows: { [SESSION]: ROWS } }),
          watchRows: () => () => {},
          t,
        })),
    ]));

    if (params.get('state') === 'expanded') {
      // Open the newest row so the screenshot shows the command and its facts.
      const timer = setInterval(() => {
        const toggle = document.querySelector('[data-role="job-row-toggle"]');
        if (toggle !== null) {
          toggle.click();
          clearInterval(timer);
        }
      }, 30);
    }
  },
};
