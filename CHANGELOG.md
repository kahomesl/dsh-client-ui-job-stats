# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
