# The Trade Binder — One Piece TCG

A digital trade binder for a One Piece Card Game collection — full card art, rarity-coded badges, quantity owned, and TCGplayer market prices fetched live on every page load, browsable and searchable in the format of a physical binder.

## Features

- **Live pricing** — on every load, the page resolves each card's current name, art, rarity, and market price directly from TCGplayer's public catalog/pricing data (via [tcgcsv.com](https://tcgcsv.com)). No stale snapshot to keep in sync.
- **Card grid** — every card rendered with full art, a rarity-colored badge, quantity owned, and current price
- **Detail view** — click any card to open a modal with a direct link to its live TCGplayer listing
- **Search** — filter by name, set, or card number as you type
- **Filters** — narrow the binder by set or rarity via custom dropdowns
- **Sort** — price (high/low), name, set, or quantity owned
- **Light/dark theme** — bright sea-and-sun palette in both modes, toggled via the header button
- **Summary stats** — total est. market value, unique cards, total copies, and sets represented (all computed live)

## Stack

Plain HTML/CSS/JS — no build step, no framework, no client-side dependencies beyond `fetch`. `collection.json` is the only thing you maintain; `js/app.js` resolves everything else client-side at load time.

TCGplayer's data mirror (tcgcsv.com) doesn't send CORS headers, so a browser can't call it directly from a page hosted elsewhere. `cloudflare-worker/` is a tiny (~15 line) Cloudflare Worker that sits in front of it purely to add that missing header — it doesn't transform or cache anything meaningful beyond a 5-minute edge cache. It's deployed separately from this repo (see below); nothing here builds or ships it automatically.

## Structure

```
index.html                    Page markup, layout, controls
css/style.css                  Theme, layout, and component styles
js/app.js                      Live data fetching, filtering/sorting, search, custom dropdowns, modal
collection.json                The cards you own
scripts/import_collection.py   Rebuilds collection.json from a TCGplayer app CSV export
cloudflare-worker/             Source for the CORS proxy in front of tcgcsv.com (deployed separately)
```

## Running locally

Static files only — serve the directory with anything that can host static assets, e.g.:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Adding or removing cards

`collection.json` only needs four fields per card:

```json
{
  "productId": 672772,
  "set": "Extra Booster: One Piece Heroines Edition",
  "printing": "Foil",
  "qty": 2
}
```

- `productId` — the numeric ID in the card's TCGplayer URL, e.g. `tcgplayer.com/product/672772/...` → `672772`
- `set` — the exact TCGplayer set/group name (must match TCGplayer's naming to resolve correctly)
- `printing` — `"Normal"` or `"Foil"`, matching the listing you want priced
- `qty` — how many copies you own

Name, card number, rarity, art, and price are all looked up automatically on every page load — nothing else to fill in, and nothing else to keep updated.

### From the TCGplayer app (recommended)

The TCGplayer app's collection export is the actual source of truth here — scan your cards in the app, then:

1. Export/share your collection as a CSV from the app
2. Run: `python3 scripts/import_collection.py path/to/export.csv`
3. Commit and push the resulting `collection.json`

The export is treated as your *entire* current collection, not a delta — `collection.json` is rebuilt from scratch each run, so a card you've removed from the app (sold, traded away) just drops out on the next import. No manual add/remove editing needed once you're scanning through the app.

### Manually

For a one-off addition without a fresh app export: find the card on TCGplayer, copy its product ID and set name from the URL, and add an entry directly to `collection.json`. To remove one, delete its entry.

## How live pricing works

On each page load, `js/app.js`:

1. Fetches `collection.json`
2. Looks up the One Piece Card Game category and the matching set (group) IDs via the Cloudflare Worker proxy in front of tcgcsv.com
3. Fetches that set's product and pricing data
4. Merges it with your `collection.json` entries into the cards rendered on the page

If the proxy or tcgcsv.com is unreachable, the page shows an error state rather than falling back to stale numbers — refresh to retry.

## Redeploying the CORS proxy

The live Worker URL is hardcoded in `js/app.js` (`TCGCSV_BASE`). If it ever needs to move or be redeployed:

```bash
cd cloudflare-worker
npx wrangler login
npx wrangler deploy
```

This prints the Worker's `*.workers.dev` URL — update `TCGCSV_BASE` in `js/app.js` if it changes.
