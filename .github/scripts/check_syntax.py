"""Syntax-check every JavaScript file FinLens loads, plus the inline <script> blocks in index.html.

Uses `node --check`, which parses without running anything. FinLens has no build
step, so a syntax error here would otherwise only show up as a blank screen.
"""
import pathlib, re, subprocess, sys, tempfile

root = pathlib.Path(__file__).resolve().parents[2]
failed = 0

def check(path, label):
    global failed
    r = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
    if r.returncode:
        failed += 1
        print(f"::error file={label}::{r.stderr.strip()}")
    else:
        print(f"ok  {label}")

for js in sorted((root / "js").glob("*.js")):
    check(js, js.relative_to(root).as_posix())

html = (root / "index.html").read_text(encoding="utf-8")
inline = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>", html)
with tempfile.TemporaryDirectory() as tmp:
    for n, body in enumerate(inline, 1):
        f = pathlib.Path(tmp) / f"inline-{n}.js"
        f.write_text(body, encoding="utf-8")
        check(f, f"index.html (inline script {n})")

sys.exit(1 if failed else 0)
