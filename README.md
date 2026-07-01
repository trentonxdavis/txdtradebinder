# Trent's One Piece Trade Binder

A digital trade binder for a One Piece Card Game collection — full card art, rarity-coded badges, quantity owned, and TCGplayer market prices fetched live on every page load, browsable and searchable in the format of a physical binder.

## Features

- **Live pricing** — on every load, the page resolves each card's current name, art, rarity, and market price directly from TCGplayer's public catalog/pricing data (via [tcgcsv.com](https://tcgcsv.com)). No stale snapshot to keep in sync.
- **Card grid** — every card rendered with full art, a rarity-colored badge, quantity owned, and current price
- **Detail view** — click any card to open a modal with a direct link to its live TCGplayer listing
- **Search** — filter by name, set, or card number as you type
- **Filters** — narrow the binder by set or rarity via custom dropdowns
- **Sort** — price (high/low), name, set, or quantity owned
- **Light/dark theme** — leather-and-parchment look in both modes, toggled via the header button
- **Summary stats** — total est. market value, unique cards, total copies, and sets represented (all computed live)

## Stack

Plain HTML/CSS/JS — no build step, no framework, no dependencies, no backend. `collection.json` is the only thing you maintain; `js/app.js` resolves the rest client-side from tcgcsv.com at load time.

## Structure

```
index.html       Page markup, layout, controls
css/style.css     Theme, layout, and component styles
js/app.js         Live data fetching, filtering/sorting, search, custom dropdowns, modal
collection.json   The cards you own — the only file you edit
```

## Running locally

Static files only — serve the directory with anything that can host static assets, e.g.:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

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

To add a card: find it on TCGplayer, copy its product ID and set name, add an entry, save. To remove one: delete its entry. Name, card number, rarity, art, and price are all looked up automatically — nothing else to fill in, and nothing else to keep updated.

## How live pricing works

On each page load, `js/app.js`:

1. Fetches `collection.json`
2. Looks up the One Piece Card Game category and the matching set (group) IDs on tcgcsv.com
3. Fetches that set's product and pricing data
4. Merges it with your `collection.json` entries into the cards rendered on the page

If tcgcsv.com is unreachable, the page shows an error state rather than falling back to stale numbers — refresh to retry.
