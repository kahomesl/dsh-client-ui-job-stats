/**
 * The right Sidebar seat: the tab type, its start-page card, and the panel body.
 *
 * This is the plugin's only seat — the column the session header's 「打开侧边栏」
 * button (Ctrl+Alt+B) expands, next to the shipped 工作区文件 / 新建终端 / 浏览器
 * types. Two halves are pinned here: the tab *type* the dock's registry receives
 * (kind, title, and the guide card that is the visible button), and the panel the
 * tab *renders* for the session it was opened in.
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createContext, entryOf, format, materialize } from './support/harness.js';

/** The tab type this plugin owns, and the key its seats register under. */
const TAB_ID = 'dsh-client-ui-job-stats';
const TAB_KIND = 'job-stats';
const BASE = 1_700_000_000_000;

/** Mount the plugin on a fresh context. */
function mount(options) {
  const harness = createContext(options);
  const { face } = materialize();
  harness.declareFrame();
  face.apply(harness.ctx);
  return { harness, face };
}

/** One roster row, shaped like the job projection the session header lists. */
function job(overrides = {}) {
  return {
    id: 'job',
    kind: 'Bash',
    label: '示例命令',
    status: 'completed',
    startedAt: BASE,
    finishedAt: BASE + 12_000,
    output: { total: 1024 },
    ...overrides,
  };
}

/** Renderer-shaped props for the dock body of one session. */
function dockProps(harness, sessionId, namespace = 'jobStats') {
  const entry = entryOf(harness.core, 'sidebar.right.pane.tab', (options) => options.key === TAB_ID);
  const face = entry.inject(sessionId);
  const zh = harness.dictionaries.get(namespace)?.zh ?? {};
  const props = { sessionId, t: (key, values) => format(zh[key] ?? key, values), ...face };
  delete props.hooks;
  for (const [name, hook] of Object.entries(face.hooks ?? {})) {
    props[`use${name[0].toUpperCase()}${name.slice(1)}`] = hook;
  }
  return { Component: entry.component, props };
}

/** Render the dock body for one roster and return the view. */
function renderDock(rows, sessionId = 'session-tab') {
  const { harness } = mount({ rows: { [sessionId]: rows } });
  const { Component, props } = dockProps(harness, sessionId);
  return { harness, view: render(React.createElement(Component, props)) };
}

/** The rendered value of one dock figure. */
function figure(container, kind, name) {
  const node = container.querySelector(`[data-role="${kind}"][data-${kind}="${name}"]`);
  if (node === null) throw new Error(`${kind} ${name} is missing`);
  return node.querySelector('span+span').textContent;
}

/** Every rendered job row, in render order. */
function rows(container) {
  return [...container.querySelectorAll('[data-role="job-row"]')];
}

