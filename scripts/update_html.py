import re

html_path = r"C:\Users\PC\Desktop\Apps\DC\index.html"

with open(html_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add data-source-info element inside expiry-info block
old_block = '''            <div class="expiry-info">
                <p><strong>Expected Expiry Date:</strong> <span id="expiry-date">--</span></p>
                <p><strong>Base Life Expectancy:</strong> <span id="base-le">--</span> years</p>
                <p><strong>Adjusted Life Expectancy:</strong> <span id="adjusted-le">--</span> years</p>
            </div>'''

new_block = '''            <div class="expiry-info">
                <p><strong>Expected Expiry Date:</strong> <span id="expiry-date">--</span></p>
                <p><strong>Base Life Expectancy:</strong> <span id="base-le">--</span> years</p>
                <p><strong>Adjusted Life Expectancy:</strong> <span id="adjusted-le">--</span> years</p>
                <p class="data-source-info" id="data-source-info"></p>
            </div>'''

if old_block in content:
    content = content.replace(old_block, new_block)
    print("OK: Replaced expiry-info block")
else:
    print("WARN: Could not find exact match for expiry-info block — trying regex fallback")
    pattern = r'(<div class="expiry-info">.*?</p>\s*</div>)'
    match = re.search(pattern, content, re.DOTALL)
    if match:
        old_matched = match.group(1)
        new_block_regex = '''<div class="expiry-info">
                <p><strong>Expected Expiry Date:</strong> <span id="expiry-date">--</span></p>
                <p><strong>Base Life Expectancy:</strong> <span id="base-le">--</span> years</p>
                <p><strong>Adjusted Life Expectancy:</strong> <span id="adjusted-le">--</span> years</p>
                <p class="data-source-info" id="data-source-info"></p>
            </div>'''
        content = content[:match.start(1)] + new_block_regex + content[match.end(1):]
        print("OK: Regex fallback replaced expiry-info block")

with open(html_path, "w", encoding="utf-8") as f:
    f.write(content)

print("File written to:", html_path)
