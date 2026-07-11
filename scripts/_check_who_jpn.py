import urllib.request, json

WHO_URL = "https://ghoapi.azureedge.net/api/WHOSIS_000001?$format=json"
req = urllib.request.Request(WHO_URL)
resp = urllib.request.urlopen(req, timeout=60)
data = json.loads(resp.read())

jpn_records = [r for r in data["value"] if r.get("SpatialDim") == "JPN" and str(r.get("TimeDim")) == "2021"]
print(f"Japan 2021 WHO records: {len(jpn_records)}")
for r in jpn_records:
    print(f"  Dim1={r.get('Dim1')!r}, NumericValue={r.get('NumericValue')!r}")
