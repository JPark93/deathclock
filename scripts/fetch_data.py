import json
import csv
import os
import urllib.request
import io
from datetime import datetime, timezone

WHO_URL = "https://ghoapi.azureedge.net/api/WHOSIS_000001?$format=json"
OWID_URL = "https://ourworldindata.org/grapher/life-expectancy-hmd-unwpp.csv"
OUTPUT_PATH = r"C:\Users\PC\Desktop\Apps\DC\data\life_expectancy.json"

def fetch_json(url):
    """Fetch JSON from URL with retry."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Python LifeExpectancyFetcher",
            "Accept": "application/json",
        },
    )
    resp = urllib.request.urlopen(req, timeout=120)
    return json.loads(resp.read().decode("utf-8"))

def fetch_text(url):
    """Fetch raw text from URL with retry."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Python LifeExpectancyFetcher",
            "Accept": "text/csv,application/csv,*/*",
        },
    )
    resp = urllib.request.urlopen(req, timeout=120)
    return resp.read().decode("utf-8")

def download_who():
    """Download WHO GHO data with pagination. Returns list of records."""
    all_records = []
    url = WHO_URL
    while url:
        print(f"Fetching WHO page...")
        data = fetch_json(url)
        results = data.get("value", [])
        for r in results:
            # Only COUNTRY-level records, only BTSX (both sexes) dim1
            if r.get("SpatialDimType") != "COUNTRY":
                continue
            all_records.append(r)
        url = data.get("@odata.nextLink") or None
    print(f"WHO total raw records: {len(all_records)}")
    return all_records

def download_owid():
    """Download OWID CSV. Returns list of dicts with keys: entity, code, year, value."""
    text = fetch_text(OWID_URL)
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    val_col = "Life expectancy at birth, totals, period"
    for row in reader:
        code = (row.get("Code") or "").strip()
        if not code:
            continue  # skip aggregates
        entity = (row.get("Entity") or "").strip()
        year_str = (row.get("Year") or "").strip()
        val_str = (row.get(val_col) or "").strip()
        if not year_str or not val_str or val_str == "":
            continue
        try:
            year = int(year_str)
            value = float(val_str)
        except ValueError:
            continue
        rows.append({
            "entity": entity,
            "code": code,
            "year": year,
            "value": round(value, 2),
        })
    print(f"OWID total country-year records: {len(rows)}")
    return rows

def build_iso3_to_name(who_records):
    """Build ISO3 -> preferred name mapping from WHO data."""
    mapping = {}
    for r in who_records:
        code = r.get("SpatialDim", "")
        name = (r.get("SpatialDimName") or "").strip()
        if code and name and code not in mapping:
            mapping[code] = name
    return mapping

