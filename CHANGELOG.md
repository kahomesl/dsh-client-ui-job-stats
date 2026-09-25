# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.3] — 2026-09-26

### Fixed

- **The ledger now finds its own file, and a burst of settlements always reaches it.**
  - The path was resolved from `DSH_HOME`/`DSH_PROFILE` alone, and the Desktop host process exports **neither**: `storePath()` returned `undefined`, so 1.4.0's "durable" ledger was silently memory-only in the very deployment it was written for. Every restart began empty and the panel's own browser storage was the only history left — which is how a stretch of records can vanish while the Host still knows about them. The path is now resolved from the facts the host actually has, most specific first: `DSH_PROFILE_DIR`, then `DSH_HOME`/`DSH_PROFILE`, then **the profile directory the launcher passes on argv** (`dsh-desktop-host` always passes it), then the harness home (`$DSH_HOME`, or `~/.dsh` — the framework's own default). The rule that applied is reported as `recorder.pathSource`.
  - Writes were a dropping throttle with no trailing flush: settlements inside the one-second window stayed in memory until a disposer ran, so a crash, a kill or an abnormal shutdown lost them for good — "records fine, then a gap, then fine again". The recorder now keeps `dirty`, `lastWrittenAt` and one timer, merges a burst into one immediate write plus one trailing write at the end of the window, serializes the live ledger (a late timer cannot publish stale records), clears `dirty` only after a write that landed, and retries a failed write behind a bounded backoff. Unloading flushes at once and cancels the timer.
  - The file is read only when its `schema` marker matches, and a temporary file left by a kill between write and rename is promoted when the ledger itself is missing.

- **A failure on any link is visible instead of silent.**
  - The event subscription is retried behind an exponential backoff instead of leaving the row roster-only forever after one failed `subscribe`, and its state (`subscribed`/`retrying`, attempts, last error) is reported.
  - The route carries a `recorder` block — path and the rule that chose it, load note, persistence state (`dirty`, `pending`, `writes`, `failures`, `lastError`), subscription health — so a panel that sees an empty ledger can tell "nothing settled" from "this row is broken".
  - The browser half matches it: outcomes polling records `lastOkAt`/`lastErrorAt`/`consecutiveFailures`/`lastStatusCode`/`lastError`, warns on the first failure and then only on every doubling, and announces a recovery with its failure count; a roster stream that will not open is retried behind a bounded backoff and stops on unmount; the browser ledger publishes its last batch after the window and flushes on `pagehide` or disposal. Polling failures also distinguish a missing route (HTTP status) from an unreadable body and a lost connection.

### Tests

- Ten new specs (84 in total): a trailing flush for a burst the window swallowed, an immediate flush on dispose, a late timer that cannot overwrite newer records, a failed write that stays dirty and lands on retry, a burst that survives a simulated ungraceful restart, all four path-resolution rules including the Desktop argv shape, schema rejection, temporary-file recovery, the health block, subscription retry with one warning per doubling, polling recovery with its quiet-outage rule, roster-watch recovery, and the ledger flush on `pagehide`.
- Recorder specs neutralise `DSH_PROFILE_DIR` in addition to pinning `DSH_HOME`/`DSH_PROFILE`, so a harness that exports it cannot write into a real profile's ledger.

### Notes

- This replaces 1.4.0's note that "without `DSH_HOME`/`DSH_PROFILE` nothing is written at all": the ledger is written in every deployment now. A deployment that names no profile at all shares one ledger across the harness home, which the route reports as `pathSource: harness home`.

## [1.4.2] — 2026-09-25

### Docs

- The repository's main README is now Chinese (`README.md`), with the English text kept as `README.en.md`; the two link to each other at the top. Code comments, `CONTRIBUTING.md` and this changelog stay English, and the plugin-list entry keeps its required English description.

## [1.4.1] — 2026-09-25

### Docs

- The README's screenshot is replaced by two current ones — the panel, and a task row expanded to its full command — and both are declared in `screenshots.json`, the file storefronts read.
- They are generated, not pasted: `pnpm preview` bundles a page, mounts `client/client.js` — the same file the Host serves — with the props the renderer composes and the app's dark-theme token values, renders representative job rows in a headless Chromium, and writes `docs/screenshot-*.png`. A UI change can therefore refresh the screenshots in the same commit, and the provenance of the images lives in the repository rather than in somebody's clipboard.

## [1.4.0] — 2026-09-25

### Added

- **The Host ledger is durable.** The recorder kept its settled records in process memory only, so a restart lost them and a panel could not show what the previous run did. They are now written to `<DSH_HOME>/profiles/<profile>/.job-stats/ledger.json` (temp file then rename, at most one write a second, plus a flush when the row unloads) and read back at load, so a panel opened after a restart still shows each session's settled jobs with their real outcomes.
- **Bounds, as requested**: up to **200 settled records per session** (oldest settlements dropped first) and up to 32 sessions (the least recently settled dropped first), with each label truncated at 2000 characters. Measured: 200 records of realistic command lines ≈ 53 KB; the worst case ≈ 420 KB.

### Notes

- The file is a cache of settled jobs: deleting it at any time is safe, and a missing or corrupt one starts empty instead of refusing to boot. Without `DSH_HOME`/`DSH_PROFILE` in the environment nothing is written at all — the ledger stays in memory.
- Specs now run against a throwaway `DSH_HOME`, because the ledger resolves its path from the environment: a spec that forgot this wrote into the real profile's ledger.

## [1.3.0] — 2026-09-25

### Added

- **Plain-language summaries.** A row's first line now says what the task is doing instead of quoting the command: the panel splits the label into statements, skips setup (`cd …`, assignments, pipelines' input stages, `2>&1` redirections) and recognises the action — `git commit` → 提交代码, `pnpm install` → 安装依赖, `Start-Sleep -Seconds 75` → 等待 75 秒, `Get-Content` → 读取文件, a vitest run → 跑测试, plus interpreters, PowerShell cmdlets, containers and build tools. Recognition covers the shapes a tool script actually produces, including a program held in a variable (`& $node $pnpm install …` → 安装依赖).
- **Detail on demand.** Every row is a button: clicking it expands the full command, job id, kind, status, start and finish clock, terminal reason and retained output. The exact command also stays in the row's tooltip, and the one small stylesheet inline styles cannot express (hover, focus ring, detail separator) is installed once per document and removed on disposal.