describe('tab type registration', () => {
  test('registers one dock type with a Chinese title and one guide card', () => {
    const { harness } = mount({ sessionKey: 'session-1' });
    expect(harness.tabTypes).toHaveLength(1);
    const definition = harness.tabTypes[0];
    expect(definition.id).toBe(TAB_ID);
    expect(definition.kind).toBe(TAB_KIND);
    // No band override: this kind is the plugin's own, so it shadows nothing.
    expect(definition.priority).toBeUndefined();
    expect(definition.title()).toBe('后台任务');

    const guide = harness.sidebarRightTabs.guide();
    expect(guide).toHaveLength(1);
    expect(guide[0].id).toBe('job-stats');
    expect(guide[0].kind).toBe(TAB_KIND);
    expect(guide[0].providerId).toBe(TAB_ID);
    expect(guide[0].order).toBe(40);
    expect(guide[0].title()).toBe('后台任务统计');
    expect(guide[0].description()).toBe('查看本会话后台任务的数量、状态与耗时');
    // The card renders the contributor's own glyph; nothing from a host package.
    expect(typeof guide[0].icon).toBe('function');
    // No command is claimed, so the card shows no keyboard hint.
    expect(guide[0].commandId).toBeUndefined();
  });

  test('registers the dock body and its strip title under the type id', () => {
    const { harness } = mount({ sessionKey: 'session-1' });
    const body = entryOf(harness.core, 'sidebar.right.pane.tab', (options) => options.key === TAB_ID);
    expect(typeof body.component).toBe('function');
    expect(typeof body.inject).toBe('function');
    const title = entryOf(harness.core, 'sidebar.right.pane.tab.title', (options) => options.key === TAB_ID);
    expect(typeof title.component).toBe('function');
  });

  test('the body face carries the roster hook for its own session', () => {
    const { harness } = mount({ sessionKey: 'session-1' });
    const body = entryOf(harness.core, 'sidebar.right.pane.tab', (options) => options.key === TAB_ID);
    const injected = body.inject('session-9');
    expect(typeof injected.hooks.jobs).toBe('function');
    expect(typeof injected.watchRows).toBe('function');
    expect(injected.watchRows('session-9')).toBeTypeOf('function');
  });

  test('claims nothing in the left rail or the main area', () => {
    // The feature lives in the right Sidebar only: no rail entry, no page.
    const { harness } = mount({ sessionKey: 'session-1' });
    expect(harness.core.entriesOfSlot('sidebar.panellist')).toHaveLength(0);
    expect(harness.core.entriesOfSlot('main')).toHaveLength(0);
  });

  test('waits for the frame seats and installs once they are declared', () => {
    const harness = createContext({ sessionKey: 'session-1' });
    const { face } = materialize();
    face.apply(harness.ctx);
    // Nothing is declared yet: a plugin loaded first must not throw.
    expect(harness.core.entriesOfSlot('sidebar.right.pane.tab')).toHaveLength(0);

    harness.declareFrame();
    expect(harness.core.entriesOfSlot('sidebar.right.pane.tab').map((entry) => entry.options.key)).toEqual([TAB_ID]);
    expect(harness.core.entriesOfSlot('sidebar.right.pane.tab.title').map((entry) => entry.options.key)).toEqual([TAB_ID]);
  });

  test('leaves the frame seats and returns, while the type rides the plugin', () => {
    const { harness } = mount({ sessionKey: 'session-1' });
    // Collapse the declaration the way unloading the shell plugin does: the pane
    // seats are its children, so the body and title registrations go with it. The
    // tab *type* belongs to the dock's registry (and to this plugin), not to a
    // slot declaration, so it stays until the plugin or the registry goes away.
    harness.collapseFrame();
    expect(harness.core.entriesOfSlot('sidebar.right.pane.tab')).toHaveLength(0);
    expect(harness.core.entriesOfSlot('sidebar.right.pane.tab.title')).toHaveLength(0);
    expect(harness.tabTypes).toHaveLength(1);

    harness.declareFrame();
    expect(harness.core.entriesOfSlot('sidebar.right.pane.tab')).toHaveLength(1);
    expect(harness.core.entriesOfSlot('sidebar.right.pane.tab.title')).toHaveLength(1);

    // Disposing the plugin takes the type with it.
    harness.dispose();
    expect(harness.tabTypes).toHaveLength(0);
  });

  test('disposal unregisters everything, and mounting again works', () => {
    const harness = createContext({ sessionKey: 'session-1' });
    const { face } = materialize();
    harness.declareFrame();
    face.apply(harness.ctx);
    expect(harness.core.entriesOfSlot('sidebar.right.pane.tab')).toHaveLength(1);

    harness.dispose();
    expect(harness.core.entriesOfSlot('sidebar.right.pane.tab')).toHaveLength(0);
    expect(harness.core.entriesOfSlot('sidebar.right.pane.tab.title')).toHaveLength(0);
    expect(harness.tabTypes).toHaveLength(0);
    // Disposing twice is safe (the plugin's effect owns each registration once).
    harness.dispose();

    // A reload disposes the previous registration and then mounts again; the
    // repeated locale registration must not throw on the second pass.
    harness.declareFrame();
    expect(() => face.apply(harness.ctx)).not.toThrow();
    expect(harness.core.entriesOfSlot('sidebar.right.pane.tab')).toHaveLength(1);
  });

  test('the whole plugin is skipped when the composition has no right Sidebar', () => {
    // A deployment without ui-sidebar-right provides no tab registry; the plugin
    // stays inactive rather than throwing.
    const harness = createContext({ sessionKey: 'session-1', omitServices: ['sidebarRightTabs'] });
    const { face } = materialize();
    harness.declareFrame();
    expect(() => face.apply(harness.ctx)).not.toThrow();
    expect(harness.tabTypes).toHaveLength(0);
    expect(harness.core.entriesOfSlot('sidebar.right.pane.tab')).toHaveLength(0);
  });

  test('registers both dictionaries and keeps them key-identical', () => {
    const { harness } = mount({ sessionKey: 'session-1' });
    expect(harness.dictionaryCalls).toEqual([{ namespace: 'jobStats', locales: ['zh', 'en'] }]);
    const dictionaries = harness.dictionaries.get('jobStats');
    expect(Object.keys(dictionaries.en).sort()).toEqual(Object.keys(dictionaries.zh).sort());
    expect(dictionaries.zh.metricCompleted).toBe('已完成');
    expect(dictionaries.zh.metricFailed).toBe('已失败');
    expect(dictionaries.zh.metricKilled).toBe('已取消');
    expect(dictionaries.zh.metricRunning).toBe('运行中');
  });
});

