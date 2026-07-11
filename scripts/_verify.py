import json

path = "C:/Users/PC/Desktop/Apps/DC/data/life_expectancy.json"
with open(path) as f:
    d = json.load(f)

print(f"Countries: {len(d['countries'])}")
print(f"Keys: {list(d.keys())}")
print(f"lastUpdated: {d['lastUpdated']}")
print(f"Source: {d['source']}")
print()
print("First 5 countries:")
for c in d["countries"][:5]:
    print(f"  {c['name']:30s} code={c['code']} m={c['male']} f={c['female']} b={c['both']} y={c['year']}")
print()
print("Last 5 countries:")
for c in d["countries"][-5:]:
    print(f"  {c['name']:30s} code={c['code']} m={c['male']} f={c['female']} b={c['both']} y={c['year']}")
