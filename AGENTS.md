# AGENTS.md

Guidance for AI agents working on this repo. Read this before making changes — several design decisions here look wrong until you know the history behind them, and re-litigating them wastes time (some of it already cost real debugging effort once).

## What this is

A static single-page site: a personal One Piece Card Game trade binder. Card grid with art, rarity badges, search/filter/sort, a detail modal linking to TCGplayer, light/dark theme. Deployed on GitHub Pages at `https://trentonxdavis.github.io/txdtradebinder/`.

The entire point of the project is that pricing is **live** — resolved in the visitor's browser on every page load, not a snapshot baked in at some earlier time. That constraint shaped almost every non-obvious decision below.

## Repo layout

```
index.html                    Markup, layout, controls, modal shell
css/style.css                  All styling (CSS custom properties for theming)
js/app.js                      Everything: data fetching, filter/sort/search, rendering, modal
collection.json                The cards owned — the only data file a human edits
scripts/import_collection.py   Converts a TCGplayer app CSV export into collection.json
cloudflare-worker/             Source for a small CORS proxy (deployed separately, see below)
assets/favicon.png             Also used as the header logo — same file, two <link>/<img> uses
README.md                      User-facing docs (setup, adding cards, architecture)
```

No `data.json` or `cards.json` should exist in this repo. If you find one, someone (possibly a past version of you) reintroduced a static-snapshot pattern that was deliberately removed twice. See "Architecture history" below before repeating that.

## Architecture

`collection.json` holds only what a human actually knows per card:

```json
{ "productId": 672772, "set": "Extra Booster: One Piece Heroines Edition", "printing": "Foil", "qty": 2 }
```

`productId` is TCGplayer's **product ID** (the number in `tcgplayer.com/product/{id}/...` and in the CDN image URL `tcgplayer-cdn.tcgplayer.com/product/{id}_in_400x400.jpg`) — **not** the "TCGplayer Id" column you'll see in TCGplayer app CSV exports, which is a different, SKU-level identifier. Getting these two confused is the most likely importer bug you'd introduce.

On every page load, `js/app.js`:
1. Fetches `collection.json`
2. Fetches tcgcsv.com's category list (through the proxy — see below), finds "One Piece Card Game", gets its `categoryId`
3. Fetches that category's groups (= TCGplayer's term for sets), matches by name against each `collection.json` entry's `set` field, to get each needed `groupId`
4. For each unique group, fetches products + prices
5. Merges: for each `collection.json` entry, looks up its product by `productId` and its price by `(productId, printing)`, builds the final card object (name, art, rarity, number, price, tcgUrl), computes stats, renders

If any step fails (proxy down, tcgcsv.com down, network issue), the page shows an explicit error state rather than falling back to stale data. That's intentional — there is no cached fallback to fall back to.

### The CORS proxy — read this before touching pricing code

**tcgcsv.com (the public TCGplayer catalog/pricing mirror this site depends on) sends no `Access-Control-Allow-Origin` header.** A browser on `trentonxdavis.github.io` cannot call it directly — the request goes out, tcgcsv.com answers correctly, and the browser silently discards the response before JS ever sees it. This isn't visible in most testing because:
- `curl`/server-side requests aren't subject to CORS at all (curling tcgcsv.com "works fine")
- Sandboxed test harnesses that mock `fetch()` responses (e.g. Playwright `page.route()`) don't enforce CORS either, so mocked tests pass even against a real CORS bug

The actual failure only shows up in a **real browser hitting the real endpoint**, which is exactly what burned significant time in this project's history (see below). If you're debugging "pricing works in my test but not on the live site," CORS is the first thing to check — see whether the failing request is same-origin or cross-origin, and check the response headers on the failing request specifically, not just whether the endpoint returns 200 somewhere else.

The fix in place: `https://txdtradebinder-proxy.txdavis.workers.dev` is a Cloudflare Worker (source in `cloudflare-worker/`) that proxies `tcgcsv.com` 1:1 and adds `Access-Control-Allow-Origin: *`. `js/app.js`'s `TCGCSV_BASE` constant points at it instead of at tcgcsv.com directly. It is **deployed independently of this repo** — there is no CI step that builds or ships it. If it ever needs to move:
```bash
cd cloudflare-worker
npx wrangler login
npx wrangler deploy
```
...then update `TCGCSV_BASE` in `js/app.js` to match the printed URL. The Worker itself is trivial (~15 lines, no build step, no dependencies) — don't add caching, retries, or logic to it beyond what's there unless there's a concrete reason.

### Rarity codes

tcgcsv.com's product `extendedData` returns One Piece TCG rarities as **short codes**, not full names: `SR`, `SEC`, `L`, `C`, `R`, `P`/`PR`, `SP`, `DON!!`. The CSS rarity badge styling and the general UI expect full names (`Super Rare`, `Secret Rare`, etc.). `js/app.js` has a `RARITY_NAMES` map near the top that translates known codes; if TCGplayer adds a new rarity tier and a card shows an unstyled/oddly-cased badge, that's the first place to look — add the missing code to the map rather than guessing at a broader fix.

### GitHub Pages / branch setup

