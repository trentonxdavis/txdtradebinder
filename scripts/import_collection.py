#!/usr/bin/env python3
"""
Rebuilds collection.json from a TCGplayer app collection export (CSV).

The export is treated as the full current collection, not a delta -
collection.json is replaced wholesale each run, so a card removed from a
later scan/export simply drops out automatically.

Usage:
    python3 scripts/import_collection.py path/to/export.csv
"""
import csv
import json
import sys


def load_export(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return [row for row in reader if row.get("Product ID")]


def row_qty(row):
    for field in ("Total Quantity", "Add to Quantity"):
        value = (row.get(field) or "").strip()
        if value:
            return int(float(value))
    return 0


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/import_collection.py path/to/export.csv", file=sys.stderr)
        sys.exit(1)

    rows = load_export(sys.argv[1])

    collection = []
    skipped = 0
    for row in rows:
        qty = row_qty(row)
        if qty <= 0:
            skipped += 1
            continue
        collection.append({
            "productId": int(row["Product ID"]),
            "set": row["Set Name"].strip(),
            "printing": row["Printing"].strip(),
            "qty": qty,
        })

    with open("collection.json", "w") as f:
        json.dump(collection, f, indent=2)
        f.write("\n")

    total_qty = sum(c["qty"] for c in collection)
    print(f"Wrote collection.json: {len(collection)} unique cards, {total_qty} total copies"
          + (f" ({skipped} row(s) skipped: zero/missing quantity)" if skipped else ""))


if __name__ == "__main__":
    main()
