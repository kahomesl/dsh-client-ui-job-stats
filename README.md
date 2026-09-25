# dsh-client-ui-job-stats

[![CI](https://github.com/kahomesl/dsh-client-ui-job-stats/actions/workflows/ci.yml/badge.svg)](https://github.com/kahomesl/dsh-client-ui-job-stats/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.7--rc.2-informational)

**Session background-job statistics for DeepSeek Harness: a right Sidebar tab that keeps a running ledger of every job the session ran.**

中文说明见 [README.zh.md](README.zh.md).

![The job-statistics panel in the right Sidebar](docs/preview.png)

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
| Counts | 合计 / 运行中 / 已完成 / 已失败 / 已取消 (total / running / completed / failed / cancelled) |
| Figures | success rate (completed ÷ settled), accumulated duration, longest single job, retained output bytes |
| Detail list | one row per task: status dot, command label, kind · status · reason, elapsed time |
| Live clock | running jobs tick once a second while the tab is open |
| Ledger | per-session, merged by job id, persisted in browser storage (300 records, oldest settled evicted first) |
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

3. Expand the right Sidebar — the **Background job stats** card is on its start page. The host re-reads a changed client bundle on its own, so no restart is needed.

`cordis.patch.yml` in this package inserts the Loader row (`job-stats` → `dsh-client-ui-job-stats`); nothing else in the profile is touched.

**Disable / uninstall** — remove the name from `dsh.profile.bundles` to switch it off (keep the dependency to switch it back on), or remove both entries and run `pnpm install` again to uninstall.

**Requires** `@deepseek-ai/dsh-client-ui-sidebar-right` and `@deepseek-ai/dsh-api-job-controller` in the composition. Without them the plugin simply stays inactive — it never fails activation.

## How the numbers are computed

The panel reads `ctx.jobs`, the client mirror of the job roster (`@deepseek-ai/dsh-api-job-controller`), and adds a ledger on top:

1. While the tab is mounted it holds the session's roster stream open (`ctx.jobs.watchRows(sessionId)`); the stream's first frame is already the whole truth.
2. Every frame is merged into a per-session ledger keyed by job id — status, duration, terminal reason and retained bytes are updated in place, so a job never appears twice.
3. Statistics and the list are computed from the ledger, which is why a finished task stays after the host removes its record. The ledger is persisted under `dsh-job-stats/v1/<sessionId>` in browser storage (throttled writes; a full or unreadable store degrades to memory only).

### Known limits

- The ledger records what the tab saw **while it was open**. A job that starts and ends entirely while the tab is closed is not replayed by the roster, so it cannot be counted.
- A record that is still marked running but has left the roster has its clock frozen at the last sighting (its duration stops rather than growing forever), and keeps its last known status.
- The ledger is capped at 300 records per session; the oldest settled records are evicted first.
- The panel is read-only: stopping a job stays in the session header's job list.

## How it works

Two halves, no build step:

| File | Role |
|---|---|
| `package.json` | Manifest: `dsh.bundle.patch` (the composition patch) and `dsh.client` (the browser half, platform `web`) |
| `cordis.patch.yml` | Inserts one Loader row: `job-stats` → `dsh-client-ui-job-stats` |
| `lib/index.js` | Node half: a Loader-visible no-op; the feature lives in the browser |
| `client/client.js` | Browser half: the tab type, its start-page card, and the panel |

Registrations, all through public contracts:

| Registration | Seat | Effect |
|---|---|---|
| `ctx.sidebarRightTabs.register({ id, kind: 'job-stats', title, guide })` | right Sidebar tab registry | the type, its tab-strip label, and the start-page card |
| `sidebar.right.pane.tab` (keyed by the type id) | dock pane (session scope) | the panel body; the session id arrives in its props |
| `sidebar.right.pane.tab.title` (keyed by the type id) | dock tab strip | the plugin's glyph before the type label |

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
