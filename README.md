# Trent's One Piece Trade Binder

A static digital trade binder for a One Piece Card Game collection — full card art, rarity-coded badges, quantity owned, and TCGplayer market prices, browsable and searchable in the format of a physical binder.

**118 unique cards · 240 total copies · ~$697.85 est. market value · 16 sets**

## Features

- **Card grid** — every card rendered with full art, a rarity-colored badge, quantity owned, and current price
- **Detail view** — click any card to open a modal with a direct link to its live TCGplayer listing
- **Search** — filter by name, set, or card number as you type
- **Filters** — narrow the binder by set or rarity via custom dropdowns
- **Sort** — price (high/low), name, set, or quantity owned
- **Light/dark theme** — leather-and-parchment look in both modes, toggled via the header button
- **Summary stats** — total est. market value, unique cards, total copies, and sets represented

## Stack

Plain HTML/CSS/JS — no build step, no framework, no dependencies. Card data lives in `data.json` and is fetched and rendered client-side.

## Structure

```
index.html     Page markup, layout, controls
css/style.css  Theme, layout, and component styles
js/app.js      Data loading, filtering/sorting, search, custom dropdowns, modal
data.json      Card records (name, set, number, rarity, condition, price, qty, art, TCGplayer link)
```

## Running locally

Static files only — serve the directory with anything that can host static assets, e.g.:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Data

Each entry in `data.json` represents a card in the collection:

```json
{
  "id": "672772",
  "tcgplayerId": "9103524",
  "name": "Boa Hancock (Alternate Art)",
  "set": "Extra Booster: One Piece Heroines Edition",
  "number": "EB03-026",
  "rarity": "Super Rare",
  "condition": "Near Mint",
  "printing": "Foil",
  "price": 52.86,
  "qty": 2,
  "photo": "https://tcgplayer-cdn.tcgplayer.com/product/672772_in_400x400.jpg",
  "tcgUrl": "https://www.tcgplayer.com/product/672772/..."
}
```

Prices reflect TCGplayer market data at time of export and are not live-updating; each card links out to its current TCGplayer listing.