describe('dock panel', () => {
  const settled = [
    job({ id: 'a', label: '生成图片', status: 'completed', finishedAt: BASE + 12_000, output: { total: 2048 } }),
    job({ id: 'b', label: '检索资料', status: 'completed', finishedAt: BASE + 65_000, output: { total: 1024 } }),
    job({ id: 'c', label: '访问维基百科', status: 'failed', finishedAt: BASE + 3_000, detail: 'exit 1', output: { total: 0 } }),
    job({ id: 'd', label: '等待统计稳定', status: 'killed', finishedAt: BASE + 2_000, output: { total: 0 } }),
  ];

  test('summarises the session it was opened in', () => {
    const { view } = renderDock(settled);
    const { container } = view;
    expect(figure(container, 'metric', 'total')).toBe('4');
    expect(figure(container, 'metric', 'running')).toBe('0');
    expect(figure(container, 'metric', 'completed')).toBe('2');
    expect(figure(container, 'metric', 'failed')).toBe('1');
    expect(figure(container, 'metric', 'killed')).toBe('1');
    expect(figure(container, 'stat', 'successRate')).toBe('50%');
    // 12s + 65s + 3s + 2s, the slowest single job, and 2048+1024 bytes.
    expect(figure(container, 'stat', 'elapsed')).toBe('1分22秒');
    expect(figure(container, 'stat', 'longest')).toBe('1分5秒');
    expect(figure(container, 'stat', 'output')).toBe('3.0 KB');
    expect(container.textContent).toContain('任务明细');
    expect(container.textContent).toContain('累计 4 个');
  });

  test('lists every job newest-first with Chinese status words', () => {
    const { view } = renderDock(settled);
    const list = rows(view.container);
    expect(list).toHaveLength(4);
    expect(list.map((row) => row.querySelector('span[title]').textContent))
      .toEqual(['检索资料', '生成图片', '访问维基百科', '等待统计稳定']);
    expect(list[2].textContent).toContain('Bash · 已失败 · exit 1');
    expect(list[3].textContent).toContain('已取消');
    expect(list[0].textContent).toContain('1分5秒');
  });

  test('counts running and stopping jobs together and shows progress', () => {
    const startedAt = Date.now() - 5_000;
    const { view } = renderDock([
      job({ id: 'live', label: '下载数据集', status: 'running', startedAt, finishedAt: undefined, progress: '正在下载', output: { total: 0 } }),
      job({ id: 'stopping', label: '停止中的任务', status: 'stopping', startedAt, finishedAt: undefined, output: { total: 0 } }),
    ]);
    expect(figure(view.container, 'metric', 'running')).toBe('2');
    const list = rows(view.container);
    expect(list[0].textContent).toContain('运行中');
    expect(list[0].textContent).toContain('正在下载');
    expect(list[1].textContent).toContain('正在停止');
    // A live row reports the time it has been running so far.
    expect(list[0].textContent).toMatch(/[0-9]+秒/u);
  });

  test('watches only its own session, and releases the roster on unmount', () => {
    const { harness, view } = renderDock(settled);
    expect(harness.watch.opened).toEqual(['session-tab']);
    view.unmount();
    expect(harness.watch.disposals).toBe(1);

    // Another session's roster is neither watched nor shown.
    const { harness: other, view: otherView } = renderDock([], 'session-other');
    expect(other.watch.opened).toEqual(['session-other']);
    expect(otherView.container.textContent).toContain('本会话还没有后台任务');
  });

  test('explains an empty roster instead of drawing empty figures', () => {
    const { view } = renderDock([]);
    expect(view.container.querySelector('[data-role="dock-body"]')).toBeNull();
    expect(view.container.textContent).toContain('本会话还没有后台任务');
    expect(view.container.textContent).toContain('后台命令开始运行后会在这里出现');
  });

  test('explains a tab that was handed no session', () => {
    const { harness } = mount({ rows: {} });
    const { Component, props } = dockProps(harness, undefined);
    const view = render(React.createElement(Component, props));
    expect(view.container.textContent).toContain('未选择会话');
    expect(harness.watch.opened).toEqual([]);
  });

  test('survives forged rows and a missing roster hook', () => {
    const forged = [
      null,
      undefined,
      {},
      { id: 1, status: 'forged', startedAt: 'yesterday', output: { total: 'many' }, label: 42, kind: null },
      { id: 2, status: 'completed', startedAt: BASE, finishedAt: BASE, label: '正常的任务' },
    ];
    const { view } = renderDock(forged);
    // The ledger accumulates by job id, so rows it cannot identify are ignored
    // rather than rendered as anonymous duplicates on every frame.
    expect(figure(view.container, 'metric', 'total')).toBe('2');
    expect(figure(view.container, 'metric', 'completed')).toBe('1');
    expect(figure(view.container, 'metric', 'failed')).toBe('0');
    expect(figure(view.container, 'stat', 'output')).toBe('0 B');
    const list = rows(view.container);
    expect(list).toHaveLength(2);
    expect(list.some((row) => row.textContent.includes('状态未知'))).toBe(true);
    expect(list.some((row) => row.textContent.includes('（未命名任务）'))).toBe(true);
    expect(list.some((row) => row.textContent.includes('未知类型'))).toBe(true);
    // An unusable start time renders as an unknown duration, never a huge number.
    expect(list.filter((row) => row.textContent.includes('—')).length).toBeGreaterThan(0);

    // Without the roster hook nothing is ever remembered for a fresh session.
    const { harness } = mount({ rows: { 'session-nohook': [job({})] } });
    const { Component, props } = dockProps(harness, 'session-nohook');
    const without = render(React.createElement(Component, { ...props, useJobs: undefined }));
    expect(without.container.textContent).toContain('本会话还没有后台任务');
  });

  test('renders without the translator, and survives a roster that cannot be watched', () => {
    const { harness } = mount({ rows: { 'session-tab': [job({})] } });
    const { Component, props } = dockProps(harness, 'session-tab');
    // The Chinese dictionary is the fallback, so the panel still reads as Chinese.
    const bare = render(React.createElement(Component, { ...props, t: undefined }));
    expect(bare.container.textContent).toContain('合计');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const view = render(React.createElement(Component, {
        ...props,
        watchRows: () => {
          throw new Error('roster stream refused');
        },
      }));
      expect(figure(view.container, 'metric', 'total')).toBe('1');
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test('the detail list scrolls inside the panel instead of clipping its rows', () => {
    // The dock hands a tab body a flex column with a definite height and
    // `overflow: hidden`, so the panel's own scroll region has to be the row list:
    // without `min-height: 0` on the way down, the list absorbs the shrink, clips
    // its rows, and the wheel has nothing to move.
    const { view } = renderDock([
      job({ id: 'a', label: '第一条' }),
      job({ id: 'b', label: '第二条' }),
      job({ id: 'c', label: '第三条' }),
    ]);
    const body = view.container.querySelector('[data-role="dock-body"]');
    expect(body.style.display).toBe('flex');
    expect(body.style.flexDirection).toBe('column');
    expect(['0', '0px']).toContain(body.style.minHeight);
    expect(body.style.overflow).toBe('hidden');

    const list = view.container.querySelector('[data-role="job-list"]');
    expect(list.style.flex).toBe('1 1 auto');
    expect(['0', '0px']).toContain(list.style.minHeight);
    // The head keeps its place while the rows move under it (`none` serializes as
    // its longhands in some DOM implementations).
    expect(list.firstElementChild.style.flex).toMatch(/^(none|0 0 auto)$/u);
    const scroll = list.querySelector('ul');
    expect(scroll.style.overflowY).toBe('auto');
    expect(['0', '0px']).toContain(scroll.style.minHeight);
    expect(rows(view.container)).toHaveLength(3);
  });

  test('the strip title draws this plugin’s glyph before the label', () => {
    const { harness } = mount({ sessionKey: 'session-1' });
    const entry = entryOf(harness.core, 'sidebar.right.pane.tab.title', (options) => options.key === TAB_ID);
    const view = render(React.createElement(entry.component, {
      useTabInfo: () => ({ tab: { id: 't1', title: '后台任务' } }),
    }));
    const svg = view.container.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('14');
    expect(view.container.textContent).toBe('后台任务');
  });

  test('the guide card glyph renders at the size the dock asks for', () => {
    const { harness } = mount({});
    const [card] = harness.sidebarRightTabs.guide();
    const view = render(React.createElement(card.icon, { size: 26 }));
    const svg = view.container.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('26');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('accumulated ledger', () => {
  /** Mount the panel for one session and return the view plus its harness. */
  function mountLive(options) {
    const harness = createContext(options);
    const { face } = materialize();
    harness.declareFrame();
    face.apply(harness.ctx);
    const { Component, props } = dockProps(harness, options.sessionKey ?? 'session-tab');
    return { harness, Component, props, view: render(React.createElement(Component, props)) };
  }

  test('keeps a job the host removed from the roster', () => {
    // The host removes a foreground command's record once its call collected the
    // output, which is why a roster-only panel showed a task flash and vanish.
    const { harness, view } = mountLive({ rows: { 'session-tab': [job({ id: 'gone', label: '跑完就消失的命令' })] } });
    expect(figure(view.container, 'metric', 'total')).toBe('1');

    act(() => {
      harness.roster.set('session-tab', []);
    });
    expect(figure(view.container, 'metric', 'total')).toBe('1');
    expect(figure(view.container, 'metric', 'completed')).toBe('1');
    expect(view.container.textContent).toContain('跑完就消失的命令');
  });

  test('adds new jobs and updates them in place', () => {
    const startedAt = Date.now() - 3_000;
    const { harness, view } = mountLive({
      rows: { 'session-tab': [job({ id: 'one', label: '第一条', status: 'running', startedAt, finishedAt: undefined })] },
    });
    expect(figure(view.container, 'metric', 'total')).toBe('1');
    expect(figure(view.container, 'metric', 'running')).toBe('1');

    act(() => {
      harness.roster.set('session-tab', [
        job({ id: 'one', label: '第一条', status: 'completed', startedAt, finishedAt: startedAt + 3_000 }),
        job({ id: 'two', label: '第二条', status: 'failed', finishedAt: BASE + 5_000, detail: 'exit 2' }),
      ]);
    });
    expect(figure(view.container, 'metric', 'total')).toBe('2');
    expect(figure(view.container, 'metric', 'running')).toBe('0');
    expect(figure(view.container, 'metric', 'completed')).toBe('1');
    expect(figure(view.container, 'metric', 'failed')).toBe('1');
    // The same job id updated in place instead of being listed twice.
    expect(view.container.textContent.match(/第一条/gu)).toHaveLength(1);

    act(() => {
      harness.roster.set('session-tab', []);
    });
    expect(figure(view.container, 'metric', 'total')).toBe('2');
    expect(view.container.textContent).toContain('exit 2');
  });

  test('a live record that leaves the roster ends instead of running forever', () => {
    vi.useFakeTimers();
    try {
      const started = Date.now() - 60_000;
      const { harness, view } = mountLive({
        rows: { 'session-tab': [job({ id: 'live', label: '跑完就没影的命令', status: 'running', startedAt: started, finishedAt: undefined })] },
      });
      expect(figure(view.container, 'metric', 'running')).toBe('1');
      expect(view.container.textContent).toContain('1分');

      // The Host removes a foreground command's record as soon as its call collected
      // the output — often inside the coalescing window that would have reported the
      // settlement — so no frame ever carries the outcome.
      act(() => {
        harness.roster.set('session-tab', []);
      });
      expect(figure(view.container, 'metric', 'running')).toBe('0');
      expect(figure(view.container, 'metric', 'ended')).toBe('1');
      expect(figure(view.container, 'metric', 'completed')).toBe('0');
      expect(figure(view.container, 'metric', 'failed')).toBe('0');
      // The row says it ended — not that it is still running — and adds no guess
      // about an outcome nobody reported.
      const [row] = rows(view.container);
      expect(row.getAttribute('data-status')).toBe('ended');
      expect(row.textContent).toContain('已结束');
      expect(row.textContent).not.toContain('结果未上报');

      // Its clock stops at the last sighting instead of counting up forever.
      vi.setSystemTime(Date.now() + 300_000);
      expect(rows(view.container)[0].textContent).toContain('1分0秒');
    } finally {
      vi.useRealTimers();
    }
  });

  test('times a long command by its last sighting, not by the frame that started it', () => {
    vi.useFakeTimers();
    try {
      // A long command produces no roster frame between its start and its
      // settlement, so a clock fed only by frames would report 0 seconds.
      const started = Date.now();
      const { harness, view } = mountLive({
        rows: { 'session-tab': [job({ id: 'long', label: '长命令', status: 'running', startedAt: started, finishedAt: undefined })] },
      });
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(rows(view.container)[0].textContent).toContain('30秒');

      act(() => {
        harness.roster.set('session-tab', []);
      });
      expect(figure(view.container, 'metric', 'ended')).toBe('1');
      expect(rows(view.container)[0].textContent).toContain('30秒');
      expect(figure(view.container, 'stat', 'elapsed')).toBe('30秒');
    } finally {
      vi.useRealTimers();
    }
  });

  test('the status cards add up to the accumulated total', () => {
    const { view } = renderDock([
      job({ id: 'a', label: '已完成', status: 'completed' }),
      job({ id: 'b', label: '已失败', status: 'failed', detail: 'exit 1' }),
      job({ id: 'c', label: '已取消', status: 'killed' }),
      job({ id: 'd', label: '运行中', status: 'running', startedAt: Date.now() - 1_000, finishedAt: undefined }),
    ]);
    const sum = ['running', 'completed', 'failed', 'killed', 'ended']
      .map((name) => Number(figure(view.container, 'metric', name)))
      .reduce((left, right) => left + right, 0);
    expect(String(sum)).toBe(figure(view.container, 'metric', 'total'));
  });

  test('keeps each session’s history separate', () => {
    const { harness, view } = mountLive({ rows: { 'session-tab': [job({ id: 'mine', label: '我的任务' })] } });
    expect(figure(view.container, 'metric', 'total')).toBe('1');

    const other = dockProps(harness, 'session-other');
    const otherView = render(React.createElement(other.Component, other.props));
    expect(otherView.container.textContent).toContain('本会话还没有后台任务');
    expect(otherView.container.textContent).not.toContain('我的任务');
  });

  test('survives a reload: the ledger is hydrated from browser storage', () => {
    const first = mountLive({ rows: { 'session-tab': [job({ id: 'kept', label: '记住我', status: 'failed', detail: 'exit 9' })] } });
    expect(figure(first.view.container, 'metric', 'total')).toBe('1');
    first.view.unmount();

    // A fresh plugin instance has an empty in-memory ledger; the browser store is
    // what carries the history across the reload.
    const second = mountLive({ rows: {} });
    expect(figure(second.view.container, 'metric', 'total')).toBe('1');
    expect(second.view.container.textContent).toContain('记住我');
    expect(second.view.container.textContent).toContain('exit 9');
  });

  test('an unreadable ledger starts empty instead of failing the tab', () => {
    window.localStorage.setItem('dsh-job-stats/v2/session-tab', '{ not json');
    const { view } = mountLive({ rows: { 'session-tab': [job({ id: 'fresh', label: '照常显示' })] } });
    expect(figure(view.container, 'metric', 'total')).toBe('1');
    expect(view.container.textContent).toContain('照常显示');
  });

  test('drops a hydrated record that claims to still be running', () => {
    // A record hydrated as running has no stream behind it any more; the roster
    // re-supplies it while the job is alive, and the panel must not invent a row
    // that counts up forever.
    window.localStorage.setItem('dsh-job-stats/v2/session-stale', JSON.stringify([
      { id: 'stale', kind: 'pwsh', label: '上次遗留的运行中', status: 'running', startedAt: BASE, bytes: 0, seenAt: BASE },
      { id: 'kept', kind: 'pwsh', label: '上次的已完成', status: 'completed', startedAt: BASE, finishedAt: BASE + 1_000, bytes: 0, seenAt: BASE },
    ]));
    const { view } = mountLive({ rows: {}, sessionKey: 'session-stale' });
    expect(figure(view.container, 'metric', 'total')).toBe('1');
    expect(figure(view.container, 'metric', 'running')).toBe('0');
    expect(figure(view.container, 'metric', 'completed')).toBe('1');
    expect(view.container.textContent).toContain('上次的已完成');
    expect(view.container.textContent).not.toContain('上次遗留的运行中');
  });
});

describe('host-recorded outcomes', () => {
  /** One outcome record as the recorder row serves it. */
  function outcome(overrides = {}) {
    return {
      id: 'collected',
      sessionId: 'session-tab',
      kind: 'pwsh',
      label: 'pnpm install',
      status: 'completed',
      detail: 'exit code: 0',
      startedAt: BASE,
      finishedAt: BASE + 12_000,
      bytes: 2_048,
      ...overrides,
    };
  }

  /** A fetch stub answering each call with the next queued outcome list. */
  function stubRoute(answers) {
    const calls = [];
    const queue = [...answers];
    vi.stubGlobal('fetch', (url) => {
      calls.push(String(url));
      const outcomes = queue.length > 1 ? queue.shift() : queue[0];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ schema: 'dsh-job-stats/outcomes/v1', outcomes }) });
    });
    return calls;
  }

  /** Mount the panel and let its first outcomes sync settle. */
  async function mountWithRoute(options, answers) {
    const calls = stubRoute(answers);
    const harness = createContext(options);
    const { face } = materialize();
    harness.declareFrame();
    face.apply(harness.ctx);
    const { Component, props } = dockProps(harness, options.sessionKey ?? 'session-tab');
    let view;
    await act(async () => {
      view = render(React.createElement(Component, props));
    });
    return { harness, Component, props, view, calls };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('turns a row the roster abandoned into its real outcome', async () => {
    vi.useFakeTimers();
    try {
      const started = BASE;
      const { harness, view } = await mountWithRoute({
        rows: { 'session-tab': [job({ id: 'collected', label: 'pnpm install', status: 'running', startedAt: started, finishedAt: undefined })] },
      }, [[]]);
      expect(figure(view.container, 'metric', 'running')).toBe('1');

      // The Host retires the record before any frame can carry its settlement…
      act(() => {
        harness.roster.set('session-tab', []);
      });
      expect(figure(view.container, 'metric', 'ended')).toBe('1');
      // Nothing invented about the outcome it does not have yet.
      expect(view.container.textContent).not.toContain('结果未上报');
      expect(rows(view.container)[0].textContent).toContain('已结束');

      // …and the next sync replaces the guess with what actually happened.
      stubRoute([[outcome()]]);
      await act(async () => {
        vi.advanceTimersByTime(2_100);
      });
      expect(figure(view.container, 'metric', 'ended')).toBe('0');
      expect(figure(view.container, 'metric', 'completed')).toBe('1');
      expect(figure(view.container, 'metric', 'failed')).toBe('0');
      const [row] = rows(view.container);
      expect(row.getAttribute('data-status')).toBe('completed');
      expect(row.textContent).toContain('已完成');
      expect(row.textContent).toContain('exit code: 0');
      expect(row.textContent).not.toContain('结果未上报');
      expect(row.textContent).toContain('12秒');
    } finally {
      vi.useRealTimers();
    }
  });

  test('adds a job this tab never saw, with its outcome', async () => {
    const { view } = await mountWithRoute({ rows: {} }, [[outcome({ id: 'before', label: '别处跑完的命令', status: 'failed', detail: 'exit 1' })]]);
    expect(figure(view.container, 'metric', 'total')).toBe('1');
    expect(figure(view.container, 'metric', 'failed')).toBe('1');
    expect(view.container.textContent).toContain('别处跑完的命令');
  });

  test('a stale roster frame cannot downgrade a reported outcome', async () => {
    const started = BASE;
    const { harness, view } = await mountWithRoute({ rows: {} }, [[outcome({ startedAt: started, finishedAt: started + 4_000 })]]);
    expect(figure(view.container, 'metric', 'completed')).toBe('1');

    // A frame produced before the settlement, delivered after it (two channels).
    act(() => {
      harness.roster.set('session-tab', [job({ id: 'collected', label: 'pnpm install', status: 'running', startedAt: started, finishedAt: undefined })]);
    });
    expect(figure(view.container, 'metric', 'running')).toBe('0');
    expect(figure(view.container, 'metric', 'completed')).toBe('1');
    expect(rows(view.container)[0].textContent).toContain('已完成');
  });

  test('asks the route document-relatively, so a mounted prefix still resolves', async () => {
    const base = document.createElement('base');
    base.href = 'http://localhost:3000/app/my-dsh/';
    document.head.append(base);
    try {
      const { calls } = await mountWithRoute({ rows: {} }, [[]]);
      expect(calls[0]).toBe('/app/my-dsh/dsh-job-stats/outcomes?sessionId=session-tab');
    } finally {
      base.remove();
    }
  });

  test('a missing recorder leaves the panel on the roster’s own story', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('no recorder row')));
    const harness = createContext({ rows: { 'session-tab': [job({ id: 'solo', label: '照常显示' })] } });
    const { face } = materialize();
    harness.declareFrame();
    face.apply(harness.ctx);
    const { Component, props } = dockProps(harness, 'session-tab');
    let view;
    await act(async () => {
      view = render(React.createElement(Component, props));
    });
    expect(figure(view.container, 'metric', 'total')).toBe('1');
    expect(view.container.textContent).toContain('照常显示');
  });
});
