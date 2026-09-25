/**
 * Browser half of the background-job statistics plugin.
 *
 * It contributes one feature to one seat: a **right Sidebar tab type** (`job-stats`).
 * The dock's start page renders this plugin's guide card, and picking it opens the
 * statistics panel in the column that the session header's 「打开侧边栏」 button
 * (Ctrl+Alt+B) expands — the column the shipped 工作区文件 / 新建终端 / 浏览器 types
 * live in.
 *
 * Every number comes from `ctx.jobs`, the client mirror of the session job roster
 * the shipped header list already renders — there is no second roster to join. The
 * dock tab is session-scoped, so the session it was opened in arrives in the slot
 * props and the panel needs no session selection of its own.
 *
 * Nothing here imports a Harness Client package: React arrives from the browser
 * module table and the panel draws its own markup with host theme tokens, so a
 * rebuilt Host cannot blank this entry. The factory itself has no side effects;
 * registration and teardown are owned by `ctx.effect`. The whole contribution is
 * optional-service scoped, so a composition without the right Sidebar leaves this
 * plugin inactive instead of failing to activate.
 */
window.__ModuleLoader__.load({
  id: 'dsh-client-ui-job-stats',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Right-Sidebar tab kind this plugin owns, and the key its seats register under. */
    const TAB_ID = 'dsh-client-ui-job-stats';
    /** Locale namespace this plugin owns. */
    const NS = 'jobStats';
    /** Stable empty roster, so a session with no jobs keeps one array identity. */
    const NO_JOBS = [];

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      metricsAria: '后台任务统计概览',
      listAria: '后台任务明细',
      metricTotal: '合计',
      metricRunning: '运行中',
      metricCompleted: '已完成',
      metricFailed: '已失败',
      metricKilled: '已取消',
      metricEnded: '已结束',
      statSuccessRate: '完成率',
      statSuccessRateHint: '仅统计已上报结果的任务（不含结果未上报的已结束任务）',
      statElapsed: '累计耗时',
      statLongest: '最长耗时',
      statOutput: '保留输出',
      listTitle: '任务明细',
      listCount: '累计 {count} 个',
      sessionNone: '未选择会话',
      sessionNoneHint: '打开或新建一个会话后，这里会统计它的后台任务。',
      dockEmpty: '本会话还没有后台任务',
      dockEmptyHint: '后台命令开始运行后会在这里出现。',
      guideTitle: '后台任务统计',
      guideDescription: '查看本会话后台任务的数量、状态与耗时',
      typeLabel: '后台任务',
      statusRunning: '运行中',
      statusStopping: '正在停止',
      statusCompleted: '已完成',
      statusFailed: '已失败',
      statusKilled: '已取消',
      statusEnded: '已结束',
      statusUnknown: '状态未知',
      detailUnreported: '结果未上报',
      rowUntitled: '（未命名任务）',
      rowUnknownKind: '未知类型',
      durationUnknown: '—',
      durationSeconds: '{seconds}秒',
      durationMinutes: '{minutes}分{seconds}秒',
      durationHours: '{hours}小时{minutes}分',
      bytesB: '{value} B',
      bytesKb: '{value} KB',
      bytesMb: '{value} MB',
      percent: '{value}%',
    };

    /** English dictionary, key-identical to the Chinese source of truth. */
    const en = {
      metricsAria: 'Background job statistics overview',
      listAria: 'Background job details',
      metricTotal: 'Total',
      metricRunning: 'Running',
      metricCompleted: 'Completed',
      metricFailed: 'Failed',
      metricKilled: 'Cancelled',
      metricEnded: 'Ended',
      statSuccessRate: 'Success rate',
      statSuccessRateHint: 'reported outcomes only (ended jobs whose outcome was not reported are excluded)',
      statElapsed: 'Total time',
      statLongest: 'Longest',
      statOutput: 'Retained output',
      listTitle: 'Job details',
      listCount: '{count} accumulated',
      sessionNone: 'No session selected',
      sessionNoneHint: 'Open or start a session and its background jobs are summarised here.',
      dockEmpty: 'This session has no background jobs',
      dockEmptyHint: 'They appear here once a background command starts.',
      guideTitle: 'Background job stats',
      guideDescription: "Counts, status, and duration of this session's background jobs",
      typeLabel: 'Background jobs',
      statusRunning: 'running',
      statusStopping: 'stopping',
      statusCompleted: 'completed',
      statusFailed: 'failed',
      statusKilled: 'cancelled',
      statusEnded: 'ended',
      statusUnknown: 'unknown status',
      detailUnreported: 'outcome not reported',
      rowUntitled: '(untitled job)',
      rowUnknownKind: 'unknown kind',
      durationUnknown: '—',
      durationSeconds: '{seconds}s',
      durationMinutes: '{minutes}m {seconds}s',
      durationHours: '{hours}h {minutes}m',
      bytesB: '{value} B',
      bytesKb: '{value} KB',
      bytesMb: '{value} MB',
      percent: '{value}%',
    };

    /** Status marker colors: host theme tokens with literal fallbacks. */
    const statusColor = {
      running: 'var(--dsw-alias-state-business-primary, #3b82f6)',
      stopping: 'var(--dsw-alias-state-warning-primary, #f59e0b)',
      completed: 'var(--dsw-alias-state-success-primary, #16a34a)',
      failed: 'var(--dsw-alias-state-error-primary, #dc2626)',
      killed: 'var(--dsw-alias-state-warn-label, #f59e0b)',
      // A record the Host removed before reporting an outcome: it is over, but
      // saying whether it succeeded would be a guess.
      ended: 'var(--dsw-alias-label-tertiary, currentColor)',
      unknown: 'var(--dsw-alias-label-tertiary, currentColor)',
    };

    /** Substituted `{name}` placeholders; an absent value keeps the placeholder text. */
    function format(template, values) {
      return String(template).replace(/\{(\w+)\}/gu, (match, key) => (
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
      ));
    }

    /**
     * The closed status union read defensively: an unknown wire status counts as unknown.
     * `ended` is this plugin's own terminal state for a job the Host removed while
     * it was still running here, so it never counts as live again.
     */
    function statusOf(job) {
      const status = job === null || typeof job !== 'object' ? undefined : job.status;
      switch (status) {
        case 'running':
        case 'stopping':
        case 'completed':
        case 'failed':
        case 'killed':
        case 'ended':
          return status;
        default:
          return 'unknown';
      }
    }

    /** Whether the job still owns its execution resources. */
    function isLive(job) {
      const status = statusOf(job);
      return status === 'running' || status === 'stopping';
    }

    /** Locale key for one status. */
    function statusLabelKey(status) {
      switch (status) {
        case 'running': return 'statusRunning';
        case 'stopping': return 'statusStopping';
        case 'completed': return 'statusCompleted';
        case 'failed': return 'statusFailed';
        case 'killed': return 'statusKilled';
        case 'ended': return 'statusEnded';
        default: return 'statusUnknown';
      }
    }

    /** Elapsed milliseconds: settled duration, or time so far for a live job; undefined without a start. */
    function durationMs(job, now) {
      const startedAt = job === null || typeof job !== 'object' ? undefined : job.startedAt;
      if (typeof startedAt !== 'number' || !Number.isFinite(startedAt) || startedAt <= 0) return undefined;
      const finishedAt = job.finishedAt;
      const ended = typeof finishedAt === 'number' && Number.isFinite(finishedAt) && finishedAt >= startedAt
        ? finishedAt
        : now;
      return Math.max(0, ended - startedAt);
    }

    /** Elapsed time in at most two adjacent units. */
    function formatDuration(elapsedMs, t) {
      const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
      const seconds = totalSeconds % 60;
      const minutes = Math.floor(totalSeconds / 60) % 60;
      const hours = Math.floor(totalSeconds / 3600);
      if (hours > 0) return t('durationHours', { hours, minutes });
      if (minutes > 0) return t('durationMinutes', { minutes, seconds });
      return t('durationSeconds', { seconds });
    }

    /** Human-readable retained byte count. */
    function formatBytes(bytes, t) {
      if (bytes < 1024) return t('bytesB', { value: bytes });
      if (bytes < 1024 * 1024) return t('bytesKb', { value: (bytes / 1024).toFixed(1) });
      return t('bytesMb', { value: (bytes / (1024 * 1024)).toFixed(1) });
    }

    /** One line of per-job context: live progress while running, the terminal reason once settled. */
    function jobDetail(job) {
      if (job === null || typeof job !== 'object') return undefined;
      if (typeof job.progress === 'string' && job.progress !== '') return job.progress;
      if (typeof job.detail === 'string' && job.detail !== '') return job.detail;
      return undefined;
    }

    /** How many jobs one session's accumulated ledger keeps. */
    const LEDGER_LIMIT = 300;
    /**
     * Browser-storage key prefix for the accumulated ledger.
     *
     * v2: only terminal records are hydrated (a record hydrated as "running" has no
     * stream behind it any more, and the roster re-supplies it when the job is still
     * alive), and the Host's own removal semantics are projected as `ended`.
     */
    const LEDGER_KEY = 'dsh-job-stats/v2/';
    /** Per-session accumulated ledgers, one plugin module instance wide. */
    const ledgers = new Map();

    /**
     * One session's accumulated ledger.
     *
     * The host's roster is a *live* set: a foreground command's record is removed
     * as soon as the call that started it collects the output, so a panel reading
     * only the roster would show a task flash and vanish. The ledger remembers
     * every job this tab has seen, hydrated from browser storage so a reloaded page
     * keeps accumulating.
     * @param sessionId - the session the tab belongs to.
     * @returns the ledger entry, created (and hydrated) on first use.
     */
    function ledgerFor(sessionId) {
      const existing = ledgers.get(sessionId);
      if (existing !== undefined) return existing;
      const entry = { records: new Map(), writtenAt: 0 };
      ledgers.set(sessionId, entry);
      try {
        const raw = window.localStorage?.getItem(LEDGER_KEY + sessionId);
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : undefined;
        if (Array.isArray(parsed)) {
          for (const record of parsed) {
            if (record === null || typeof record !== 'object') continue;
            if (typeof record.id !== 'string' || record.id === '') continue;
            // Only terminal records survive a reload: one hydrated as running has no
            // stream behind it any more, and the roster re-supplies it while alive.
            if (isLive(record) || statusOf(record) === 'unknown') continue;
            entry.records.set(record.id, record);
          }
        }
      } catch {
        /* an unreadable or unavailable store starts empty rather than failing the tab */
      }
      return entry;
    }

    /** Compact, JSON-safe projection of one roster row. */
    function ledgerRecord(job, seenAt) {
      const bytes = job === null || typeof job !== 'object' ? undefined : job.output?.total;
      const detail = jobDetail(job);
      const finishedAt = job === null || typeof job !== 'object' ? undefined : job.finishedAt;
      const startedAt = job === null || typeof job !== 'object' ? undefined : job.startedAt;
      return {
        id: String(job?.id ?? ''),
        kind: typeof job?.kind === 'string' ? job.kind : '',
        label: typeof job?.label === 'string' ? job.label : '',
        status: statusOf(job),
        startedAt: typeof startedAt === 'number' && Number.isFinite(startedAt) ? startedAt : 0,
        ...(typeof finishedAt === 'number' && Number.isFinite(finishedAt) ? { finishedAt } : {}),
        ...(detail === undefined ? {} : { detail }),
        bytes: typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0 ? bytes : 0,
        seenAt,
      };
    }

    /** Whether two ledger records carry the same observable job state. */
    function sameRecord(left, right) {
      return left.status === right.status
        && left.detail === right.detail
        && left.bytes === right.bytes
        && left.finishedAt === right.finishedAt
        && left.label === right.label
        && left.kind === right.kind
        && left.startedAt === right.startedAt;
    }

    /** Keep the ledger bounded by dropping the oldest settled records first. */
    function pruneLedger(entry) {
      if (entry.records.size <= LEDGER_LIMIT) return;
      const removable = [...entry.records.values()]
        .filter((record) => !isLive(record))
        .sort((left, right) => (left.finishedAt ?? left.seenAt) - (right.finishedAt ?? right.seenAt));
      for (const record of removable) {
        if (entry.records.size <= LEDGER_LIMIT) break;
        entry.records.delete(record.id);
      }
    }

    /** Write one ledger back to browser storage, at most once a second unless `force`. */
    function persistLedger(sessionId, entry, force) {
      const stamp = Date.now();
      if (!force && stamp - entry.writtenAt < 1000) return;
      entry.writtenAt = stamp;
      try {
        window.localStorage?.setItem(LEDGER_KEY + sessionId, JSON.stringify([...entry.records.values()]));
      } catch {
        /* a full or unavailable store keeps the in-memory ledger only */
      }
    }

    /**
     * Merge one roster frame into the ledger.
     * @param sessionId - the watched session.
     * @param rows - the frame's whole visible set.
     * @returns whether the ledger gained or updated a record.
     */
    function remember(sessionId, rows) {
      if (sessionId === undefined || rows.length === 0) return false;
      const entry = ledgerFor(sessionId);
      const seenAt = Date.now();
      let changed = false;
      let settledNow = false;
      for (const job of rows) {
        const record = ledgerRecord(job, seenAt);
        if (record.id === '') continue;
        const previous = entry.records.get(record.id);
        if (previous !== undefined && sameRecord(previous, record)) {
          // A still-live row keeps its clock moving without dirtying the ledger.
          if (isLive(record)) previous.seenAt = seenAt;
          continue;
        }
        if (previous !== undefined && isLive(previous) && !isLive(record)) settledNow = true;
        entry.records.set(record.id, record);
        changed = true;
      }
      if (changed) {
        pruneLedger(entry);
        persistLedger(sessionId, entry, settledNow);
      }
      return changed;
    }

    /**
     * Keep a live record's clock moving while the roster still lists it.
     *
     * The roster only refreshes on lifecycle commits, so a long command produces no
     * frame between its start and its settlement; without this touch its duration
     * would freeze at the start when it disappears.
     * @param sessionId - the watched session.
     * @param liveIds - ids the current roster lists.
     */
    function touch(sessionId, liveIds) {
      if (sessionId === undefined || liveIds.size === 0) return;
      const entry = ledgers.get(sessionId);
      if (entry === undefined) return;
      const seenAt = Date.now();
      for (const id of liveIds) {
        const record = entry.records.get(id);
        if (record !== undefined && isLive(record)) record.seenAt = seenAt;
      }
    }

    /**
     * The accumulated rows to render.
     *
     * The Host removes a foreground command's record the moment the call that
     * started it collected the output — often inside the same coalescing window
     * that would have reported its settlement, so no frame ever carries the
     * outcome. A record this tab saw running and that the roster no longer lists is
     * therefore projected as `ended`: it is over, its clock stops at the last
     * sighting, and the panel says the outcome was not reported instead of claiming
     * it is still running.
     * @param sessionId - the session the tab belongs to.
     * @param liveIds - ids the current roster still lists.
     * @returns the records, unordered.
     */
    function ledgerRows(sessionId, liveIds) {
      if (sessionId === undefined) return NO_JOBS;
      // Read-through: the first read of a session hydrates its ledger from browser
      // storage, so a reloaded page shows the history before the first frame.
      const entry = ledgerFor(sessionId);
      if (entry.records.size === 0) return NO_JOBS;
      const rows = [];
      for (const record of entry.records.values()) {
        rows.push(isLive(record) && !liveIds.has(record.id)
          ? { ...record, status: 'ended', finishedAt: record.seenAt, unreported: true }
          : record);
      }
      return rows;
    }

    /**
     * Fold the roster into the numbers the panel shows. Missing or forged fields
     * never throw: an unreadable duration or byte count is simply not counted.
     * @param rows - this session's job roster.
     * @param now - wall clock used for the elapsed time of live jobs.
     * @returns counts per status, settled total, success rate, and duration/byte totals.
     */
    function summarize(rows, now) {
      const counts = { total: 0, running: 0, stopping: 0, completed: 0, failed: 0, killed: 0, ended: 0, unknown: 0 };
      let retainedBytes = 0;
      let elapsed = 0;
      let longest = 0;
      for (const job of rows) {
        counts.total += 1;
        counts[statusOf(job)] += 1;
        // Roster rows carry the retained byte count under `output`; ledger records
        // keep the same number as `bytes`.
        const bytes = job === null || typeof job !== 'object' ? undefined : (job.output?.total ?? job.bytes);
        if (typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0) retainedBytes += bytes;
        const elapsedMs = durationMs(job, now);
        if (elapsedMs !== undefined) {
          elapsed += elapsedMs;
          if (elapsedMs > longest) longest = elapsedMs;
        }
      }
      const settled = counts.completed + counts.failed + counts.killed;
      return {
        ...counts,
        settled,
        successRate: settled === 0 ? undefined : counts.completed / settled,
        retainedBytes,
        elapsed,
        longest,
      };
    }

    /**
     * Live rows first in start order, then settled rows newest-first — the same
     * reading order as the session header list, so both views agree.
     * @param rows - this session's job roster.
     * @returns a new, ordered array.
     */
    function orderRows(rows) {
      return [...rows].sort((left, right) => {
        const liveLeft = isLive(left);
        if (liveLeft !== isLive(right)) return liveLeft ? -1 : 1;
        const leftStart = typeof left?.startedAt === 'number' ? left.startedAt : 0;
        const rightStart = typeof right?.startedAt === 'number' ? right.startedAt : 0;
        if (liveLeft) return leftStart - rightStart;
        const leftEnd = typeof left?.finishedAt === 'number' ? left.finishedAt : leftStart;
        const rightEnd = typeof right?.finishedAt === 'number' ? right.finishedAt : rightStart;
        const byEnd = rightEnd - leftEnd;
        return byEnd !== 0 ? byEnd : leftStart - rightStart;
      });
    }

    /** A hook that reads nothing, used only when the roster hook is unavailable. */
    function useNothing() {
      return undefined;
    }

    /**
     * Read this session's roster slice.
     *
     * The roster store publishes whole snapshots; selecting the one session here
     * keeps the panel subscribed to exactly what it renders.
     * @param useJobs - the injected roster store hook.
     * @param sessionId - the session the tab belongs to, or undefined.
     * @returns the roster rows, or a stable empty array.
     */
    function useSessionRows(useJobs, sessionId) {
      const select = React.useCallback((state) => {
        if (sessionId === undefined || state === null || typeof state !== 'object') return undefined;
        const rows = state.rows;
        if (rows === null || typeof rows !== 'object') return undefined;
        const candidate = rows[sessionId];
        return Array.isArray(candidate) ? candidate : undefined;
      }, [sessionId]);
      const read = typeof useJobs === 'function' ? useJobs : useNothing;
      const rows = read(select);
      return Array.isArray(rows) ? rows : NO_JOBS;
    }

    /** Decorative status marker for one job row. */
    function StatusDot({ status }) {
      return h('span', {
        'aria-hidden': 'true',
        style: {
          flex: 'none',
          width: '8px',
          height: '8px',
          marginTop: '6px',
          borderRadius: '999px',
          background: statusColor[status] ?? statusColor.unknown,
        },
      });
    }

    /** One task line: status, command label, kind/status/reason, elapsed time. */
    function JobRow({ job, now, t }) {
      const status = statusOf(job);
      const rawLabel = job === null || typeof job !== 'object' ? undefined : job.label;
      const label = typeof rawLabel === 'string' && rawLabel !== '' ? rawLabel : t('rowUntitled');
      const rawKind = job === null || typeof job !== 'object' ? undefined : job.kind;
      const kind = typeof rawKind === 'string' && rawKind !== '' ? rawKind : t('rowUnknownKind');
      const statusText = t(statusLabelKey(status));
      const reported = jobDetail(job);
      const detail = reported === undefined && job?.unreported === true ? t('detailUnreported') : reported;
      const meta = detail === undefined ? `${kind} · ${statusText}` : `${kind} · ${statusText} · ${detail}`;
      const elapsed = durationMs(job, now);
      return h('li', {
        'data-role': 'job-row',
        'data-status': status,
        style: dockStyles.row,
      }, [
        h(StatusDot, { key: 'dot', status }),
        h('div', { key: 'main', style: dockStyles.rowMain }, [
          h('span', { key: 'label', style: dockStyles.rowLabel, title: label }, label),
          h('span', { key: 'meta', style: dockStyles.rowMeta, title: meta }, meta),
        ]),
        h('span', {
          key: 'time',
          style: dockStyles.rowTime,
        }, elapsed === undefined ? t('durationUnknown') : formatDuration(elapsed, t)),
      ]);
    }

    /** Compact headline number for the dock's narrow column. */
    function DockMetric({ metric, label, value, tone }) {
      return h('div', {
        'data-role': 'metric',
        'data-metric': metric,
        style: dockStyles.card,
      }, [
        h('span', { key: 'label', style: dockStyles.cardLabel }, label),
        h('span', {
          key: 'value',
          style: tone === undefined
            ? dockStyles.cardValue
            : { ...dockStyles.cardValue, color: statusColor[tone] ?? dockStyles.cardValue.color },
        }, String(value)),
      ]);
    }

    /** One labelled secondary figure in the dock; `hint` explains what it counts. */
    function DockFigure({ stat, label, value, hint }) {
      return h('div', {
        'data-role': 'stat',
        'data-stat': stat,
        style: dockStyles.figure,
        ...(hint === undefined ? {} : { title: hint }),
      }, [
        h('span', { key: 'label', style: dockStyles.figureLabel }, label),
        h('span', { key: 'value', style: dockStyles.figureValue }, value),
      ]);
    }

    /** The statistics glyph, at the size its host asks for. */
    function JobStatsIcon({ size }) {
      const edge = typeof size === 'number' && Number.isFinite(size) ? size : 16;
      return h('svg', {
        viewBox: '0 0 16 16',
        width: edge,
        height: edge,
        fill: 'currentColor',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' },
      }, [
        h('rect', { key: 'bar-1', x: 2, y: 9, width: 3, height: 5, rx: 1 }),
        h('rect', { key: 'bar-2', x: 6.5, y: 6, width: 3, height: 8, rx: 1 }),
        h('rect', { key: 'bar-3', x: 11, y: 3, width: 3, height: 11, rx: 1 }),
      ]);
    }

    /**
     * The right Sidebar's job-statistics tab body.
     *
     * The dock renders one tab per session and hands that session id down, so the
     * panel needs no session selection of its own: mounting the tab opens the
     * roster stream for exactly that session and unmounting releases it.
     * @param props - session-scoped slot props: the tab's session id, the roster
     *   hook, the roster subscription, and the namespace translator.
     * @returns the dock panel element tree.
     */
    function JobStatsTabBody(props) {
      const face = props ?? {};
      const t = typeof face.t === 'function' ? face.t : (key, values) => format(zh[key] ?? key, values ?? {});
      const sessionId = typeof face.sessionId === 'string' && face.sessionId !== '' ? face.sessionId : undefined;
      const liveRows = useSessionRows(face.useJobs, sessionId);
      const watchRows = face.watchRows;
      const [ledgerVersion, setLedgerVersion] = React.useState(0);
      const [now, setNow] = React.useState(() => Date.now());

      // Accumulate: a job the host removes from the roster (every foreground
      // command, once its call collected the output) stays in this panel.
      React.useEffect(() => {
        if (remember(sessionId, liveRows)) setLedgerVersion((version) => version + 1);
      }, [sessionId, liveRows]);

      const liveIds = React.useMemo(
        () => new Set(liveRows.map((job) => String(job?.id ?? ''))),
        [liveRows],
      );
      const rows = React.useMemo(
        () => ledgerRows(sessionId, liveIds),
        [sessionId, liveIds, ledgerVersion],
      );
      const live = liveRows.some(isLive);

      // Keep the clock of a running record honest while the roster lists it: a long
      // command produces no frame between its start and its settlement.
      React.useEffect(() => {
        touch(sessionId, liveIds);
      }, [sessionId, liveIds, now]);

      React.useEffect(() => {
        if (sessionId === undefined || typeof watchRows !== 'function') return undefined;
        try {
          const dispose = watchRows(sessionId);
          return typeof dispose === 'function' ? dispose : undefined;
        } catch (error) {
          // A roster stream that cannot open leaves the panel on its last state
          // instead of taking the tab down with it.
          console.warn('[job-stats] unable to watch the job roster', error);
          return undefined;
        }
      }, [sessionId, watchRows]);

      React.useEffect(() => {
        if (!live) return undefined;
        const timer = setInterval(() => {
          setNow(Date.now());
        }, 1000);
        return () => {
          clearInterval(timer);
        };
      }, [live]);

      const stats = React.useMemo(() => summarize(rows, now), [rows, now]);
      const ordered = React.useMemo(() => orderRows(rows), [rows]);

      if (sessionId === undefined || stats.total === 0) {
        const message = sessionId === undefined ? t('sessionNone') : t('dockEmpty');
        const hint = sessionId === undefined ? t('sessionNoneHint') : t('dockEmptyHint');
        return h('div', {
          'data-plugin': 'dsh-client-ui-job-stats',
          'data-role': 'empty',
          style: dockStyles.empty,
        }, [
          h('span', { key: 'message', style: dockStyles.emptyTitle }, message),
          h('span', { key: 'hint', style: dockStyles.emptyHint }, hint),
        ]);
      }

      return h('div', {
        'data-plugin': 'dsh-client-ui-job-stats',
        'data-role': 'dock-body',
        style: dockStyles.body,
      }, [
        h('div', { key: 'cards', style: dockStyles.grid, 'aria-label': t('metricsAria') }, [
          h(DockMetric, { key: 'total', metric: 'total', label: t('metricTotal'), value: stats.total }),
          h(DockMetric, {
            key: 'running',
            metric: 'running',
            label: t('metricRunning'),
            value: stats.running + stats.stopping,
            tone: 'running',
          }),
          h(DockMetric, { key: 'completed', metric: 'completed', label: t('metricCompleted'), value: stats.completed, tone: 'completed' }),
          h(DockMetric, { key: 'failed', metric: 'failed', label: t('metricFailed'), value: stats.failed, tone: 'failed' }),
          h(DockMetric, { key: 'killed', metric: 'killed', label: t('metricKilled'), value: stats.killed, tone: 'killed' }),
          // A record the Host removed before reporting its outcome: counted here so
          // the cards still add up to the total, without claiming success or failure.
          h(DockMetric, { key: 'ended', metric: 'ended', label: t('metricEnded'), value: stats.ended, tone: 'ended' }),
        ]),
        h('div', { key: 'figures', style: dockStyles.figures }, [
          h(DockFigure, {
            key: 'rate',
            stat: 'successRate',
            label: t('statSuccessRate'),
            value: stats.successRate === undefined ? t('durationUnknown') : t('percent', { value: Math.round(stats.successRate * 100) }),
            // Reported outcomes only: jobs the Host removed before reporting theirs
            // would otherwise be silently scored as failures.
            hint: t('statSuccessRateHint'),
          }),
          h(DockFigure, {
            key: 'elapsed',
            stat: 'elapsed',
            label: t('statElapsed'),
            value: stats.elapsed === 0 ? t('durationUnknown') : formatDuration(stats.elapsed, t),
          }),
          h(DockFigure, {
            key: 'longest',
            stat: 'longest',
            label: t('statLongest'),
            value: stats.longest === 0 ? t('durationUnknown') : formatDuration(stats.longest, t),
          }),
          h(DockFigure, {
            key: 'output',
            stat: 'output',
            label: t('statOutput'),
            value: formatBytes(stats.retainedBytes, t),
          }),
        ]),
        h('section', {
          key: 'list',
          'data-role': 'job-list',
          style: dockStyles.list,
          'aria-label': t('listAria'),
        }, [
          h('div', { key: 'head', style: dockStyles.listHead }, [
            h('span', { key: 'title', style: dockStyles.listTitle }, t('listTitle')),
            h('span', { key: 'count', style: dockStyles.listCount }, t('listCount', { count: stats.total })),
          ]),
          h('ul', { key: 'rows', style: dockStyles.rows }, ordered.map((job, index) => h(JobRow, {
            key: `${job === null || typeof job !== 'object' ? index : String(job.id ?? index)}#${index}`,
            job,
            now,
            t,
          }))),
        ]),
      ]);
    }

    /** The dock tab's strip title: this plugin's glyph before the type label. */
    function JobStatsTabTitle({ useTabInfo }) {
      const title = typeof useTabInfo === 'function' ? useTabInfo()?.tab?.title : undefined;
      return h(React.Fragment, null, [
        h('span', { key: 'glyph', style: dockStyles.titleGlyph }, h(JobStatsIcon, { size: 14 })),
        title === undefined ? null : h('span', { key: 'label' }, title),
      ]);
    }

    /**
     * The right-Sidebar tab type this plugin owns.
     *
     * `kind` is this plugin's own, so the default `extension` band is correct: it
     * shadows no shipped type. The single guide entry is the card the column's
     * start page renders; picking it opens this kind in the dock.
     * @param t - namespace-bound translate, read fresh on every label call.
     * @returns the definition to register with `ctx.sidebarRightTabs`.
     */
    function jobStatsDefinition(t) {
      return {
        id: TAB_ID,
        kind: 'job-stats',
        title: () => t('typeLabel'),
        guide: [{
          id: 'job-stats',
          order: 40,
          title: () => t('guideTitle'),
          description: () => t('guideDescription'),
          icon: JobStatsIcon,
        }],
      };
    }

    /** Inline styles for the dock's narrow column: host theme tokens only. */
    const dockStyles = {
      body: {
        boxSizing: 'border-box',
        height: '100%',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '12px',
        color: 'var(--dsw-alias-label-primary, inherit)',
      },
      grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))',
        gap: '8px',
      },
      card: {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        padding: '8px 10px',
        borderRadius: 'var(--dsw-radius-md, 8px)',
        border: '1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.24))',
        background: 'var(--dsw-alias-fill-l1, rgba(127, 127, 127, 0.06))',
      },
      cardLabel: {
        fontSize: '11px',
        lineHeight: '16px',
        color: 'var(--dsw-alias-label-tertiary, inherit)',
      },
      cardValue: {
        fontSize: '18px',
        fontWeight: 500,
        lineHeight: '24px',
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--dsw-alias-label-primary, inherit)',
      },
      figures: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '10px 10px',
        borderRadius: 'var(--dsw-radius-md, 8px)',
        border: '1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.24))',
      },
      figure: {
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '10px',
        minWidth: 0,
      },
      figureLabel: {
        fontSize: '12px',
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-tertiary, inherit)',
        whiteSpace: 'nowrap',
      },
      figureValue: {
        fontSize: '12px',
        lineHeight: '20px',
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--dsw-alias-label-primary, inherit)',
        whiteSpace: 'nowrap',
      },
      list: {
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'var(--dsw-radius-md, 8px)',
        border: '1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.24))',
        overflow: 'hidden',
      },
      listHead: {
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '10px',
        padding: '8px 10px',
        borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.24))',
      },
      listTitle: {
        fontSize: '12px',
        fontWeight: 500,
        lineHeight: '18px',
      },
      listCount: {
        fontSize: '11px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-tertiary, inherit)',
      },
      rows: {
        listStyle: 'none',
        margin: 0,
        padding: 0,
      },
      row: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '8px 10px',
        borderTop: '1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.16))',
      },
      rowMain: {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        minWidth: 0,
        flex: '1 1 auto',
      },
      rowLabel: {
        fontSize: '12px',
        lineHeight: '18px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      rowMeta: {
        fontSize: '11px',
        lineHeight: '16px',
        color: 'var(--dsw-alias-label-tertiary, inherit)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      rowTime: {
        flex: 'none',
        fontSize: '11px',
        lineHeight: '18px',
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--dsw-alias-label-secondary, inherit)',
      },
      empty: {
        boxSizing: 'border-box',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        textAlign: 'center',
      },
      emptyTitle: {
        fontSize: '13px',
        lineHeight: '20px',
      },
      emptyHint: {
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-tertiary, inherit)',
      },
      titleGlyph: {
        display: 'inline-flex',
        alignItems: 'center',
        marginRight: '6px',
        color: 'var(--dsw-alias-label-secondary, inherit)',
      },
    };

    return {
      // Required browser services: the slot registry, the label dictionaries, and
      // the job roster mirror. The dock's tab registry is injected optionally
      // below, so a composition without the right Sidebar keeps this plugin
      // inactive instead of throwing.
      inject: ['slots', 'locale', 'jobs'],
      apply(ctx) {
        let translate = (key, values) => format(zh[key] ?? key, values ?? {});
        ctx.effect(() => {
          try {
            return ctx.locale.register(NS, { zh, en });
          } catch {
            return () => {};
          }
        }, 'job-stats: dictionaries');
        try {
          const bound = ctx.locale.bind(NS);
          if (typeof bound === 'function') translate = bound;
        } catch {
          /* an unbound locale keeps the Chinese dictionary above */
        }
        const jobs = ctx.jobs;
        ctx.inject(['sidebarRightTabs'], (dock) => {
          dock.effect(() => dock.sidebarRightTabs.register(jobStatsDefinition(translate)), 'job-stats: dock type');
          dock.effect(() => dock.slots.inject('sidebar.right.pane.tab', () => dock.slots.register({
            name: 'sidebar.right.pane.tab',
            key: TAB_ID,
            locale: NS,
            inject: (sessionId) => ({
              hooks: { jobs: jobs.state },
              watchRows: (id) => jobs.watchRows(id),
            }),
          }, JobStatsTabBody)), 'job-stats: dock body');
          dock.effect(() => dock.slots.inject('sidebar.right.pane.tab.title', () => dock.slots.register({
            name: 'sidebar.right.pane.tab.title',
            key: TAB_ID,
            locale: NS,
          }, JobStatsTabTitle)), 'job-stats: dock title');
        });
      },
    };
  },
});
