import re

filepath = 'C:/Users/PC/Desktop/Apps/DC/index.html'
with open(filepath, 'r') as f:
    content = f.read()

print('=== VERIFICATION REPORT ===')
print()

# 1. CSP meta tag check
csp_expected = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; worker-src 'self'; media-src 'none'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; upgrade-insecure-requests;"
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

# 2. Check all <script> tags use src= attribute (no inline scripts)
scripts = re.findall(r'<script[^>]*>', content, re.IGNORECASE)
print()
print('=== SCRIPT TAGS ===')
all_have_src = True
for s in scripts:
    has_src_attr = 'src=' in s or 'src =' in s
    print(f'  Tag: {s}')
    print(f'  Has src= attribute: {has_src_attr}')
    if not has_src_attr:
        all_have_src = False
print(f'[All script tags use src=]: {all_have_src}')

# Check no inline event handlers (on* attributes)
inline_events = re.findall(r'\bon\w+\s*=', content, re.IGNORECASE)
print(f'[No inline event handlers (on*)]: {len(inline_events) == 0} (found: {len(inline_events)})')

# Check no <script> with body content (inline script blocks)
inline_scripts = re.findall(r'<script[^>]*>(.*?)</script>', content, re.DOTALL | re.IGNORECASE)
has_inline_js = any(s.strip() for s in inline_scripts)
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
all_ok = has_csp and has_xcto and has_referrer and all_have_src and len(inline_events) == 0 and not has_inline_js and has_data_source
if all_ok:
    print('[OVERALL STATUS]: ALL CHECKS PASSED - No modifications needed.')
else:
    missing = []
    if not has_csp: missing.append('CSP meta tag')
    if not has_xcto: missing.append('X-Content-Type-Options')
    if not has_referrer: missing.append('Referrer policy')
    if not all_have_src: missing.append('script src= attributes')
    if len(inline_events) > 0: missing.append('inline event handlers')
    if has_inline_js: missing.append('inline script bodies')
    if not has_data_source: missing.append('data-source-info element')
    print(f'[OVERALL STATUS]: CHECKS FAILED - Missing/Issues: {", ".join(missing)}')
