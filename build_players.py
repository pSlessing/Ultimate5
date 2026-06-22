#!/usr/bin/env python3
"""
Turn HLTV player-stats HTML pages into a CSV for 5-stack.

Usage:
    python3 build_players.py 2025html.html
    python3 build_players.py *.html -o players.csv
    python3 build_players.py 2024.html --year 2024

For each player row it pulls: name, nationality, rating.
The `year` is taken from the first 4-digit number in the filename
(e.g. "2025html.html" -> 2025), or from --year, or the page's startDate.
The `roles` column is left EMPTY on purpose — fill it in yourself with
pipe-separated values, e.g.  AWP|Pack Rifler   (IGL, AWP, Pack Rifler, Anchor).

Output columns:  name,nationality,year,rating,roles
"""

import argparse
import html
import re
import sys

# HLTV uses full country names; the game's flag map uses these shorter keys.
NATIONALITY_FIXUPS = {
    "United States": "USA",
    "Bosnia and Herzegovina": "Bosnia",
    "Czech Republic": "Czechia",
    "United Kingdom": "UK",
}

# Each player is one <tr>...</tr>. Pull nationality (flag title), name (first
# player link), and rating (ratingCol cell). The order of cells is stable on
# HLTV's stats table, so a per-row regex sweep is enough.
ROW_RE = re.compile(r"<tr>(.*?)</tr>", re.DOTALL)
NAT_RE = re.compile(r'flags/[^"]*"[^>]*\btitle="([^"]*)"')
NAME_RE = re.compile(r'playerCol[^>]*>.*?<a\b[^>]*>(.*?)</a>', re.DOTALL)
RATING_RE = re.compile(r'class="ratingCol[^"]*"[^>]*>\s*([0-9]+\.[0-9]+)')
STARTDATE_RE = re.compile(r"startDate=(\d{4})-")


def year_for(path: str, override, text: str):
    if override:
        return override
    m = re.search(r"(\d{4})", path.rsplit("/", 1)[-1])
    if m:
        return m.group(1)
    m = STARTDATE_RE.search(text)
    return m.group(1) if m else "?"


def clean(s: str) -> str:
    # strip any stray tags, unescape entities, collapse whitespace
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def parse_file(path: str, year_override):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    year = year_for(path, year_override, text)
    rows = []
    for block in ROW_RE.findall(text):
        nat_m = NAT_RE.search(block)
        name_m = NAME_RE.search(block)
        rating_m = RATING_RE.search(block)
        if not (nat_m and name_m and rating_m):
            continue  # header row or anything that isn't a player line
        nat = clean(nat_m.group(1))
        nat = NATIONALITY_FIXUPS.get(nat, nat)
        rows.append({
            "name": clean(name_m.group(1)),
            "nationality": nat,
            "year": year,
            "rating": rating_m.group(1),
        })
    return rows


def main():
    ap = argparse.ArgumentParser(description="HLTV stats HTML -> 5-stack CSV")
    ap.add_argument("files", nargs="+", help="HLTV stats HTML file(s)")
    ap.add_argument("-o", "--out", help="output CSV (default: stdout)")
    ap.add_argument("--year", help="force this year for all input files")
    args = ap.parse_args()

    all_rows = []
    for path in args.files:
        rows = parse_file(path, args.year)
        all_rows.extend(rows)
        print(f"{path}: {len(rows)} players", file=sys.stderr)

    out = open(args.out, "w", encoding="utf-8", newline="") if args.out else sys.stdout
    out.write("name,nationality,year,rating,roles\n")
    for r in all_rows:
        out.write(f"{r['name']},{r['nationality']},{r['year']},{r['rating']},\n")
    if args.out:
        out.close()

    # flag any nationalities the game doesn't have an emoji for, so you can add them
    KNOWN = {
        "Sweden", "Denmark", "France", "Ukraine", "Russia", "USA", "Brazil",
        "Bosnia", "Poland", "Finland", "Slovakia", "Latvia", "Estonia", "Norway",
        "Israel", "Mexico", "Canada", "Kazakhstan", "Turkey", "Serbia",
        "Lithuania", "Bulgaria", "Hungary", "Czechia", "Netherlands",
        # added: all nationalities present in players.csv
        "Australia", "Belarus", "Belgium", "Chile", "China", "Germany",
        "Guatemala", "Indonesia", "Jordan", "Kosovo", "Mongolia", "Montenegro",
        "New Zealand", "North Macedonia", "Portugal", "Romania", "South Africa",
        "Spain", "UK", "Uruguay", "Argentina", "Switzerland", "Uzbekistan",
    }
    unknown = sorted({r["nationality"] for r in all_rows} - KNOWN)
    if unknown:
        print(
            "\nNote — these nationalities have no flag in index.html's FLAG map yet:\n  "
            + ", ".join(unknown)
            + "\n(add them to FLAG in index.html or they'll render as 🏳️)",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
