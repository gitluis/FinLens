"""Rename the app everywhere a person sees its name — and nowhere else.

    python3 .github/scripts/rename_app.py "NewName"            # dry run: list every change
    python3 .github/scripts/rename_app.py "NewName" --apply    # make the changes
    python3 .github/scripts/rename_app.py "NewName" --apply --initials NN   # pick favicon letters

Run it on the rename branch right after merging the latest master into it, so it
catches every place the name appears at that point (the redesign stack adds many).

Changes:
  - "FinLens"  -> NewName   (titles, header, footer, Settings, README, docs, messages)
  - "FINLENS"  -> NEWNAME   (file header comments)
  - the "FL" initials in the favicon -> the new name's initials

Never changes (on purpose):
  - lowercase "finlens": what's left is the GitHub repo name in URLs (gitluis/finlens)
    and the old eval kind the app still accepts (published AI Eval results,
    "finlens-ai-eval"). Storage itself has generic names since
    v2.0.2 (app_db, app_fs, app_ keys, app-state.json), so a rename never
    touches people's data.
  - CHANGELOG history (only a new entry is added, by hand), published eval results
    (docs/EVAL.md, docs/eval-results.json, docs/eval-runs/) and docs/archive/ —
    past history stays as is.
  - The GitHub repo name and URLs (rename the repo in Settings; GitHub redirects
    old links).
"""
import pathlib, re, subprocess, sys

if len(sys.argv) < 2 or sys.argv[1].startswith("-"):
    sys.exit(__doc__)
new = sys.argv[1].strip()
apply = "--apply" in sys.argv[2:]
if not re.fullmatch(r"[A-Za-z][A-Za-z0-9 ]{1,30}", new):
    sys.exit("The new name must be 2-31 letters, digits or spaces, starting with a letter.")
# Favicon initials: the capitals of the name ("FinLens" -> "FL", "Tally House" -> "TH"),
# else its first letter ("Cuadre" -> "C"). Override with --initials XY.
caps = re.findall(r"[A-Z]", new)
initials = ("".join(caps[:2]) if len(caps) >= 2 else new[0].upper())
if "--initials" in sys.argv:
    initials = sys.argv[sys.argv.index("--initials") + 1][:2]

root = pathlib.Path(__file__).resolve().parents[2]
SKIP_FILES = {"CHANGELOG.md", "docs/EVAL.md", "docs/eval-results.json",
              ".github/scripts/rename_app.py", ".github/bank-names.txt"}
SKIP_PREFIXES = ("docs/eval-runs/", "docs/archive/")
RULES = [
    (re.compile(r"FinLens"), new),
    (re.compile(r"FINLENS"), new.upper()),
]

files = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True, check=True).stdout.split()
changed_files, changes, kept = 0, 0, 0
for rel in files:
    if rel in SKIP_FILES or rel.startswith(SKIP_PREFIXES):
        continue
    path = root / rel
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    kept += len(re.findall(r"finlens", text))
    out_lines, n_file = [], 0
    for i, line in enumerate(text.split("\n"), 1):
        new_line = line
        for rx, rep in RULES:
            new_line = rx.sub(rep, new_line)
        if rel == "index.html" and 'rel="icon"' in new_line:
            new_line = new_line.replace(">FL</text>", f">{initials}</text>")
        if new_line != line:
            n = sum(len(rx.findall(line)) for rx, _ in RULES) or 1
            n_file += n
            if not apply:
                print(f"{rel}:{i}: {line.strip()[:110]}")
        out_lines.append(new_line)
    if n_file:
        changed_files += 1
        changes += n_file
        if apply:
            path.write_text("\n".join(out_lines), encoding="utf-8")

mode = "Changed" if apply else "Would change"
print(f"\n{mode} {changes} occurrences in {changed_files} files (favicon initials: {initials}).")
print(f"Left as is: {kept} lowercase 'finlens' (repo URLs, the old eval kind still accepted).")
if not apply:
    print("Dry run only. Add --apply to make the changes.")
