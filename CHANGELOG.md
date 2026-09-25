# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
