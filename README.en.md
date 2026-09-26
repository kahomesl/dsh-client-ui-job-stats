# dsh-client-ui-job-stats

[![CI](https://github.com/kahomesl/dsh-client-ui-job-stats/actions/workflows/ci.yml/badge.svg)](https://github.com/kahomesl/dsh-client-ui-job-stats/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.7--rc.2-informational)

**Session background-job statistics for DeepSeek Harness: a right Sidebar tab that keeps a running ledger of every job the session ran.**

[中文](README.md) | **English**

![The job-statistics panel](docs/screenshot-jobs.png)
![A task row expanded to its full command](docs/screenshot-detail.png)

Both images are produced by `pnpm preview` from the plugin's own components — the
same `client/client.js` the Host serves, mounted with the props the renderer
composes and the app's dark-theme token values — over sample job rows, because a
screenshot of a live session would show whatever that session ran. They are declared
in [`screenshots.json`](screenshots.json), which is what storefronts read.

---

## What it is

DeepSeek Harness ships a *live* job roster in the session header: it lists what the session can currently see, and a foreground command's record leaves that roster the moment the call that started it collects the output. That makes it a good progress indicator and a poor statistics view — a task flashes and disappears.

This plugin adds a **statistics** seat next to it, inside the right Sidebar:

- **Where** — expand the right Sidebar (the session header's 「打开侧边栏」 button / `Ctrl+Alt+B`). The column's start page gains a fourth card, **Background job stats**, next to the shipped 工作区文件 / 新建终端 / 浏览器 types. Picking it opens the panel as a dock tab.
- **What** — totals per status, success rate, accumulated and longest duration, retained output, and a per-task list (status, kind, duration, terminal reason), ordered live-first then newest-settled-first.
- **Scope** — one tab per session: the panel shows the session it was opened in, and nothing else.
- **Language** — Simplified Chinese and English, following the host language.
- **Accumulation** — the panel remembers every job it has seen, so finished tasks stay in the statistics instead of vanishing from the live roster.

## Features

| | |
|---|---|
| Counts | 合计 / 运行中 / 已完成 / 已失败 / 已取消 / 已结束 (total / running / completed / failed / cancelled / ended) |
| Figures | success rate over reported outcomes (completed ÷ settled), accumulated duration, longest single job, retained output bytes |
| Detail list | one row per task: status dot, summary line, kind · status · reason, elapsed time; the list scrolls on its own, with a pinned head |
| Plain-language summaries | a recognised command reads as what it does — 等待 75 秒 / 提交代码 / 跑测试 / 安装依赖 — in the host language, instead of quoting the code |
| Detail on demand | click a row to expand it: the full command, job id, kind, status, start and finish clock, terminal reason and retained output |
| Live clock | running jobs tick once a second while the tab is open |
| Ledger | per-session, keyed by provisional session/id/start then Host boot/owner/id; browser v3 retains 300 records, oldest settled evicted first |
| Defensive | unknown statuses, missing ids, forged fields and an unreadable ledger never throw and never blank the tab |

## Install

The plugin is a normal Harness bundle. Install it into a profile from a checkout (this is how it is used on the development machine):

```bash
git clone https://github.com/kahomesl/dsh-client-ui-job-stats.git
```

1. In your profile directory (the one whose `package.json` lists `dsh.profile.bundles`, e.g. `~/.dsh/profiles/desktop`), add the package as a local link and select it as a bundle:

   ```jsonc
   {
     "dependencies": {
       "dsh-client-ui-job-stats": "link:/absolute/path/to/dsh-client-ui-job-stats"
     },
     "dsh": {
       "profile": {
         "bundles": [
           // …your existing bundles…
           "dsh-client-ui-job-stats"
         ]
       }
     }
   }
   ```

2. Install it:

   ```bash
   pnpm install
   ```

3. Expand the right Sidebar — the **Background job stats** card is on its start page. The host re-reads a changed client bundle on its own, so the panel needs no restart.
4. **Restart DSH once.** The Host half (the outcome recorder) is a Loader row, and rows from a bundle patch are composed at boot; until that restart the panel works but can only report the roster's own story (see *Known limits*). A restart is needed once per install, not per update.

`cordis.patch.yml` in this package inserts both of its Loader rows; nothing else in the profile is touched.

**Disable / uninstall** — remove the name from `dsh.profile.bundles` to switch it off (keep the dependency to switch it back on), or remove both entries and run `pnpm install` again to uninstall.

**Requires** `@deepseek-ai/dsh-client-ui-sidebar-right` and `@deepseek-ai/dsh-api-job-controller` in the composition. Without them the plugin simply stays inactive — it never fails activation.

## How the numbers are computed

The panel reads `ctx.jobs`, the client mirror of the job roster (`@deepseek-ai/dsh-api-job-controller`), and adds a ledger on top:

1. While the tab is mounted it holds the session's roster stream open (`ctx.jobs.watchRows(sessionId)`); the stream's first frame is already the whole truth.
2. A live row first uses a provisional `live:<sessionId>:<id>:<startedAt>` identity. The recorder stamps each terminal outcome with a boot UUID and uses `bootId:owner:id` as its persistent identity. A matching session/id/start upgrades the provisional row rather than showing two tasks; the UI still displays the raw `pwsh-1` job id. Restarts no longer overwrite older jobs with reused raw ids.
3. Statistics and the list are computed from the ledger, which is why a finished task stays after the host removes its record. Browser storage uses `dsh-job-stats/v3/<sessionId>`; on first read, surviving v2 records migrate to stable legacy identities that cannot collide with a future boot. v2 is not deleted, and a failed v3 write leaves v2 intact for a later retry. Only terminal records are hydrated; previously overwritten history cannot be reconstructed.
4. **Outcomes come from the Host.** The recorder row subscribes to the registry's `settled` events — the one witness of a collected command's terminal state — and keeps them **durably** in `.job-stats/ledger.json` inside the profile. The panel polls the route (`dsh-job-stats/outcomes`, resolved document-relatively against `document.baseURI`) every two seconds and merges what it reports: a row the roster abandoned becomes a real 已完成 / 已失败 / 已取消 with the terminal reason, and a job this tab never saw while it ran is added with its outcome. Because that ledger is the Host's, a panel opened after a restart still shows what the previous run settled — browser storage is not part of this path.

### The ledger file

| | |
|---|---|
| Path | Resolved from the facts the Host actually has, most specific first: `DSH_PROFILE_DIR` → `DSH_HOME`/`DSH_PROFILE` → **the profile directory the launcher passes on argv** (`dsh-desktop-host` always passes it, as `<home>/profiles/<name>`) → the harness home (`$DSH_HOME`, or `~/.dsh`, the framework's own default). The Desktop host exports neither variable, so the argv rule is the one it uses; the rule that applied is reported as `recorder.pathSource` |
| Records | up to **200 per session**, oldest settlements dropped first; up to 32 sessions, the least recently settled dropped first |
| Size | 200 records of realistic command lines ≈ **53 KB**; the worst case (every label at the 2000-character cap) ≈ 420 KB |
| Writes | immediately when the one-second window has elapsed; settlements inside the window are merged into **one trailing write** at its end, so the last batch always reaches the file even if the process dies. The write serializes the live ledger (a late timer cannot publish stale records), `dirty` is cleared only by a write that landed, and a failed write is retried behind a bounded backoff. Unloading flushes at once and cancels the timer; temp file then rename, so a crash cannot leave it half written |
| Reading it back | `dsh-job-stats/ledger/v2` keys by `key` and upgrades surviving v1 records; other schemas are ignored. A `.tmp` left by a kill between write and rename is recovered |
| Deleting it | Always safe: it is a record of settled jobs, and the next settlements rebuild it. |

**Recovering old Host memory**: before restart, back up the unfiltered `/dsh-job-stats/outcomes` with SHA-256 and Host PID/start time outside the repository. After upgrading and restarting, a one-time external script verifies the backup, first backs up the new ledger, checks 200/32 capacity and the 24 MiB bound, then stages it locally in the profile. The recorder imports and removes the staged file only after a successful durable write; there is **no permanent HTTP write API**. Reused `pwsh-1` ids stay separate across boots. An over-capacity import is rejected, never silently truncated.

### When something breaks

The Host route answers with an `outcomes` list and a `recorder` block: the ledger path and the rule that chose it, what the load did (read / ignored another schema / recovered from a temporary file), the persistence state (`dirty`, `pending`, `writes`, `failures`, `lastError`) and the subscription's health (`state`, `attempts`, `lastError`). The panel's side matches: outcomes polling keeps `lastOkAt`/`lastErrorAt`/`consecutiveFailures`/`lastStatusCode`/`lastError`, warns on the first failure and then **only when the count doubles**, and announces a recovery with its failure count; a roster stream that will not open is retried behind a bounded backoff and stops on unmount; the browser ledger writes its last batch after the window and flushes on `pagehide` or disposal. A gap can therefore be attributed to one link instead of failing silently again.

### Task summaries

The row's first line is a summary of what the task is doing, derived locally from its label (which for a shell job is the command itself): the panel splits the command into statements, skips setup (`cd …`, assignments, redirections) and recognisers the action — `git commit` → 提交代码, `pnpm install` → 安装依赖, `Start-Sleep -Seconds 75` → 等待 75 秒, `Get-Content` → 读取文件, a vitest run → 跑测试, and so on for git, package managers, interpreters, PowerShell cmdlets, containers and build tools.

Recognition is deliberately conservative in both directions: a command it does not understand is shown **as it is**, and a label that is already a description (some producers write one) is left alone — a wrong summary would be worse than the raw text. The exact command is always one click away, and it stays in the row's tooltip.

### Known limits

- The Host ledger records the settlements it witnessed; jobs that settled before the recorder row was ever loaded cannot be recovered (their outcome existed only in a process that is gone).
- **Before the Host half is composed** (no restart yet, or a composition without a web server), a collected command's outcome is not observable: its record is removed as soon as the call collected the output, often inside the coalescing window that would have reported the settlement. Those rows are shown as **已结束 / ended** — no success, no failure, no running — and the success-rate figure then covers reported outcomes only.
- An ended record still waiting for its outcome has its duration measured from its start to its last sighting (when the Host retired it, within a second or so).
- Two ledgers cooperate: the Host's durable one (200 per session, across restarts) and the tab's own browser-storage ledger (300 per session, so the rows you watched stay put even if the Host route is unreachable).
- The panel is read-only: stopping a job stays in the session header's job list.

## How it works

Two halves, no build step:

| File | Role |
|---|---|
| `package.json` | Manifest: `dsh.bundle.patch` (the composition patch) and `dsh.client` (the browser half, platform `web`) |
| `cordis.patch.yml` | Inserts two Loader rows: `job-stats` → the package (it publishes the browser half) and `job-stats-recorder` → its `./recorder` subpath (the Host half) |
| `lib/index.js` | Node half: a Loader-visible no-op; the browser half carries the UI |
| `lib/recorder.js` | Host half: records job outcomes off the registry's event stream and serves them on `/dsh-job-stats/outcomes` |
| `client/client.js` | Browser half: the tab type, its start-page card, and the panel |

Registrations, all through public contracts:

| Registration | Seat | Effect |
|---|---|---|
| `ctx.sidebarRightTabs.register({ id, kind: 'job-stats', title, guide })` | right Sidebar tab registry | the type, its tab-strip label, and the start-page card |
| `sidebar.right.pane.tab` (keyed by the type id) | dock pane (session scope) | the panel body; the session id arrives in its props |
| `sidebar.right.pane.tab.title` (keyed by the type id) | dock tab strip | the plugin's glyph before the type label |
| `ctx.jobs.events.subscribe({ owners: 'all' }, …)` (Host) | job registry event stream | terminal projections, including the settlements the roster never delivers to the browser |
| `ctx.webServer.register({ kind: 'exact', path: '/dsh-job-stats/outcomes' })` (Host) | Host routes | the JSON the panel reads its outcomes from |

Design rules the implementation follows:

- **No Harness Client package is imported.** React comes from the browser module table (`require('react')`) and the panel draws its own markup, so a rebuilt Host cannot blank the entry.
- **Theme tokens only** (`--dsw-*`, with literal fallbacks): light and dark themes come for free.
- **Optional-service scoping** — the whole contribution sits inside `ctx.inject(['sidebarRightTabs'], …)`, so a composition without the right Sidebar keeps the plugin inactive instead of throwing.
- **No side effects in the module factory**; registration and teardown are owned by `ctx.effect`, and disposal leaves the registry clean.

## Development

```bash
pnpm install
pnpm test        # 34 specs: manifest, tab-type + seat registration, panel behaviour, ledger
```

The specs are deliberately real rather than mocked: the browser half is loaded the way a page loads it (a classic script registering one lazy factory into `window.__ModuleLoader__`), the slot registry is the production `SlotCore` from `@deepseek-ai/dsh-client-ui-slots`, and the panel is rendered by real React with the props the renderer composes. A malformed manifest or a registration the shell cannot address therefore fails in CI, not in the running page.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the verification checklist used before a change ships.

## Compatibility

Verified on DeepSeek Harness **0.1.7-rc.2** (DSH Desktop, Windows 11, 125 % display scaling): the Loader row composes, the host serves the browser half with a matching revision, and the card and panel render in the right Sidebar.

## License

[MIT](LICENSE)
