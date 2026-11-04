"""FinLens product-rule checks.

1. No bank names in tracked files (list in .github/bank-names.txt).
   Past history is left as is, by Luis's rule: only the newest CHANGELOG entry is
   checked, and published eval results / archived docs are skipped.
2. The version is the same in every place CLAUDE.md §17 lists.
3. On a pull request: the version is newer than the base branch's, and no other
   open PR has already claimed it (a PR picks its version when it's opened).

Env (set by the workflow on pull requests): BASE_REF, PR_NUMBER, GITHUB_REPOSITORY, GH_TOKEN.
"""
import json, os, pathlib, re, subprocess, sys

root = pathlib.Path(__file__).resolve().parents[2]
errors = 0

def error(msg, file=None, line=None):
    global errors
    errors += 1
    loc = f" file={file}" + (f",line={line}" if line else "") if file else ""
    print(f"::error{loc}::{msg}")

# 1. Bank names ---------------------------------------------------------------
SKIP_PREFIXES = ("docs/eval-runs/", "docs/archive/", ".git/", "node_modules/")
SKIP_FILES = {".github/bank-names.txt", ".github/scripts/check_rules.py",
              "docs/EVAL.md", "docs/eval-results.json",
              # The v1.12.0 data migration has to recognize the old bank-named ids
              # and account names in saved data to rename them.
              "js/migrate.js"}

names = [l.strip() for l in (root / ".github/bank-names.txt").read_text().splitlines()
         if l.strip() and not l.startswith("#")]
pattern = re.compile(r"(?<![A-Za-z0-9])(" + "|".join(re.escape(n) for n in names) + r")(?![A-Za-z0-9])", re.I)

def newest_changelog_entry(text):
    parts = re.split(r"(?m)^(?=## \[)", text)
    return parts[1] if len(parts) > 1 else ""

files = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True, check=True).stdout.split("\n")
hits = 0
for rel in filter(None, files):
    if rel in SKIP_FILES or rel.startswith(SKIP_PREFIXES):
        continue
    for m in pattern.finditer(rel):  # file and folder names count too
        hits += 1
        error(f'Bank name "{m.group(1)}" in a file name', file=rel)
    path = root / rel
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, IsADirectoryError, FileNotFoundError):
        continue
    if rel == "CHANGELOG.md":
        entry = newest_changelog_entry(text)
        offset = text[: text.find(entry)].count("\n") if entry else 0
        text_lines = entry.splitlines()
    else:
        offset, text_lines = 0, text.splitlines()
    for i, line in enumerate(text_lines, 1):
        for m in pattern.finditer(line):
            hits += 1
            error(f'Bank name "{m.group(1)}" — use "bank" or a neutral account kind instead', file=rel, line=i + offset)
print(f"Bank names: {hits} found in {len([f for f in files if f])} tracked files")

# 2. Version consistency ------------------------------------------------------
def top_version(changelog):
    m = re.search(r"(?m)^## \[(\d+)\.(\d+)\.(\d+)\]", changelog)
    return tuple(map(int, m.groups())) if m else None

def vstr(v):
    return ".".join(map(str, v)) if v else "none"

ver = top_version((root / "CHANGELOG.md").read_text(encoding="utf-8"))
if not ver:
    error("No version entry found at the top of CHANGELOG.md", file="CHANGELOG.md")
else:
    v = vstr(ver)
    places = {
        "index.html": rf"v{re.escape(v)} · FinLens",
        "README.md": rf"\*\*Version:\*\* v{re.escape(v)}\b",
        "js/views-settings.js": rf"FinLens v{re.escape(v)}(?![0-9.])",
        "CLAUDE.md": rf"\*\*Current version:\*\* v{re.escape(v)}\b",
    }
    for rel, pat in places.items():
        if not re.search(pat, (root / rel).read_text(encoding="utf-8")):
            error(f"Version v{v} (top of CHANGELOG.md) is missing from {rel} — see CLAUDE.md §17", file=rel)
    if not re.search(rf"\*FinLens v{re.escape(v)} —", (root / "README.md").read_text(encoding="utf-8")):
        error(f"Version v{v} is missing from the README footer line", file="README.md")
    print(f"Version: v{v}")

# 3. Pull requests: newer than base, and not claimed by another open PR -------
base, pr, repo = os.environ.get("BASE_REF"), os.environ.get("PR_NUMBER"), os.environ.get("GITHUB_REPOSITORY")
if ver and base:
    r = subprocess.run(["git", "show", f"origin/{base}:CHANGELOG.md"], cwd=root, capture_output=True, text=True)
    base_ver = top_version(r.stdout) if r.returncode == 0 else None
    if base_ver and ver <= base_ver:
        error(f"Version v{vstr(ver)} is not newer than {base}'s v{vstr(base_ver)}. Add a new CHANGELOG entry and version (CLAUDE.md §17).",
              file="CHANGELOG.md", line=1)
    else:
        print(f"Newer than {base} (v{vstr(base_ver)})")
if ver and pr and repo:
    def gh(path):
        out = subprocess.run(["gh", "api", "--paginate", path], capture_output=True, text=True)
        return out.stdout if out.returncode == 0 else None
    raw = gh(f"repos/{repo}/pulls?state=open&per_page=100")
    if raw is None:
        print("::warning::Could not list open pull requests; skipped the duplicate-version check.")
    else:
        prs = json.loads(raw.replace("][", ","))
        taken = []
        for p in prs:
            if str(p["number"]) == str(pr):
                continue
            body = subprocess.run(["gh", "api", f"repos/{repo}/contents/CHANGELOG.md?ref={p['head']['sha']}",
                                   "-H", "Accept: application/vnd.github.raw"], capture_output=True, text=True)
            if body.returncode == 0 and top_version(body.stdout) == ver:
                taken.append(f"#{p['number']}")
        if taken:
            error(f"Version v{vstr(ver)} is already used by open PR {', '.join(taken)}. Pick the next free version.",
                  file="CHANGELOG.md", line=1)
        else:
            print(f"Not used by any of the other {len(prs) - 1} open PRs")

sys.exit(1 if errors else 0)
