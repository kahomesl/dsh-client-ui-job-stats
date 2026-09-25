/**
 * The roster from the request's screenshot, rendered by the real dock panel.
 *
 * The screenshot shows the shipped English list — "Background tasks", "Finished 4",
 * "Bash / Failed", "Completed". This spec feeds that same roster (four settled Bash
 * jobs, two failed, two completed) through the plugin's own panel and pins the
 * Chinese surface copy, so a regression that reintroduces English status words
 * fails here. Command labels are data: they stay exactly as the session produced
 * them.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { createContext, entryOf, format, materialize } from './support/harness.js';

/** The tab type this plugin owns. */
const TAB_ID = 'dsh-client-ui-job-stats';
/** Wall clock base; durations are what the screenshot's rows would have taken. */
const BASE = 1_700_000_000_000;

/** One settled row, shaped like the session header's own roster rows. */
function bashJob(id, label, status, seconds, bytes, detail) {
  return {
    id,
    kind: 'Bash',
    label,
    status,
    startedAt: BASE,
    finishedAt: BASE + seconds * 1000,
    ...(detail === undefined ? {} : { detail }),
    output: { total: bytes },
  };
}

/** The four rows the screenshot lists. */
const SCREENSHOT_ROSTER = [
  bashJob('job-wikipedia-net', 'Diagnose network access to Wikipedia', 'failed', 42, 4096, 'exit 1'),
  bashJob('job-wikipedia-image', 'Test Wikipedia image API access', 'failed', 8, 2048, 'exit 7'),
  bashJob('job-stats-settle', 'Wait for stats to settle', 'completed', 30, 1024),
  bashJob('job-figure-source', 'Search for the 189818 figure source', 'completed', 12, 512),
];

/** Render the dock panel for one roster. */
function renderRoster(rows) {
  const harness = createContext({ rows: { 'session-tab': rows } });
  const { face } = materialize();
  harness.declareFrame();
  face.apply(harness.ctx);
  const entry = entryOf(harness.core, 'sidebar.right.pane.tab', (options) => options.key === TAB_ID);
  const zh = harness.dictionaries.get('jobStats')?.zh ?? {};
  const injected = entry.inject('session-tab');
  const props = { sessionId: 'session-tab', t: (key, values) => format(zh[key] ?? key, values), ...injected };
  delete props.hooks;
  for (const [name, hook] of Object.entries(injected.hooks ?? {})) {
    props[`use${name[0].toUpperCase()}${name.slice(1)}`] = hook;
  }
  return render(React.createElement(entry.component, props));
}

/** Read one rendered figure out of the DOM. */
const figure = (container, kind, name) => {
  const node = container.querySelector(`[data-role="${kind}"][data-${kind}="${name}"]`);
  if (node === null) throw new Error(`${kind} ${name} is missing`);
  return node.querySelector('span+span').textContent;
};

/** A readable dump of everything the panel renders, for the test log. */
function panelText(container) {
  const lines = [];
  const cards = [...container.querySelectorAll('[data-role="metric"]')].map((node) => {
    const [label, value] = [...node.querySelectorAll('span')].map((span) => span.textContent);
    return `${label}=${value}`;
  });
  lines.push(`[卡片] ${cards.join('  ')}`);
  const stats = [...container.querySelectorAll('[data-role="stat"]')].map((node) => {
    const [label, value] = [...node.querySelectorAll('span')].map((span) => span.textContent);
    return `${label}=${value}`;
  });
  lines.push(`[指标] ${stats.join('  ')}`);
  for (const node of container.querySelectorAll('[data-role="job-list"] > div, [data-role="job-row"]')) {
    lines.push(`[明细] ${[...node.querySelectorAll('span')].map((span) => span.textContent).join(' | ')}`);
  }
  return lines.join('\n');
}

describe('the screenshot roster, in Chinese', () => {
  test('reports its counts, durations and retained output', () => {
    const view = renderRoster(SCREENSHOT_ROSTER);
    const { container } = view;
    expect(figure(container, 'metric', 'total')).toBe('4');
    expect(figure(container, 'metric', 'running')).toBe('0');
    expect(figure(container, 'metric', 'completed')).toBe('2');
    expect(figure(container, 'metric', 'failed')).toBe('2');
    expect(figure(container, 'metric', 'killed')).toBe('0');
    expect(figure(container, 'stat', 'successRate')).toBe('50%');
    // 42s + 8s + 30s + 12s, longest single job 42s, 4096+2048+1024+512 bytes.
    expect(figure(container, 'stat', 'elapsed')).toBe('1分32秒');
    expect(figure(container, 'stat', 'longest')).toBe('42秒');
    expect(figure(container, 'stat', 'output')).toBe('7.5 KB');

    // The full rendered text, for the record.
    console.log(`\n--- 右栏面板渲染文本（截图那批任务）---\n${panelText(container)}\n`);
  });

  test('says every state in Chinese and never in the screenshot’s English', () => {
    const view = renderRoster(SCREENSHOT_ROSTER);
    const text = view.container.textContent;
    for (const chinese of ['合计', '运行中', '已完成', '已失败', '已取消', '任务明细', '累计 4 个']) {
      expect(text).toContain(chinese);
    }
    // Rows carry the Chinese status beside the command, so the screenshot's
    // "Bash Failed" reads "Bash · 已失败" here.
    expect(text).toContain('Bash · 已失败 · exit 1');
    expect(text).toContain('Bash · 已完成');
    for (const english of ['Background tasks', 'Finished', 'Failed', 'Completed', 'Running', 'Cancelled']) {
      expect(text).not.toContain(english);
    }
    // Command labels are session data and must survive verbatim.
    expect(text).toContain('Diagnose network access to Wikipedia');
    expect(text).toContain('Search for the 189818 figure source');
  });

  test('keeps the screenshot’s settling order: newest settled first', () => {
    const view = renderRoster(SCREENSHOT_ROSTER);
    const labels = [...view.container.querySelectorAll('[data-role="job-row"]')]
      .map((row) => row.querySelector('span[title]').textContent);
    // finishedAt: 42s, 30s, 12s, 8s after the same start.
    expect(labels).toEqual([
      'Diagnose network access to Wikipedia',
      'Wait for stats to settle',
      'Search for the 189818 figure source',
      'Test Wikipedia image API access',
    ]);
  });
});