There is no `main` branch in this repo. The working branch (`claude/repository-push-5c1nqs` at time of writing — check `git branch --show-current` / `git remote show origin`, don't assume) **is** the default branch, and GitHub Pages is configured (Settings → Pages, done manually in the dashboard, not in-repo) to deploy from it at the repo root. If you create a new default branch or rename this one, Pages settings need updating too — that's a manual dashboard action no agent can currently do via available tooling (see "Tooling constraints" below).

## Updating the collection

Two paths, both converge on committing a new `collection.json`:

1. **From a TCGplayer app export (primary workflow)**: the user scans cards in the TCGplayer mobile app, exports/shares a CSV, sends it to whichever agent is on duty (or runs it themselves). Run `python3 scripts/import_collection.py path/to/export.csv`. **This export is treated as the user's entire current collection, not a delta** — the script fully replaces `collection.json` each run. A card that's disappeared from the latest export (sold, traded away) is expected to disappear from the site; don't try to "merge" or preserve entries not present in a fresh export unless the user specifically says the export was partial.

   Two column-naming gotchas already discovered in real exports, both handled in the script already — don't re-break them:
   - Use the **`Product ID`** column, not `TCGplayer Id` (see productId note above)
   - Quantity is read from `Total Quantity` if populated, else `Add to Quantity` — in every real export seen so far, `Total Quantity` has been blank and the real value is in `Add to Quantity`

2. **Manual single-card edit**: for a one-off addition without a fresh export, add an entry directly to `collection.json` (four fields, shown above). Fine for small edits; don't hand-build a large collection this way when a CSV import is available.

After either path, commit and push `collection.json` — nothing else needs regenerating, since pricing/art/rarity are resolved live at request time, not at commit time.

## Style / theme system

`css/style.css` is entirely driven by CSS custom properties defined once in `:root`/`[data-theme='light']` and `[data-theme='dark']` blocks at the top of the file — colors, shadows, everything. To retheme, change the variables, not the individual rules scattered through the file. The current palette is a bright "sea and sun" One Piece look (sky-blue gradient background, Jolly Roger red as primary accent, straw-hat gold for rarity badges) — this was a deliberate, requested redesign away from an earlier "aged leather trade binder" look; don't revert it without being asked.

The `.custom-select` components (set/rarity/sort dropdowns) are hand-built listboxes, not native `<select>` — this was deliberate, because native `<select>` popups didn't reliably register clicks in an earlier embedded-preview environment this project passed through. Keep that pattern; don't "simplify" it back to a native select without checking whether that constraint still applies.

## JS conventions

`js/app.js` is a single IIFE, `'use strict'`, ES5-leaning style (`var`, not `let`/`const`; `function` expressions, not arrow functions) — match this rather than mixing styles. No build step, no bundler, no npm dependencies on the site itself (the Cloudflare Worker's `wrangler` tooling is separate and only touches `cloudflare-worker/`). Keep it that way unless there's a real reason to add a build step — the entire design philosophy here is "static files, zero moving parts beyond the one CORS proxy that's structurally unavoidable."

## Tooling constraints worth knowing up front

- Many sandboxed agent environments (this one included, at time of writing) have outbound network policies that block arbitrary external domains — including tcgcsv.com, api.cloudflare.com, and even things like Pinterest. `curl`/`WebFetch` failing with a 403/tunnel error against an external site doesn't mean the site is down; check whether it's a sandbox policy issue (e.g. inspect the proxy's status/diagnostic endpoint if one is documented in your environment) before concluding a bug lives elsewhere.
- GitHub Actions on this repo works for triggered/scheduled CI (confirmed working — used during an earlier architecture iteration, see history below) and does have real outbound internet access, unlike some agent sandboxes. It's a legitimate way to test connectivity to something your own sandbox can't reach, if you genuinely need to.
- The user has a personal Linux box reachable via Tailscale SSH from a Termux session on their phone, with `git`, `node`/`npm`, and `python3` available. For anything requiring a real browser-based OAuth flow (e.g. `wrangler login`) or that must run somewhere with unrestricted network and persistent credentials, that's the practical option — not something to expect an agent sandbox to do itself.
- Don't ask the user to paste API tokens/secrets into chat without a real plan to use them; if your own environment can't reach the service the token is for, say so before they generate one (this happened once already — a Cloudflare API token was generated and shared, then turned out unusable from the sandbox, so the Cloudflare Worker was deployed via the user's own terminal instead).

## Architecture history (context for "why is it built this way")

Skip this unless you're confused about a decision — it's here so you don't redo work that's already been tried and superseded:

1. **v1**: static `data.json`, fully precomputed, one-time export from a CSV via an earlier tool. No live pricing.
2. **v2**: replaced with `collection.json` (minimal) + client-side `fetch()` straight to tcgcsv.com on page load. Looked correct in mocked tests. **Failed silently in real browsers** — this is the CORS issue described above; it took a live-user screenshot and a manual `curl` from the user's own browser to actually diagnose, since the agent sandbox couldn't reproduce the failure (mocked tests don't enforce CORS, and the sandbox couldn't reach tcgcsv.com directly to check headers either).
3. **v3**: worked around CORS by moving the tcgcsv.com call server-side — a GitHub Action (`fetch_prices.py` + a workflow) ran periodically, committing a generated `cards.json` that the page read same-origin. This worked, but was only ever a workaround: pricing was only as fresh as the last scheduled run (up to ~24h), not truly live.
4. **v4 (current)**: the user deployed a Cloudflare Worker as a CORS proxy, removing the actual blocker. Reverted to the v2 approach (client-side live fetch on every load), just pointed at the Worker instead of tcgcsv.com directly. `fetch_prices.py`, the workflow, and `cards.json` were all removed as redundant. This is the intended end state — don't reintroduce the GitHub Action pricing-refresh pattern unless the Worker becomes unavailable and the user explicitly wants to fall back to periodic-refresh instead of fixing the proxy.
