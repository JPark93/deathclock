import re

css_path = r"C:\Users\PC\Desktop\Apps\DC\css\style.css"

with open(css_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add the data-source-info styles right before the last section (Misc utility classes)
new_styles = """
/* -------------------------------------------------------
   17a. Data source info — subtle attribution text in results
   ------------------------------------------------------- */
.data-source-info {
  font-size: 0.75rem;
  color: var(--text-dim);
  font-style: italic;
  margin-top: 0.35rem;
  letter-spacing: 0.04em;
}

"""

# Insert before "17. Misc utility classes"
marker = "/* -------------------------------------------------------\n   17. Misc utility classes"
if marker in content:
    content = content.replace(marker, new_styles + marker)
    print("OK: Injected data-source-info CSS")
else:
    # Fallback: append before ::selection
    fallback = "::selection {"
    if fallback in content:
        content = content.replace(fallback, new_styles + fallback)
        print("OK: Appended data-source-info CSS (fallback)")
    else:
        print("WARN: Could not find insertion point — appending to end")
        content += "\n" + new_styles

with open(css_path, "w", encoding="utf-8") as f:
    f.write(content)

print("File written to:", css_path)
