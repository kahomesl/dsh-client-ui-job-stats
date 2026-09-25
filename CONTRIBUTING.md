# Contributing

Thanks for taking a look. This is a small plugin, so the process is short — the
bar is evidence, not ceremony.

## Getting set up

```bash
git clone https://github.com/kahomesl/dsh-client-ui-job-stats.git
cd dsh-client-ui-job-stats
pnpm install
pnpm test
```

There is no build step: `client/client.js` is shipped as authored JavaScript, and
the Host loads it as a classic script. `pnpm test` runs the vitest suite against
the production slot registry and real React.

To try a change inside a running Harness, install the checkout into a profile
(see the README) and edit the two source files in place — the Host re-derives a
client bundle's revision from the file's metadata and re-reads it on its own, so
no restart is needed.

## What a change must keep true

These are the invariants the test suite exists to protect:

1. **The manifest stays addressable.** `dsh.client.platform` is `web`, the
   `./client` export resolves, `<package>/package.json` is exported (that is how
   the Host locates the row's manifest), and `cordis.patch.yml` inserts exactly
   one row whose `name` is this package's name.
2. **Registrations are public-contract shaped.** The tab type goes through
   `ctx.sidebarRightTabs.register`; the panel and its strip title register under
   `sidebar.right.pane.tab` and `sidebar.right.pane.tab.title`, keyed by the type
   id. Nothing claims a seat it does not own, and disposal leaves the registry
   empty.
3. **No Harness Client package is imported.** Only `react` comes from the browser
   module table. Host packages change without notice and a throwing component
   blanks the entry; the panel draws its own markup instead.
4. **Styling is theme tokens.** `--dsw-*` with literal fallbacks, so both themes
   work and a renamed token degrades rather than breaks.
5. **The factory has no side effects.** Registration, timers, listeners and
   storage live in `ctx.effect` / component effects and are released on teardown.
6. **The panel never throws.** Unknown statuses, missing ids, forged fields, a
   roster stream that refuses to open and an unreadable ledger all degrade to a
   readable panel with an explanatory empty state.

## The verification checklist

Before a change is considered done, on a machine with a Harness installation:

| Step | Command / action | Expected |
|---|---|---|
| Specs | `pnpm test` | all specs pass |
| Syntax | `node --check client/client.js` | exit 0 |
| Composition | `ds h`-side check: the package composes as a bundle and the client half is served | the row appears in the boot graph with a matching revision |
| Live | expand the right Sidebar, open the card | the panel renders the session's statistics |
| No regressions | desktop/browser console and the Host's crash logs | no new entry-activation or render errors |

Report which steps you ran and what you saw. "It should work" is not a result.

## Style

- Plain JavaScript, two-space indent, single quotes, trailing commas in
  multi-line literals — the file is already consistent, keep it that way.
- Comments explain *why* (which contract, which failure mode), not *what*.
- Keep the Chinese dictionary the key-set source of truth; keep the English
  dictionary key-identical (a spec asserts this).
- Add or extend a spec for every behaviour change. A regression that is not
  pinned by a spec will come back.

## Pull requests

- One concern per pull request, with the verification table above filled in.
- Mention the Harness build you tested against and how you exercised it.
- Screenshots are welcome for visual changes; note the theme and display scaling.
