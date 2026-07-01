#!/usr/bin/env python3
"""
Refreshes cards.json from collection.json + tcgcsv.com (TCGplayer's public
catalog/pricing mirror). Runs server-side in CI, where tcgcsv's lack of CORS
headers doesn't matter — only a browser enforces CORS.
"""
import json
import re
import sys
import urllib.error
import urllib.request

TCGCSV_BASE = "https://tcgcsv.com/tcgplayer"


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "txdtradebinder/1.0"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def normalize(name):
    return re.sub(r"\s+", " ", (name or "").strip()).lower()


def fetch_category_id():
    data = fetch_json(f"{TCGCSV_BASE}/categories")
    for cat in data.get("results", []):
        if "one piece" in normalize(cat.get("name")):
            return cat["categoryId"]
    raise RuntimeError("Could not find the One Piece Card Game category on tcgcsv.com")


def fetch_groups(category_id):
    data = fetch_json(f"{TCGCSV_BASE}/{category_id}/groups")
    return {normalize(g["name"]): g["groupId"] for g in data.get("results", [])}


def fetch_group_data(category_id, group_id):
    products = fetch_json(f"{TCGCSV_BASE}/{category_id}/{group_id}/products").get("results", [])
    prices = fetch_json(f"{TCGCSV_BASE}/{category_id}/{group_id}/prices").get("results", [])
    return products, prices


def extended_value(product, pattern):
    for field in product.get("extendedData") or []:
        if pattern.search(field.get("name") or "") or pattern.search(field.get("displayName") or ""):
            return field.get("value") or ""
    return ""


NUMBER_RE = re.compile("number", re.I)
RARITY_RE = re.compile("rarity", re.I)

# tcgcsv's extendedData returns One Piece TCG rarities as short codes rather
# than full names; map them to the names the UI's rarity color-coding (see
# css/style.css .rarity-*) expects.
RARITY_NAMES = {
    "C": "Common",
    "UC": "Uncommon",
    "R": "Rare",
    "SR": "Super Rare",
    "SEC": "Secret Rare",
    "L": "Leader",
    "P": "Promo",
    "PR": "Promo",
    "SP": "Special",
    "DON!!": "Don!!",
}


def build_card(entry, product, price_entry):
    has_price = price_entry is not None and (
        price_entry.get("marketPrice") is not None or price_entry.get("midPrice") is not None
    )
    price = None
    if has_price:
        price = price_entry.get("marketPrice")
        if price is None:
            price = price_entry.get("midPrice")

    product_id = entry["productId"]
    rarity_code = extended_value(product, RARITY_RE) if product else ""
    return {
        "id": str(product_id),
        "name": product["name"] if product else f"Unknown card #{product_id}",
        "set": entry["set"],
        "number": extended_value(product, NUMBER_RE) if product else "",
        "rarity": RARITY_NAMES.get(rarity_code, rarity_code) or "Unknown",
        "condition": "Near Mint",
        "printing": entry["printing"],
        "price": price,
        "qty": entry["qty"],
        "photo": (product or {}).get("imageUrl") or f"https://tcgplayer-cdn.tcgplayer.com/product/{product_id}_in_400x400.jpg",
        "tcgUrl": (product or {}).get("url") or f"https://www.tcgplayer.com/product/{product_id}",
    }


def main():
    with open("collection.json") as f:
        collection = json.load(f)

    category_id = fetch_category_id()
    group_id_by_name = fetch_groups(category_id)

    unique_sets = sorted({entry["set"] for entry in collection})
    group_ids = {}
    for set_name in unique_sets:
        group_id = group_id_by_name.get(normalize(set_name))
        if group_id is None:
            print(f"warning: no matching TCGplayer set found for \"{set_name}\"", file=sys.stderr)
            continue
        group_ids[set_name] = group_id

    products_by_id = {}
    prices_by_key = {}
    for set_name, group_id in group_ids.items():
        products, prices = fetch_group_data(category_id, group_id)
        for product in products:
            products_by_id[product["productId"]] = product
        for price_entry in prices:
            key = (price_entry["productId"], normalize(price_entry.get("subTypeName")))
            prices_by_key[key] = price_entry

    cards = []
    missing = 0
    for entry in collection:
        product = products_by_id.get(entry["productId"])
        if product is None:
            missing += 1
            print(f"warning: no product found for productId {entry['productId']} in set \"{entry['set']}\"", file=sys.stderr)
        price_entry = prices_by_key.get((entry["productId"], normalize(entry["printing"])))
        cards.append(build_card(entry, product, price_entry))

    stats = {
        "totalValue": round(sum((c["price"] or 0) * c["qty"] for c in cards), 2),
        "totalCards": len(cards),
        "totalQty": sum(c["qty"] for c in cards),
        "sets": len({c["set"] for c in cards}),
    }

    with open("cards.json", "w") as f:
        json.dump({"cards": cards, "stats": stats}, f, indent=2)

    print(f"Wrote cards.json: {len(cards)} cards, {missing} missing product(s), ${stats['totalValue']:.2f} total value")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.URLError as err:
        print(f"error: network request failed: {err}", file=sys.stderr)
        sys.exit(1)
