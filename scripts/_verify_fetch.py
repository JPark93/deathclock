import json, os

path = r"C:\Users\PC\Desktop\Apps\DC\data\life_expectancy.json"
with open(path) as f:
    data = json.load(f)

print("=== VERIFICATION ===")
print(f"Countries: {len(data['countries'])}")
print(f"Year range: {data['yearRange']}")
fsize = os.path.getsize(path)
print(f"File size: {fsize:,} bytes")
print()

# USA years
usa = next(c for c in data["countries"] if c["code"] == "USA")
print(f"--- USA ({usa['name']}) ---")
for e in usa["years"]:
    print(e)
print()

# Japan 1985 (should be OWID, both only)
jpn = next(c for c in data["countries"] if c["code"] == "JPN")
jpn_1985 = next((e for e in jpn["years"] if e["year"] == 1985), None)
print(f"--- Japan 1985 (expect OWID, 'both' only) ---")
print(jpn_1985 or "NOT FOUND")
print()

# Japan 2021 (should be WHO, male/female/both)
jpn_2021 = next((e for e in jpn["years"] if e["year"] == 2021), None)
print(f"--- Japan 2021 (expect WHO, male/female/both) ---")
print(jpn_2021 or "NOT FOUND")
print()

# Afghanistan 1960 (should be OWID, both only)
afg = next(c for c in data["countries"] if c["code"] == "AFG")
afg_1960 = next((e for e in afg["years"] if e["year"] == 1960), None)
print(f"--- Afghanistan 1960 (expect OWID, 'both' only) ---")
print(afg_1960 or "NOT FOUND")
