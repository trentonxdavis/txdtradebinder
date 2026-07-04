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

# (name query, set name, card number or None) to look up. Name query just
# needs to be a distinctive substring - matching is case-insensitive and
# ignores punctuation. Card number (tcgcsv extendedData "Number") narrows
# results further when several products in a set share a similar name
# (e.g. a card and its Parallel/Alternate Art both numbered the same).
TARGETS = [
    ("Enel", "Adventure on Kami's Island", "OP15-118"),
    ("Monkey.D.Luffy", "The Time of Battle", "OP16-015"),
    ("Boa Hancock", "The Time of Battle", "OP16-032"),
    ("Zehahahahaha", "The Time of Battle", "OP16-116"),
    ("Kuzan", "The Time of Battle", "OP16-063"),
    ("Yamato (Premium Card Collection -6 assort", "One Piece Promotion Cards", None),
    ("Yamato (OP04-112)", "Premium Booster -The Best-", "OP04-112"),
    ("Yamato (OP01-121)", "Premium Booster -The Best-", "OP01-121"),
    ("Yamato", "Extra Booster: Anime 25th Collection", "EB02-006"),
    ("Yamato", "Carrying On His Will", "OP13-054"),
    ("Yamato (079)", "The Time of Battle", "OP16-079"),
    ("Yamato (Illustration Box Vol.2)", "One Piece Promotion Cards", "ST13-016"),
    ("Yamato (SP)", "Extra Booster: Anime 25th Collection", "OP06-022"),
    ("Yamato (SP)", "Awakening of the New Era", "OP01-121"),
    ("Yamato", "Romance Dawn", "OP01-121"),
    ("Monkey.D.Luffy (024)", "Romance Dawn", "OP01-024"),
    ("Nami (040)", "Pillars of Strength", "OP03-040"),
    ("Shanks", "Romance Dawn", "OP01-120"),
    ("Yamato (Parallel)", "Romance Dawn", "OP01-121"),
    ("Roronoa Zoro", "Wings of the Captain", "OP06-118"),
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

    def product_field(product, pattern):
        for field in product.get("extendedData") or []:
            if pattern.search(field.get("name") or ""):
                return field.get("value") or ""
        return ""

    number_re = re.compile("number", re.I)
    rarity_re = re.compile("rarity", re.I)

    for name_query, set_name, number in TARGETS:
        label = f"{name_query!r} in {set_name!r}" + (f" #{number}" if number else "")
        print(f"\n{label}:")
        candidates = [p for p in products_for_set(set_name) if normalize(name_query) in normalize(p["name"])]
        if number:
            candidates = [p for p in candidates if normalize(number) == normalize(product_field(p, number_re))]
        if not candidates:
            print("  no matches")
        for p in candidates:
            num = product_field(p, number_re)
            rarity = product_field(p, rarity_re)
            print(f"  productId={p['productId']}  name={p['name']!r}  number={num!r}  rarity={rarity!r}")


if __name__ == "__main__":
    main()