### Notes

- Recognition is conservative both ways: an unrecognised command is shown as it is, and a label that is already a description is left alone — a wrong summary would be worse than the raw text. 20 command shapes are pinned by spec, plus the three that must stay unsummarised.
- The model's own one-line `description` argument never reaches the job record: `dsh-tool-pwsh` and `dsh-tool-bash` register `label: args.command`, so the panel derives its summary locally instead of reading a field that is not there.

## [1.2.1] — 2026-09-25

### Fixed

- **The detail list scrolls again.** The dock hands a tab body a fixed-height flex column with `overflow: hidden`, and the panel's own list block (also `overflow: hidden`, and free to shrink) absorbed the shortfall: it clipped its rows and left the wheel nothing to move. The panel body now keeps `min-height: 0`, the metrics and figures are `flex: none`, and the row list is the scroll region (`flex: 1 1 auto; min-height: 0; overflow-y: auto`) — so the head stays put and every task is reachable by scrolling.

### Changed

- A row whose outcome is unknown reads **已结束 / ended** and nothing more: the previous *outcome not reported* suffix said the same thing twice on every such row. The success-rate tooltip still explains that it counts reported outcomes only.

## [1.2.0] — 2026-09-25

### Added

- **Host-side outcome recorder** (`lib/recorder.js`, its own Loader row `job-stats-recorder` → the package's `./recorder` subpath). A collected command's settlement never reaches the browser: the Host removes the record as soon as the call that started it collected the output, frequently inside the coalescing window that would have reported it. The registry's event stream does carry that projection, and it is emitted before any removal — so the recorder subscribes to `ctx.jobs.events` (`{ owners: 'all' }`), keeps a bounded ring of the last 2000 terminal records per session, and serves them on `GET /dsh-job-stats/outcomes` (`?sessionId=` filters, unowned jobs are shared).
- The panel now polls that route document-relatively (`document.baseURI`, the pattern the shipped market UI uses) and merges what it reports: a row the roster abandoned becomes a real 已完成 / 已失败 / 已取消 with its terminal reason, and a job the tab never saw while it ran is added with its outcome. A 404/405/unreachable route leaves the panel on its own ledger.
- `lib/index.js` and the recorder are two rows on purpose: a bundle-patch row must be the bare package specifier for client-modules to publish the browser half, and a subpath specifier is invisible to that scanner — so the two rows cannot claim the same browser module.

### Notes

- **A restart is required once per install**: Loader rows from a bundle patch are composed at boot, and Host modules are imported once (a running Host does not pick up a brand-new row on a recompose — verified on 0.1.7-rc.2). Until then the panel behaves exactly as in 1.1.0.

## [1.1.0] — 2026-09-25

### Fixed

- **A collected command no longer stays "running" forever.** The Host removes a foreground command's record as soon as the call that started it collected the output — frequently inside the same coalescing window that would have reported its settlement — so no roster frame ever carried the outcome. The panel recorded the last thing it saw (`running`) and kept it. Such a record is now projected as **已结束 / ended** with the detail *outcome not reported*: it is over, it is no longer counted as running, and the panel does not claim success or failure it cannot know.
- **Long commands no longer report a 0-second duration.** A running record's clock is now refreshed while the roster still lists it, instead of being frozen at the last lifecycle frame (which for a 30-second command was its own start).
- A record hydrated from browser storage that claims to still be running is dropped: it has no stream behind it any more, and the roster re-supplies it while the job is genuinely alive.

### Added

- A sixth card, **已结束 / Ended**, so the status cards still add up to the accumulated total. The success-rate figure counts reported outcomes only and carries a tooltip saying so.

### Changed

- The ledger's browser-storage key moved to `dsh-job-stats/v2/`: the records written by 1.0.0 carry the stuck `running` status this release fixes, so the panel starts from a clean ledger rather than showing them as zero-second ended rows.

## [1.0.0] — 2026-09-25

First public release.

### Added

- **Right Sidebar tab type `job-stats`** — the column's start page gains a *Background job stats* card next to the shipped 工作区文件 / 新建终端 / 浏览器 types; picking it opens the statistics panel as a dock tab, keyed by the session it was opened in.
- **Panel** — totals per status (合计 / 运行中 / 已完成 / 已失败 / 已取消), success rate, accumulated duration, longest single job, retained output, and a per-task list (status, kind, duration, terminal reason), live-first then newest-settled-first.
- **Accumulation ledger** — every roster frame is merged by job id into a per-session ledger, so a task stays in the statistics after the host removes its record (which is what a foreground command does once its call collected the output). Persisted under `dsh-job-stats/v1/<sessionId>` in browser storage, capped at 300 records per session.
- **Bilingual copy** — Simplified Chinese (source of truth) and English dictionaries with identical key sets, resolved through the client locale service.
- **Tests** — 34 vitest specs covering the manifest and bundle contract, tab-type and seat registration against the production `SlotCore`, panel rendering with real React, and the ledger behaviour (retention after removal, in-place updates, frozen clocks, per-session isolation, hydration, corrupt storage).
- **CI** — GitHub Actions workflow running the suite on every push and pull request.

### Notes

- The browser half imports no Harness Client package; it requires only `react` from the browser module table and styles itself with host theme tokens (`--dsw-*`) plus literal fallbacks.
- The whole contribution is scoped inside `ctx.inject(['sidebarRightTabs'], …)`: a composition without the right Sidebar leaves the plugin inactive instead of failing activation.
- An earlier internal revision also contributed a left-rail entry with a wide main-area page. It was removed in favour of the dock-only seat, which is where the feature belongs.
