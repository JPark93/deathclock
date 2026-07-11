import json
import re
from pathlib import Path

filepath = Path(__file__).with_name('index.html')
with filepath.open('r', encoding='utf-8') as f:
    content = f.read()

print('=== VERIFICATION REPORT ===')
print()

# 1. CSP meta tag check
csp_expected = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; worker-src 'self'; connect-src 'self'; manifest-src 'self'; media-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; upgrade-insecure-requests;"
has_csp = csp_expected in content
print(f'[CSP Meta Tag Present]: {has_csp}')

if has_csp:
    print('  - Contains worker-src:', 'worker-src' in csp_expected)
    print('  - Contains connect-src:', 'connect-src' in csp_expected)
    print('  - Contains base-uri:', 'base-uri' in csp_expected)
    # Check the actual meta tag doesn't have frame-ancestors
    csp_match = re.search(r'<meta\s+http-equiv="Content-Security-Policy"[^>]*>', content, re.IGNORECASE)
    if csp_match:
        print('  - No frame-ancestors in tag:', 'frame-ancestors' not in csp_match.group(0))

# X-Content-Type-Options check
has_xcto = '<meta http-equiv="X-Content-Type-Options" content="nosniff">' in content
print(f'[X-Content-Type-Options nosniff]: {has_xcto}')

# Referrer policy check
has_referrer = '<meta name="referrer" content="no-referrer">' in content
print(f'[Referrer no-referrer]: {has_referrer}')

# 2. Check executable <script> tags use src= and validate JSON-LD data blocks
script_blocks = re.findall(r'<script([^>]*)>(.*?)</script>', content, re.DOTALL | re.IGNORECASE)
print()
print('=== SCRIPT TAGS ===')
all_have_src = True
has_inline_js = False
json_ld_valid = True
for attrs, body in script_blocks:
    is_json_ld = bool(re.search(r'type\s*=\s*["\']application/ld\+json["\']', attrs, re.IGNORECASE))
    has_src_attr = bool(re.search(r'\bsrc\s*=', attrs, re.IGNORECASE))
    script_kind = 'JSON-LD data' if is_json_ld else 'executable script'
    print(f'  Tag kind: {script_kind}')
    print(f'  Has src= attribute: {has_src_attr}')
    if not is_json_ld and not has_src_attr:
        all_have_src = False
    if body.strip() and not is_json_ld:
        has_inline_js = True
    if is_json_ld:
        try:
            json.loads(body)
        except json.JSONDecodeError:
            json_ld_valid = False
print(f'[All script tags use src=]: {all_have_src}')
print(f'[JSON-LD data is valid JSON]: {json_ld_valid}')

# Check no inline event handlers (on* attributes)
inline_events = re.findall(r'\bon\w+\s*=', content, re.IGNORECASE)
print(f'[No inline event handlers (on*)]: {len(inline_events) == 0} (found: {len(inline_events)})')

print(f'[No inline script bodies]: {not has_inline_js}')

# 3. Check data-source-info element exists in body
has_data_source = 'data-source-info' in content or 'id="data-source-info"' in content
print(f'[data-source-info element exists in body]: {has_data_source}')

# Extract and print full <head> section
print()
print('=== FULL <HEAD> SECTION ===')
head_match = re.search(r'<head>(.*?)</head>', content, re.DOTALL)
if head_match:
    for line in head_match.group(1).strip().split('\n'):
        stripped = line.strip()
        if stripped:
            print(stripped)

print()
# Overall assessment
all_ok = has_csp and has_xcto and has_referrer and all_have_src and json_ld_valid and len(inline_events) == 0 and not has_inline_js and has_data_source
if all_ok:
    print('[OVERALL STATUS]: ALL CHECKS PASSED - No modifications needed.')
else:
    missing = []
    if not has_csp: missing.append('CSP meta tag')
    if not has_xcto: missing.append('X-Content-Type-Options')
    if not has_referrer: missing.append('Referrer policy')
    if not all_have_src: missing.append('script src= attributes')
    if not json_ld_valid: missing.append('valid JSON-LD')
    if len(inline_events) > 0: missing.append('inline event handlers')
    if has_inline_js: missing.append('inline script bodies')
    if not has_data_source: missing.append('data-source-info element')
    print(f'[OVERALL STATUS]: CHECKS FAILED - Missing/Issues: {", ".join(missing)}')
