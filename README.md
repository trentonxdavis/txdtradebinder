# Trent's One Piece Trade Binder

A digital trade binder for a One Piece Card Game collection — full card art, rarity-coded badges, quantity owned, and TCGplayer market prices, kept fresh automatically, browsable and searchable in the format of a physical binder.

## Features

- **Live pricing** — a scheduled GitHub Action refreshes card names, art, rarity, and market prices from TCGplayer's public catalog/pricing data (via [tcgcsv.com](https://tcgcsv.com)) daily, and instantly whenever you edit your collection. No manual re-export.
- **Card grid** — every card rendered with full art, a rarity-colored badge, quantity owned, and current price
- **Detail view** — click any card to open a modal with a direct link to its live TCGplayer listing
- **Search** — filter by name, set, or card number as you type
- **Filters** — narrow the binder by set or rarity via custom dropdowns
- **Sort** — price (high/low), name, set, or quantity owned
- **Light/dark theme** — leather-and-parchment look in both modes, toggled via the header button
- **Summary stats** — total est. market value, unique cards, total copies, and sets represented

## Stack

Plain HTML/CSS/JS on the front end — no build step, no framework, no client-side dependencies. Pricing is refreshed server-side by a small Python script running on GitHub Actions, since TCGplayer's data mirror doesn't allow being called directly from browser JavaScript (no CORS headers) — the page itself only ever reads a same-origin JSON file.

## Structure

```
index.html                          Page markup, layout, controls
css/style.css                       Theme, layout, and component styles
js/app.js                           Renders cards.json — filtering/sorting, search, dropdowns, modal
collection.json                     The cards you own — the only file you edit
cards.json                          Generated. Merged card + live price data the page actually reads
scripts/fetch_prices.py             Fetches tcgcsv.com and regenerates cards.json
.github/workflows/refresh-prices.yml  Runs the script daily, and on every collection.json change
```

## Running locally

Static files only — serve the directory with anything that can host static assets, e.g.:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. (`cards.json` must already exist — see below if you need to generate it locally.)

## Adding or removing cards

Edit `collection.json` directly (in GitHub's web editor, or locally) — it only needs four fields per card:

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

To add a card: find it on TCGplayer, copy its product ID and set name, add an entry, commit. To remove one: delete its entry. Pushing the change to `collection.json` triggers the Action automatically — name, card number, rarity, art, and price are all looked up and committed to `cards.json` for you within a minute or two, and the live site picks it up on next load.

## How the price refresh works

`scripts/fetch_prices.py`, run by `.github/workflows/refresh-prices.yml`:

1. Reads `collection.json`
2. Looks up the One Piece Card Game category and the matching set (group) IDs on tcgcsv.com
3. Fetches each set's product and pricing data
4. Merges it with your `collection.json` entries and writes `cards.json`
5. Commits `cards.json` back to the repo if anything changed

The workflow runs daily (06:17 UTC) and on every push that touches `collection.json`. You can also trigger it manually from the Actions tab.

To regenerate `cards.json` locally: `python3 scripts/fetch_prices.py` (requires network access to tcgcsv.com).
