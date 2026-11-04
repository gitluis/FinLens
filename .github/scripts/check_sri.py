"""Check the CDN scripts in index.html.

- A script WITH an `integrity` attribute must also have `crossorigin`, and its hash
  must match the file the CDN serves today. A wrong hash makes the browser refuse to
  run the script, so FinLens would break with no visible error. That fails the check.
- A script WITHOUT `integrity` is reported as a warning for now. Content Security
  Policy + SRI for every CDN script is PR #22; once it's on master, change
  MISSING_IS_ERROR to True so no new unpinned script can slip in.
"""
import base64, hashlib, pathlib, re, sys, urllib.request

MISSING_IS_ERROR = False

root = pathlib.Path(__file__).resolve().parents[2]
html = (root / "index.html").read_text(encoding="utf-8")
errors = 0

for tag in re.finditer(r"<script\b[^>]*\bsrc=\"(https?://[^\"]+)\"[^>]*>", html):
    src, attrs = tag.group(1), tag.group(0)
    m = re.search(r"integrity=\"([^\"]+)\"", attrs)
    if not m:
        level = "error" if MISSING_IS_ERROR else "warning"
        errors += MISSING_IS_ERROR
        print(f"::{level} file=index.html::No integrity attribute on {src}")
        continue
    if "crossorigin" not in attrs:
        errors += 1
        print(f"::error file=index.html::integrity without crossorigin on {src}")
    algo, expected = m.group(1).split("-", 1)
    req = urllib.request.Request(src, headers={"User-Agent": "finlens-ci"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
    except Exception as e:  # a CDN outage should fail loudly, not pass
        errors += 1
        print(f"::error file=index.html::Could not download {src}: {e}")
        continue
    actual = base64.b64encode(hashlib.new(algo, body).digest()).decode()
    if actual != expected:
        errors += 1
        print(f"::error file=index.html::SRI hash mismatch for {src}\n  in index.html: {algo}-{expected}\n  CDN serves:    {algo}-{actual}")
    else:
        print(f"ok  {src}")

sys.exit(1 if errors else 0)
