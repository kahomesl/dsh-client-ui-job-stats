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
      statSuccessRateHint: '仅统计已上报结果的任务（不含结局未知的已结束任务）',
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
      rowUntitled: '（未命名任务）',
      rowUnknownKind: '未知类型',
      expandHint: '点击查看完整命令',
      descWait: '等待',
      descWaitSeconds: '等待 {seconds} 秒',
      descVersion: '查看 {tool} 版本',
      descChangeDir: '切换目录',
      descTest: '跑测试',
      descBuild: '构建项目',
      descLint: '检查代码',
      descFormat: '格式化代码',
      descInstall: '安装依赖',
      descRunScript: '运行脚本 {script}',
      descRunTool: '运行 {tool}',
      descPublish: '发布包',
      descToolSub: '运行 {tool} {sub}',
      descGitStatus: '查看仓库状态',
      descGitAdd: '暂存改动',
      descGitCommit: '提交代码',
      descGitPush: '推送提交',
      descGitPull: '拉取更新',
      descGitFetch: '获取远端更新',
      descGitDiff: '查看改动',
      descGitLog: '查看提交历史',
      descGitBranch: '切换/查看分支',
      descGitClone: '克隆或初始化仓库',
      descGitTag: '打标签',
      descGitRemote: '查看远端配置',
      descGitStash: '暂存工作区',
      descGitInspect: '解析提交信息',
      descReadFile: '读取文件',
      descWriteFile: '写入文件',
      descListFiles: '列出文件',
      descSearchText: '搜索文本',
      descDelete: '删除文件',
      descCreate: '新建文件或目录',
      descCopy: '复制文件',
      descMove: '移动或重命名',
      descProcess: '查看进程',
      descStartProcess: '启动进程',
      descNetwork: '请求网络接口',
      descInspectPath: '检查路径或文件信息',
      descOutput: '输出信息',
      descNode: '运行 Node 代码',
      descNodeScript: '运行 {script}',
      descPython: '运行 Python 代码',
      descPythonScript: '运行 {script}',
      fieldCommand: '完整命令',
      fieldId: '任务 ID',
      fieldKind: '类型',
      fieldStatus: '状态',
      fieldStarted: '开始',
      fieldFinished: '结束',
      fieldDetail: '结束原因',
      fieldOutput: '保留输出',
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
      rowUntitled: '(untitled job)',
      rowUnknownKind: 'unknown kind',
      expandHint: 'Click to see the full command',
      descWait: 'wait',
      descWaitSeconds: 'wait {seconds}s',
      descVersion: 'check the {tool} version',
      descChangeDir: 'change directory',
      descTest: 'run tests',
      descBuild: 'build the project',
      descLint: 'lint the code',
      descFormat: 'format code',
      descInstall: 'install dependencies',
      descRunScript: 'run the {script} script',
      descRunTool: 'run {tool}',
      descPublish: 'publish the package',
      descToolSub: 'run {tool} {sub}',
      descGitStatus: 'check the working tree',
      descGitAdd: 'stage changes',
      descGitCommit: 'commit changes',
      descGitPush: 'push commits',
      descGitPull: 'pull updates',
      descGitFetch: 'fetch from the remote',
      descGitDiff: 'review the diff',
      descGitLog: 'read the commit history',
      descGitBranch: 'switch or list branches',
      descGitClone: 'clone or initialise a repository',
      descGitTag: 'tag a release',
      descGitRemote: 'inspect remotes',
      descGitStash: 'stash the working tree',
      descGitInspect: 'inspect commit metadata',
      descReadFile: 'read a file',
      descWriteFile: 'write a file',
      descListFiles: 'list files',
      descSearchText: 'search text',
      descDelete: 'delete files',
      descCreate: 'create a file or directory',
      descCopy: 'copy files',
      descMove: 'move or rename',
      descProcess: 'inspect processes',
      descStartProcess: 'start a process',
      descNetwork: 'make a network request',
      descInspectPath: 'inspect a path',
      descOutput: 'print a value',
      descNode: 'run Node code',
      descNodeScript: 'run {script}',
      descPython: 'run Python code',
      descPythonScript: 'run {script}',
      fieldCommand: 'Full command',
      fieldId: 'Job id',
      fieldKind: 'Kind',
      fieldStatus: 'Status',
      fieldStarted: 'Started',
      fieldFinished: 'Finished',
      fieldDetail: 'Terminal reason',
      fieldOutput: 'Retained output',
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

    /** Program names a tool script may hold in a variable (`$pnpm`, `$node`). */
    const KNOWN_TOOLS = new Set([
      'npm', 'pnpm', 'yarn', 'bun', 'node', 'nodejs', 'python', 'python3', 'py',
      'git', 'dotnet', 'docker', 'kubectl', 'vitest', 'jest', 'tsc',
    ]);

    /** Package-manager verbs, so an interpreter line still says what it does. */
    const PACKAGE_VERBS = new Set([
      'install', 'i', 'ci', 'add', 'test', 'run', 'build', 'lint', 'format', 'publish',
    ]);

    /** The first known tool mentioned in a lower-cased fragment, if any. */
    function knownToolIn(fragment) {
      for (const tool of KNOWN_TOOLS) {
        if (new RegExp(`(?:^|[\\s/\\\\$])${tool}\\b`, 'u').test(fragment)) return tool;
      }
      return undefined;
    }

    /** Strip one layer of matching quotes from one shell word. */
    function unquote(word) {
      const text = typeof word === 'string' ? word.trim() : '';
      if (text.length >= 2 && (text.startsWith('"') || text.startsWith("'")) && text.endsWith(text[0])) {
        return text.slice(1, -1);
      }
      return text;
    }

    /** First whitespace-separated word of a fragment, unquoted. */
    function firstWord(fragment) {
      const text = typeof fragment === 'string' ? fragment.trim() : '';
      if (text === '') return '';
      return unquote(text.split(/\s+/u)[0]);
    }

    /** The fragment without its first word. */
    function afterFirstWord(fragment) {
      const text = typeof fragment === 'string' ? fragment.trim() : '';
      const index = text.search(/\s/u);
      return index < 0 ? '' : text.slice(index).trim();
    }

    /** First number in a fragment, as written. */
    function firstNumber(fragment) {
      return /(\d+(?:\.\d+)?)/u.exec(typeof fragment === 'string' ? fragment : '')?.[1];
    }

    /** Basename of a path-like word, so 「运行 {script}」 copy stays short. */
    function basename(word) {
      const text = unquote(word);
      const parts = text.split(/[\\/]/u);
      return parts[parts.length - 1] === '' ? text : parts[parts.length - 1];
    }

    /**
     * Split a command into its top-level statements.
     *
     * Separators inside quotes, braces, parens or brackets (a hashtable literal, a
     * quoted string) do not split; a pipeline does, so the last stage — the action —
     * is what a caller inspects first.
     * @param command - the raw command text.
     * @returns the trimmed statements, in order.
     */
    function splitStatements(command) {
      const parts = [];
      let current = '';
      let quote = '';
      let escaped = false;
      let depth = 0;
      for (const character of command) {
        if (escaped) {
          // PowerShell's backtick escapes the next character (a line continuation,
          // an escaped quote): it never opens a quoted region.
          current += character;
          escaped = false;
          continue;
        }
        if (quote !== '') {
          current += character;
          if (character === quote) quote = '';
          continue;
        }
        if (character === '`') {
          current += character;
          escaped = true;
          continue;
        }
        if (character === "'" || character === '"') {
          quote = character;
          current += character;
          continue;
        }
        if (character === '{' || character === '(' || character === '[') depth += 1;
        if (character === '}' || character === ')' || character === ']') depth = Math.max(0, depth - 1);
        // `&` separates statements, but `2>&1` is a redirection: keep it whole.
        const redirection = /[\d>]\s*$/u.test(current);
        if (depth === 0 && (character === ';' || character === '\n' || character === '|' || (character === '&' && !redirection))) {
          parts.push(current);
          current = '';
          continue;
        }
        current += character;
      }
      parts.push(current);
      return parts.map((part) => part.trim()).filter((part) => part !== '');
    }

    /** Words of a statement, unquoted, with a leading call operator dropped. */
    function statementWords(statement) {
      return statement.trim().replace(/^[&.]\s+/u, '').split(/\s+/u).map(unquote).filter((word) => word !== '');
    }

    /**
     * Describe a statement whose program is a variable (`& $node '…\vitest.mjs' run`).
     *
     * The tool scripts this panel mostly sees launch their real program through a
     * variable, so the recognisable name is the first argument that is not a flag —
     * and a runner file name anywhere in the line decides it outright.
     * @param rest - everything after the variable.
     * @returns the description, or undefined when nothing recognisable follows.
     */
    function describeThroughVariable(rest) {
      const lower = rest.toLowerCase();
      if (/(?:^|[\s/\\])(?:vitest|jest|pytest|playwright|cypress)(?:\.(?:mjs|cjs|js))?\b/u.test(lower)) return { key: 'descTest' };
      const words = statementWords(rest);
      const program = words.find((word) => !word.startsWith('-') && word !== '');
      if (program === undefined) return undefined;
      return describeStatement([program, ...words.slice(words.indexOf(program) + 1)].join(' '));
    }

    /** Recognise a git invocation. */
    function describeGit(rest) {
      const sub = firstWord(rest).toLowerCase();
      switch (sub) {
        case 'status': return { key: 'descGitStatus' };
        case 'add': return { key: 'descGitAdd' };
        case 'commit': return { key: 'descGitCommit' };
        case 'push': return { key: 'descGitPush' };
        case 'pull': return { key: 'descGitPull' };
        case 'fetch': return { key: 'descGitFetch' };
        case 'diff':
        case 'show': return { key: 'descGitDiff' };
        case 'log':
        case 'shortlog':
        case 'blame': return { key: 'descGitLog' };
        case 'checkout':
        case 'switch':
        case 'branch': return { key: 'descGitBranch' };
        case 'clone':
        case 'init': return { key: 'descGitClone' };
        case 'tag': return { key: 'descGitTag' };
        case 'remote': return { key: 'descGitRemote' };
        case 'stash': return { key: 'descGitStash' };
        case 'rev-parse':
        case 'rev-list':
        case 'describe': return { key: 'descGitInspect' };
        default: return sub === '' ? undefined : { key: 'descToolSub', values: { tool: 'git', sub } };
      }
    }

    /** Recognise a package-manager invocation. */
    function describePackageManager(tool, rest) {
      const sub = firstWord(rest).toLowerCase();
      const tail = afterFirstWord(rest);
      switch (sub) {
        case 'install':
        case 'i':
        case 'add':
        case 'ci': return { key: 'descInstall' };
        case 'test':
        case 't': return { key: 'descTest' };
        case 'build': return { key: 'descBuild' };
        case 'lint': return { key: 'descLint' };
        case 'format': return { key: 'descFormat' };
        case 'run':
        case 'run-script': return firstWord(tail) === '' ? undefined : { key: 'descRunScript', values: { script: firstWord(tail) } };
        case 'exec':
        case 'dlx':
        case 'x': {
          const inner = firstWord(tail);
          if (inner === '') return undefined;
          return describeStatement(tail) ?? { key: 'descRunTool', values: { tool: inner } };
        }
        case 'publish': return { key: 'descPublish' };
        case 'version': return { key: 'descVersion', values: { tool } };
        default: return sub === '' ? undefined : { key: 'descToolSub', values: { tool, sub } };
      }
    }

    /**
     * What one statement does, as a locale key plus its values.
     *
     * Recognition is deliberately conservative: a statement it does not understand
     * returns undefined and the panel keeps showing the command itself, because a
     * wrong summary is worse than the raw text.
     * @param text - one statement.
     * @returns the description, or undefined when the statement is not recognised.
     */
    function describeStatement(text) {
      let statement = typeof text === 'string' ? text.trim() : '';
      // A leading assignment (`$x = …`) is setup: the action is what follows.
      const assignment = /^\$[A-Za-z_][\w:]*\s*=\s*/u.exec(statement);
      if (assignment !== null) statement = statement.slice(assignment[0].length).trim();
      statement = statement.replace(/^[&.]\s+/u, '').trim();
      if (statement === '') return undefined;
      const rawFirst = unquote(statement.split(/\s+/u)[0]);
      const bare = rawFirst.replace(/\.(?:exe|cmd|bat|ps1)$/iu, '').toLowerCase();
      const rest = afterFirstWord(statement);
      const lower = rest.toLowerCase();
      // `& $node '…\vitest.mjs' run`, `$pnpm install`: the tool scripts this panel
      // mostly sees keep their program in a variable. A variable named after the
      // tool is that tool; anything else has to be recognised from its arguments.
      if (bare.startsWith('$')) {
        const named = bare.slice(1);
        if (KNOWN_TOOLS.has(named)) return describeStatement(`${named} ${rest}`);
        return describeThroughVariable(rest);
      }
      const program = bare;
      // `--version` on anything is the same question.
      if (/^--?v(?:ersion)?$/u.test(rest)) return { key: 'descVersion', values: { tool: program } };

      switch (program) {
        case 'cd':
        case 'chdir':
        case 'set-location': return { key: 'descChangeDir' };
        case 'start-sleep':
        case 'sleep': {
          const seconds = firstNumber(rest);
          return seconds === undefined ? { key: 'descWait' } : { key: 'descWaitSeconds', values: { seconds } };
        }
        case 'git': return describeGit(rest);
        case 'npm':
        case 'pnpm':
        case 'yarn':
        case 'bun': return describePackageManager(program, rest);
        case 'node':
        case 'nodejs': {
          if (/(?:^|[\s/\\])(?:vitest|jest|mocha|ava|tap)\b/u.test(lower)) return { key: 'descTest' };
          const words = statementWords(rest);
          // `& $node $pnpm install …`: an interpreter line that is really a
          // package-manager call keeps the verb, so the row still says what it does.
          const verbIndex = words.findIndex((word) => PACKAGE_VERBS.has(word.toLowerCase()));
          if (verbIndex >= 0) {
            const manager = knownToolIn(lower) ?? 'node';
            return describePackageManager(manager, words.slice(verbIndex).join(' ')) ?? { key: 'descNode' };
          }
          const target = firstWord(rest);
          if (target === '') return undefined;
          if (target.startsWith('-') || target.startsWith('$')) return { key: 'descNode' };
          return { key: 'descNodeScript', values: { script: basename(target) } };
        }
        case 'python':
        case 'python3':
        case 'py': {
          const script = firstWord(rest);
          if (script === '' || script.startsWith('-')) return { key: 'descPython' };
          return { key: 'descPythonScript', values: { script: basename(script) } };
        }
        case 'npx':
        case 'pnpx':
        case 'uvx': {
          const inner = firstWord(rest);
          if (inner === '') return undefined;
          return describeStatement(rest) ?? { key: 'descRunTool', values: { tool: inner } };
        }
        case 'vitest':
        case 'jest':
        case 'pytest':
        case 'playwright':
        case 'cypress':
        case 'mocha': return { key: 'descTest' };
        case 'tsc':
        case 'webpack':
        case 'rollup': return { key: 'descBuild' };
        case 'eslint':
        case 'ruff':
        case 'pylint':
        case 'stylelint': return { key: 'descLint' };
        case 'prettier':
        case 'black':
        case 'gofmt': return { key: 'descFormat' };
        case 'get-content':
        case 'gc':
        case 'cat':
        case 'type':
        case 'head':
        case 'tail':
        case 'less':
        case 'more': return { key: 'descReadFile' };
        case 'set-content':
        case 'sc':
        case 'add-content':
        case 'out-file':
        case 'set-item':
        case 'tee': return { key: 'descWriteFile' };
        case 'get-childitem':
        case 'gci':
        case 'ls':
        case 'dir':
        case 'tree': return { key: 'descListFiles' };
        case 'select-string':
        case 'sls':
        case 'findstr':
        case 'grep':
        case 'rg':
        case 'where-object': return { key: 'descSearchText' };
        case 'remove-item':
        case 'ri':
        case 'del':
        case 'erase':
        case 'rm':
        case 'rmdir': return { key: 'descDelete' };
        case 'new-item':
        case 'ni':
        case 'mkdir':
        case 'md':
        case 'touch': return { key: 'descCreate' };
        case 'copy-item':
        case 'cpi':
        case 'cp':
        case 'copy':
        case 'robocopy':
        case 'xcopy': return { key: 'descCopy' };
        case 'move-item':
        case 'mi':
        case 'mv':
        case 'move':
        case 'rename-item':
        case 'ren': return { key: 'descMove' };
        case 'get-process':
        case 'gps':
        case 'tasklist': return { key: 'descProcess' };
        case 'start-process':
        case 'start': return { key: 'descStartProcess' };
        case 'invoke-restmethod':
        case 'irm':
        case 'invoke-webrequest':
        case 'iwr':
        case 'curl':
        case 'wget': return { key: 'descNetwork' };
        case 'test-path':
        case 'get-item':
        case 'gi':
        case 'resolve-path':
        case 'stat': return { key: 'descInspectPath' };
        case 'echo':
        case 'write-output':
        case 'write-host':
        case 'printf': return { key: 'descOutput' };
        case 'dotnet':
        case 'gradle':
        case 'gradlew':
        case 'mvn':
        case 'maven':
        case 'cargo':
        case 'go':
        case 'make':
        case 'cmake':
        case 'msbuild': {
          const sub = firstWord(rest).toLowerCase();
          if (sub === 'test') return { key: 'descTest' };
          if (sub === 'build' || sub === 'publish' || sub === 'package' || sub === 'assemble') return { key: 'descBuild' };
          if (sub === 'run') return { key: 'descRunTool', values: { tool: program } };
          return sub === '' ? undefined : { key: 'descToolSub', values: { tool: program, sub } };
        }
        case 'docker':
        case 'docker-compose':
        case 'kubectl':
        case 'helm': {
          const sub = firstWord(rest).toLowerCase();
          return sub === '' ? undefined : { key: 'descToolSub', values: { tool: program, sub } };
        }
        default: break;
      }
      return undefined;
    }

    /**
     * Summarise a job's label as "what it is doing", when the label is a command
     * this panel recognises.
     * @param label - the job's label (the producer's own line, often the command).
     * @returns a locale key and values, or undefined to show the label as it is.
     */
    function describeCommand(label) {
      if (typeof label !== 'string' || label.trim() === '') return undefined;
      const statements = splitStatements(label);
      // The last recognised statement is the action: earlier ones are setup
      // (`cd …`, an assignment) and a pipeline's earlier stages are inputs.
      for (let index = statements.length - 1; index >= 0; index -= 1) {
        const described = describeStatement(statements[index]);
        if (described !== undefined) return described;
      }
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
    /** Shortest gap between two browser-storage writes while records keep arriving. */
    const LEDGER_INTERVAL_MS = 1000;
    /** Longest delay before retrying a browser-storage write that was rejected. */
    const LEDGER_RETRY_MAX_MS = 30_000;
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
      const entry = {
        records: new Map(),
        writtenAt: 0,
        dirty: false,
        pending: null,
        retryMs: LEDGER_INTERVAL_MS,
        failures: 0,
        lastError: null,
      };
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

    /** Cancel one ledger's pending trailing write. */
    function clearPendingWrite(entry) {
      if (entry.pending === null) return;
      clearTimeout(entry.pending);
      entry.pending = null;
    }

    /**
     * Write one session's live ledger to browser storage.
     * @param sessionId - the session the ledger belongs to.
     * @param entry - the ledger entry.
     * @returns whether the write landed.
     */
    function writeLedger(sessionId, entry) {
      try {
        window.localStorage?.setItem(LEDGER_KEY + sessionId, JSON.stringify([...entry.records.values()]));
        entry.writtenAt = Date.now();
        entry.dirty = false;
        entry.failures = 0;
        entry.retryMs = LEDGER_INTERVAL_MS;
        entry.lastError = null;
        return true;
      } catch (error) {
        // A full or unavailable store keeps the in-memory ledger and stays dirty:
        // the next attempt writes the whole batch again.
        entry.dirty = true;
        entry.failures += 1;
        entry.lastError = error instanceof Error ? error.message : String(error);
        entry.retryMs = Math.min(entry.retryMs * 2, LEDGER_RETRY_MAX_MS);
        if (entry.failures === 1 || (entry.failures & (entry.failures - 1)) === 0) {
          console.warn(`[job-stats] cannot write the accumulated ledger for ${sessionId}: ${entry.lastError}`);
        }
        return false;
      }
    }

    /** Arm the single trailing write that publishes whatever the window swallowed. */
    function armLedgerWrite(sessionId, entry, delay) {
      if (entry.pending !== null || !entry.dirty) return;
      entry.pending = setTimeout(() => {
        entry.pending = null;
        if (!entry.dirty) return;
        writeLedger(sessionId, entry);
        if (entry.dirty) armLedgerWrite(sessionId, entry, entry.retryMs);
      }, Math.max(0, delay));
    }

    /**
     * Persist one session's ledger.
     *
     * `writtenAt` is the last *successful* write, so a burst of record updates is
     * merged into one immediate write plus one trailing write at the end of the
     * window: the last batch always reaches storage, and a page closed inside the
     * window does not lose it. The timer is never duplicated or re-armed earlier,
     * the write always serializes the live ledger, so a late timer cannot publish
     * a stale one, and a rejected write stays dirty for the next attempt.
     * @param sessionId - the session the ledger belongs to.
     * @param entry - the ledger entry.
     * @param force - write now whatever the window says (lifecycle flushes only).
     */
    function persistLedger(sessionId, entry, force) {
      entry.dirty = true;
      const elapsed = Date.now() - entry.writtenAt;
      if (force || elapsed >= LEDGER_INTERVAL_MS) {
        clearPendingWrite(entry);
        writeLedger(sessionId, entry);
        if (entry.dirty) armLedgerWrite(sessionId, entry, entry.retryMs);
        return;
      }
      armLedgerWrite(sessionId, entry, LEDGER_INTERVAL_MS - elapsed);
    }

    /** Publish every dirty ledger at once, as the page is going away. */
    function flushLedgers() {
      for (const [sessionId, entry] of ledgers) {
        clearPendingWrite(entry);
        if (entry.dirty) writeLedger(sessionId, entry);
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
      for (const job of rows) {
        const record = ledgerRecord(job, seenAt);
        if (record.id === '') continue;
        const previous = entry.records.get(record.id);
        if (previous !== undefined && sameRecord(previous, record)) {
          // A still-live row keeps its clock moving without dirtying the ledger.
          if (isLive(record)) previous.seenAt = seenAt;
          continue;
        }
        // Never downgrade a record whose outcome the Host already reported: a roster
        // frame produced before the settlement can arrive after it (two channels).
        if (previous !== undefined && !isLive(previous) && isLive(record)) continue;
        entry.records.set(record.id, record);
        changed = true;
      }
      if (changed) {
        pruneLedger(entry);
        // Merged, not forced: a burst of frames inside the window costs one write
        // now and one trailing write at its end, and the tail is never lost.
        persistLedger(sessionId, entry, false);
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
     * sighting, and the row says it ended rather than claiming it is still running
     * (an outcome the Host recorder reports later replaces it outright).
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
          ? { ...record, status: 'ended', finishedAt: record.seenAt }
          : record);
      }
      return rows;
    }

    /** Route the Host half records terminated jobs on; resolved document-relatively. */
    const OUTCOMES_PATH = 'dsh-job-stats/outcomes';
    /** How often the panel asks for recorded outcomes while it is open. */
    const OUTCOMES_POLL_MS = 2000;
    /** Delay before retrying a roster stream that would not open. */
    const ROSTER_RETRY_MS = 500;
    /** Longest delay before retrying a roster stream that would not open. */
    const ROSTER_RETRY_MAX_MS = 30_000;

    /**
     * Resolve the outcomes route against the page the UI is served from.
     *
     * A root-absolute URL would miss a host mounted under a prefix, so the path is
     * resolved against `document.baseURI` — the pattern the shipped market UI uses.
     * @param sessionId - the session whose outcomes are wanted.
     * @returns the path (and query) to fetch.
     */
    function outcomesUrl(sessionId) {
      const relative = `${OUTCOMES_PATH}?sessionId=${encodeURIComponent(String(sessionId))}`;
      if (typeof document === 'undefined' || typeof document.baseURI !== 'string') return `/${relative}`;
      try {
        const resolved = new URL(relative, document.baseURI);
        return `${resolved.pathname}${resolved.search}`;
      } catch {
        return `/${relative}`;
      }
    }

    /**
     * How the outcomes poll is doing.
     *
     * A gap in the panel has several possible causes — the Host recorded nothing, the
     * recorder row is not composed, the request failed, the body was not JSON, the
     * page lost its connection — and they are indistinguishable when every failure
     * returns `undefined` silently. These counters keep them apart, the console gets
     * the first failure and then only every doubling so a long outage stays quiet,
     * and a recovery is announced once.
     */
    const outcomesHealth = {
      lastOkAt: null,
      lastErrorAt: null,
      consecutiveFailures: 0,
      lastStatusCode: null,
      lastError: null,
    };

    /** Record one unreadable poll, with or without a response. */
    function noteOutcomesFailure(status, message) {
      outcomesHealth.consecutiveFailures += 1;
      outcomesHealth.lastErrorAt = Date.now();
      outcomesHealth.lastStatusCode = status;
      outcomesHealth.lastError = message;
      const failures = outcomesHealth.consecutiveFailures;
      // Low noise: the first failure, then only on every doubling.
      if (failures === 1 || (failures & (failures - 1)) === 0) {
        console.warn(`[job-stats] outcomes polling failed ${String(failures)} time(s): ${message}`);
      }
    }

    /**
     * Read the Host's recorded outcomes.
     * @param sessionId - the session whose outcomes are wanted.
     * @returns the outcome records, or undefined when they could not be read.
     */
    async function fetchOutcomes(sessionId) {
      if (typeof fetch !== 'function') {
        noteOutcomesFailure(null, 'this page has no fetch');
        return undefined;
      }
      let response;
      try {
        response = await fetch(outcomesUrl(sessionId), { headers: { accept: 'application/json' } });
      } catch (error) {
        noteOutcomesFailure(null, error instanceof Error ? error.message : String(error));
        return undefined;
      }
      if (response === null || typeof response !== 'object') {
        noteOutcomesFailure(null, 'the request produced no response');
        return undefined;
      }
      const status = typeof response.status === 'number' ? response.status : null;
      if (response.ok !== true) {
        noteOutcomesFailure(status, `the recorder route answered ${status === null ? 'nothing' : `HTTP ${String(status)}`}`);
        return undefined;
      }
      let body;
      try {
        body = await response.json();
      } catch (error) {
        noteOutcomesFailure(status, `the answer was not JSON: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
      }
      const outcomes = body !== null && typeof body === 'object' && Array.isArray(body.outcomes) ? body.outcomes : undefined;
      if (outcomes === undefined) {
        noteOutcomesFailure(status, 'the answer carried no outcome list');
        return undefined;
      }
      const failures = outcomesHealth.consecutiveFailures;
      outcomesHealth.lastOkAt = Date.now();
      outcomesHealth.consecutiveFailures = 0;
      outcomesHealth.lastStatusCode = status;
      outcomesHealth.lastError = null;
      if (failures > 0) console.info(`[job-stats] outcomes polling recovered after ${String(failures)} failure(s)`);
      return outcomes;
    }

    /**
     * Merge recorded outcomes into one session's ledger.
     *
     * The Host is the only witness of a collected command's terminal state, which is
     * what turns a row the roster abandoned into a real 已完成 / 已失败 / 已取消 —
     * including jobs this tab never saw while they ran.
     * @param sessionId - the session the outcomes belong to.
     * @param outcomes - records as served by the recorder row.
     * @returns whether the ledger changed.
     */
    function mergeOutcomes(sessionId, outcomes) {
      if (sessionId === undefined || outcomes.length === 0) return false;
      const entry = ledgerFor(sessionId);
      const seenAt = Date.now();
      let changed = false;
      for (const outcome of outcomes) {
        if (outcome === null || typeof outcome !== 'object') continue;
        if (typeof outcome.id !== 'string' || outcome.id === '') continue;
        const status = outcome.status;
        if (status !== 'completed' && status !== 'failed' && status !== 'killed') continue;
        const record = {
          id: outcome.id,
          kind: typeof outcome.kind === 'string' ? outcome.kind : '',
          label: typeof outcome.label === 'string' ? outcome.label : '',
          status,
          startedAt: typeof outcome.startedAt === 'number' && Number.isFinite(outcome.startedAt) ? outcome.startedAt : 0,
          ...(typeof outcome.finishedAt === 'number' && Number.isFinite(outcome.finishedAt) ? { finishedAt: outcome.finishedAt } : {}),
          ...(typeof outcome.detail === 'string' && outcome.detail !== '' ? { detail: outcome.detail } : {}),
          bytes: typeof outcome.bytes === 'number' && Number.isFinite(outcome.bytes) && outcome.bytes > 0 ? outcome.bytes : 0,
          seenAt,
        };
        const previous = entry.records.get(record.id);
        if (previous !== undefined && !isLive(previous) && sameRecord(previous, record)) continue;
        entry.records.set(record.id, record);
        changed = true;
      }
      if (changed) {
        pruneLedger(entry);
        persistLedger(sessionId, entry, false);
      }
      return changed;
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

    /** Clock text for one timestamp, in the reader's own time zone. */
    function clockText(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
      const date = new Date(value);
      const pad = (part) => String(part).padStart(2, '0');
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    /** One task line: a plain-language summary, expandable to the raw command and its facts. */
    function JobRow({ job, now, t }) {
      const [open, setOpen] = React.useState(false);
      const status = statusOf(job);
      const rawLabel = job === null || typeof job !== 'object' ? undefined : job.label;
      const label = typeof rawLabel === 'string' && rawLabel !== '' ? rawLabel : t('rowUntitled');
      const rawKind = job === null || typeof job !== 'object' ? undefined : job.kind;
      const kind = typeof rawKind === 'string' && rawKind !== '' ? rawKind : t('rowUnknownKind');
      const statusText = t(statusLabelKey(status));
      const detail = jobDetail(job);
      const meta = detail === undefined ? `${kind} · ${statusText}` : `${kind} · ${statusText} · ${detail}`;
      const elapsed = durationMs(job, now);
      // What the task is doing, when the label is a command this panel recognises;
      // otherwise the label itself, so nothing is ever invented.
      const described = describeCommand(label);
      const title = described === undefined ? label : format(t(described.key), described.values ?? {});
      const startedAt = job === null || typeof job !== 'object' ? undefined : clockText(job.startedAt);
      const finishedAt = job === null || typeof job !== 'object' ? undefined : clockText(job.finishedAt);
      const bytes = job === null || typeof job !== 'object' ? undefined : (job.output?.total ?? job.bytes);
      const facts = [
        { key: 'command', label: t('fieldCommand'), value: label, mono: true },
        { key: 'id', label: t('fieldId'), value: String(job?.id ?? '') || t('rowUntitled') },
        { key: 'kind', label: t('fieldKind'), value: kind },
        { key: 'status', label: t('fieldStatus'), value: statusText },
        ...(startedAt === undefined ? [] : [{ key: 'started', label: t('fieldStarted'), value: startedAt }]),
        ...(finishedAt === undefined ? [] : [{ key: 'finished', label: t('fieldFinished'), value: finishedAt }]),
        ...(detail === undefined ? [] : [{ key: 'detail', label: t('fieldDetail'), value: detail }]),
        ...(typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0
          ? [{ key: 'output', label: t('fieldOutput'), value: formatBytes(bytes, t) }]
          : []),
      ];
      return h('li', {
        'data-role': 'job-row',
        'data-status': status,
        style: dockStyles.row,
      }, [
        h('button', {
          key: 'toggle',
          type: 'button',
          'data-role': 'job-row-toggle',
          'aria-expanded': open ? 'true' : 'false',
          'aria-label': t('expandHint'),
          title: label,
          onClick: () => setOpen((value) => !value),
          style: dockStyles.rowButton,
        }, [
          h(StatusDot, { key: 'dot', status }),
          h('span', { key: 'main', style: dockStyles.rowMain }, [
            h('span', { key: 'label', 'data-role': 'job-row-title', style: dockStyles.rowLabel }, title),
            h('span', { key: 'meta', 'data-role': 'job-row-meta', style: dockStyles.rowMeta }, meta),
          ]),
          h('span', {
            key: 'time',
            style: dockStyles.rowTime,
          }, elapsed === undefined ? t('durationUnknown') : formatDuration(elapsed, t)),
        ]),
        open ? h('dl', {
          key: 'facts',
          'data-role': 'job-row-detail',
          style: dockStyles.rowDetail,
        }, facts.map((fact) => h('div', { key: fact.key, style: dockStyles.detailRow }, [
          h('dt', { key: 'label', style: dockStyles.detailLabel }, fact.label),
          h('dd', {
            key: 'value',
            style: fact.mono === true ? dockStyles.detailCommand : dockStyles.detailValue,
          }, fact.value),
        ]))) : null,
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

    /** One small stylesheet inline styles cannot express: hover, focus, separators. */
    const STYLE_TAG = 'dsh-client-ui-job-stats/styles';

    /** Install that stylesheet once; returns a disposer that removes it. */
    function installStyles() {
      if (typeof document === 'undefined' || typeof document.createElement !== 'function') return () => {};
      if (document.querySelector(`style[data-plugin-css="${STYLE_TAG}"]`) !== null) return () => {};
      const style = document.createElement('style');
      style.dataset.pluginCss = STYLE_TAG;
      style.textContent = [
        '[data-plugin="dsh-client-ui-job-stats"] [data-role="job-row-toggle"]:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.08))}',
        '[data-plugin="dsh-client-ui-job-stats"] [data-role="job-row-toggle"]:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary, #3b82f6);outline-offset:-2px}',
        '[data-plugin="dsh-client-ui-job-stats"] [data-role="job-row-detail"]{border-top:1px dashed var(--dsw-alias-border-l1, rgba(127,127,127,.24))}',
      ].join('\n');
      document.head.append(style);
      return () => {
        style.remove();
      };
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
        let stopped = false;
        let attempt = 0;
        let close;
        let timer;
        /** Open the roster stream, retrying behind a bounded backoff while it refuses. */
        const open = () => {
          if (stopped) return;
          attempt += 1;
          try {
            const dispose = watchRows(sessionId);
            close = typeof dispose === 'function' ? dispose : undefined;
            if (attempt > 1) console.info(`[job-stats] job roster watch recovered after ${String(attempt - 1)} failed attempt(s)`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const wait = Math.min(ROSTER_RETRY_MS * 2 ** (attempt - 1), ROSTER_RETRY_MAX_MS);
            // Low noise: the first failure, then only on every doubling.
            if (attempt === 1 || (attempt & (attempt - 1)) === 0) {
              console.warn(`[job-stats] unable to watch the job roster (attempt ${String(attempt)}): ${message}; retrying in ${String(wait)}ms`);
            }
            timer = setTimeout(open, wait);
          }
        };
        open();
        return () => {
          // Unmounting — or another session — stops the retries for good.
          stopped = true;
          if (timer !== undefined) clearTimeout(timer);
          close?.();
        };
      }, [sessionId, watchRows]);

      // Outcomes the roster cannot carry: the Host records them, the panel asks for
      // them while it is open. Polling (rather than pushing) keeps this a plain read
      // with no stream of its own.
      React.useEffect(() => {
        if (sessionId === undefined) return undefined;
        let active = true;
        const sync = () => {
          fetchOutcomes(sessionId).then((outcomes) => {
            if (!active || outcomes === undefined) return;
            if (mergeOutcomes(sessionId, outcomes)) setLedgerVersion((version) => version + 1);
          });
        };
        sync();
        const timer = setInterval(sync, OUTCOMES_POLL_MS);
        return () => {
          active = false;
          clearInterval(timer);
        };
      }, [sessionId]);

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
        // The dock hands a tab body a flex column with `height: 100%` and
        // `overflow: hidden`. Without `min-height: 0` here the panel's own
        // children absorb the shrink — the detail list clips its rows and nothing
        // is scrollable.
        minHeight: 0,
        overflow: 'hidden',
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
        flex: 'none',
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
        flex: 'none',
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
        // Takes the room the cards and figures leave and scrolls its own rows, so
        // the head stays put and the wheel always has something to move.
        flex: '1 1 auto',
        minHeight: 0,
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
        flex: 'none',
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
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
      },
      row: {
        borderTop: '1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.16))',
      },
      rowButton: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        boxSizing: 'border-box',
        width: '100%',
        padding: '8px 10px',
        border: 'none',
        background: 'none',
        color: 'inherit',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      },
      rowDetail: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        margin: 0,
        padding: '6px 10px 8px 26px',
        fontSize: '11px',
        lineHeight: '16px',
        color: 'var(--dsw-alias-label-tertiary, currentColor)',
      },
      detailRow: {
        display: 'flex',
        gap: '8px',
        minWidth: 0,
      },
      detailLabel: {
        flex: 'none',
        width: '56px',
      },
      detailValue: {
        flex: '1 1 auto',
        minWidth: 0,
        margin: 0,
        wordBreak: 'break-all',
      },
      detailCommand: {
        flex: '1 1 auto',
        minWidth: 0,
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        color: 'var(--dsw-alias-label-secondary, currentColor)',
        fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
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
        ctx.effect(() => installStyles(), 'job-stats: stylesheet');
        // A page that goes away inside the write window must still publish the batch
        // the trailing write was holding: `pagehide` covers reload, navigation and a
        // closing window, and the same flush runs when the plugin is disposed.
        ctx.effect(() => {
          if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
          const flush = () => {
            flushLedgers();
          };
          window.addEventListener('pagehide', flush);
          return () => {
            window.removeEventListener('pagehide', flush);
            flushLedgers();
          };
        }, 'job-stats: ledger flush');
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
