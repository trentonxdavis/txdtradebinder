#!/usr/bin/env python3
"""
Looks up TCGplayer product IDs by (name query, set name), using the same
tcgcsv.com data (via the CORS proxy) the site resolves live pricing from.

Prints candidate matches for review rather than writing output directly,
since fuzzy name matching can be wrong - confirm matches before adding
them to collection.json/wantlist.json.

Usage:
    python3 scripts/lookup_products.py
"""
import json
import re
import urllib.request

TCGCSV_BASE = "https://txdtradebinder-proxy.trashdragon.workers.dev/tcgplayer"

# (name query, set name) pairs to look up. Name query just needs to be a
# distinctive substring - matching is case-insensitive and ignores
# punctuation.
TARGETS = [
    ("Smoker (093)", "Paramount War"),
    ("Jinbe - ST01-005", "One Piece Promotion Cards"),
    ("Dereshi", "One Piece Promotion Cards"),
    ("Nami - OP01-016", "One Piece Promotion Cards"),
    ("Yamato", "Wings of the Captain"),
    ("Yamato (Event Pack Vol. 3)", "One Piece Promotion Cards"),
    ("Usopp - ST01-002", "One Piece Promotion Cards"),
    ("Roronoa Zoro (EB04-007)", "Adventure on Kami's Island"),
    ("Yamato (CS 2024", "One Piece Promotion Cards"),
    ("Nico Robin - ST01-008", "One Piece Promotion Cards"),
    ("Roronoa Zoro - OP01-001", "One Piece Promotion Cards"),
    ("Monkey.D.Luffy", "One Piece Promotion Cards"),
    ("Sanji - OP01-013", "One Piece Promotion Cards"),
    ("Brook - OP01-022", "One Piece Promotion Cards"),
]


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "txdtradebinder-lookup/1.0"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def normalize(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def main():
    categories = fetch_json(f"{TCGCSV_BASE}/categories")
    category = next(c for c in categories["results"] if "one piece" in normalize(c["name"]))
    category_id = category["categoryId"]

    groups = fetch_json(f"{TCGCSV_BASE}/{category_id}/groups")["results"]
    group_by_name = {normalize(g["name"]): g for g in groups}

    products_cache = {}

    def products_for_set(set_name):
        key = normalize(set_name)
        if key not in group_by_name:
            print(f"  !! no set found matching \"{set_name}\"")
            return []
        group_id = group_by_name[key]["groupId"]
        if group_id not in products_cache:
            products_cache[group_id] = fetch_json(f"{TCGCSV_BASE}/{category_id}/{group_id}/products")["results"]
        return products_cache[group_id]

    for name_query, set_name in TARGETS:
        print(f"\n{name_query!r} in {set_name!r}:")
        candidates = [p for p in products_for_set(set_name) if normalize(name_query) in normalize(p["name"])]
        if not candidates:
            print("  no matches")
        for p in candidates:
            print(f"  productId={p['productId']}  name={p['name']!r}  url={p.get('url', '')}")


if __name__ == "__main__":
    main()