def merge_data(who_records, owid_rows, iso3_names):
    """
    Merge WHO + OWID data per country.
    Returns dict: { iso_code -> [year_entries], name_mapping }
    """
    # --- Parse WHO records into a lookup: (code, year) -> {"male": ..., "female": ..., "both": ...}
    who_lookup = {}  # key=(iso3, year) -> entry dict
    for r in who_records:
        code = r.get("SpatialDim", "")
        if not code or r.get("SpatialDimType") != "COUNTRY":
            continue
        raw_dim1 = str(r.get("Dim1", "")).strip().upper()
        # Handle both short forms (MLE/FMLE/BTSX) and long forms (SEX_MLE/SEX_FMLE/SEX_BTSX)
        if "BTSX" in raw_dim1:
            dim1 = "both"
        elif "FMLE" in raw_dim1:
            dim1 = "female"
        elif "MLE" in raw_dim1:
            dim1 = "male"
        else:
            continue  # skip unknown dimension

        year_str = str(r.get("TimeDim") or "").strip()
        val_str = str(r.get("NumericValue", "")).strip()
        if not year_str or not val_str:
            continue
        try:
            year = int(year_str)
            value = round(float(val_str), 2)
        except (ValueError, TypeError):
            continue

        key = (code, year)
        if key not in who_lookup:
            who_lookup[key] = {}
        who_lookup[key][dim1] = value
    # Remove WHO entries that have no 'both' value (incomplete sex breakdown)
    who_lookup = {k: v for k, v in who_lookup.items() if v.get("both") is not None}

    # --- Build country sets from OWID ---
    owid_by_country = {}  # code -> list of (year, value)
    owid_names = {}       # code -> entity name
    for row in owid_rows:
        code = row["code"]
        entry = {"year": row["year"], "value": row["value"]}
        if code not in owid_by_country:
            owid_by_country[code] = []
        owid_by_country[code].append(entry)
        if code not in owid_names:
            owid_names[code] = row["entity"]

    # --- All country codes (WHO + OWID) ---
    who_codes = set(k[0] for k in who_lookup.keys())
    all_codes = who_codes | set(owid_by_country.keys())
    print(f"Total unique countries: {len(all_codes)}")

    # --- Merge per country ---
    countries_data = {}  # code -> {"name": ..., "years": [...]}
    for code in sorted(all_codes):
        name = iso3_names.get(code) or owid_names.get(code, code)
        years_map = {}  # year -> entry dict

        # Add OWID data first (base layer)
        if code in owid_by_country:
            for row in owid_by_country[code]:
                yr = row["year"]
                years_map[yr] = {"both": row["value"]}

        # Overlay WHO data (takes precedence and adds sex breakdown)
        who_years_for_code = [k for k in who_lookup.keys() if k[0] == code]
        for wkey in who_years_for_code:
            yr = wkey[1]
            entry = dict(who_lookup[wkey])  # copy
            years_map[yr] = entry

        # Build sorted year list
        year_list = []
        for yr in sorted(years_map.keys()):
            e = years_map[yr]
            clean = {"year": yr}
            if "both" in e:
                clean["both"] = e["both"]
            if "male" in e:
                clean["male"] = e["male"]
            if "female" in e:
                clean["female"] = e["female"]
            year_list.append(clean)

        countries_data[code] = {
            "name": name,
            "years": year_list,
        }

    return countries_data

def main():
    print("=== Life Expectancy Data Fetch & Merge ===")
    print()

    # Step 1: Download WHO data
    print("--- Source 1: WHO GHO OData API ---")
    try:
        who_records = download_who()
    except Exception as e:
        print(f"ERROR fetching WHO data: {e}")
        return

    # Step 2: Download OWID data
    print("\n--- Source 2: Our World in Data CSV ---")
    try:
        owid_rows = download_owid()
    except Exception as e:
        print(f"ERROR fetching OWID data: {e}")
        return

    # Step 3: Build name mapping & merge
    print("\n--- Merging data ---")
    iso3_names = build_iso3_to_name(who_records)
    countries_data = merge_data(who_records, owid_rows, iso3_names)

    # Step 4: Compute global year range
    all_years = []
    for cd in countries_data.values():
        for y_entry in cd["years"]:
            all_years.append(y_entry["year"])
    min_year = min(all_years) if all_years else 0
    max_year = max(all_years) if all_years else 0

    # Step 5: Build output structure (sorted by country name)
    countries_list = []
    for code in sorted(countries_data.keys(), key=lambda c: countries_data[c]["name"].lower()):
        cd = countries_data[code]
        countries_list.append({
            "code": code,
            "name": cd["name"],
            "years": cd["years"],
        })

    output = {
        "lastUpdated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "WHO GHO OData API (WHOSIS_000001) + Our World in Data (life-expectancy-hmd-unwpp)",
        "yearRange": {"min": min_year, "max": max_year},
        "countries": countries_list,
    }

    # Step 6: Write output JSON (minified)
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, separators=(",", ":"), ensure_ascii=False)

    file_size = os.path.getsize(OUTPUT_PATH)
    print(f"\n=== DONE ===")
    print(f"Output: {OUTPUT_PATH}")
    print(f"Countries: {len(countries_list)}")
    print(f"Year range: {min_year} - {max_year}")
    print(f"File size: {file_size:,} bytes")

if __name__ == "__main__":
    main()
