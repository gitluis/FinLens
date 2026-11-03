#!/usr/bin/env python3
"""Version check for FinLens PRs (CLAUDE.md §0 "Finalizing a PR", §17).

Fails when:
  1. CHANGELOG.md still has a `## [Unreleased]` entry (the PR isn't finalized yet);
  2. the top CHANGELOG version isn't higher than the base branch's (no new version,
     or another PR already merged with this number);
  3. any version spot from §17 doesn't show the top CHANGELOG version.

Usage: check-version.py [BASE_CHANGELOG]
Run from the repository root. BASE_CHANGELOG is the base branch's CHANGELOG.md;
without it, check 2 is skipped.
"""
import re
import sys

VERSION_HEADING = re.compile(r"^## \[(\d+)\.(\d+)\.(\d+)\]", re.M)
UNRELEASED = re.compile(r"^## \[Unreleased\]", re.M | re.I)

# File, a description for the error message, and a pattern for the version spot.
# Each pattern captures the version written there.
SPOTS = [
    ("index.html", "sidebar footer", r"v(\d+\.\d+\.\d+) · FinLens"),
    ("README.md", "header line", r"\*\*Version:\*\* v(\d+\.\d+\.\d+)"),
    ("README.md", "footer line", r"\*FinLens v(\d+\.\d+\.\d+) —"),
    ("js/views-settings.js", "General tab", r"FinLens v(\d+\.\d+\.\d+)"),
    ("CLAUDE.md", "§1 Current version", r"\*\*Current version:\*\* v(\d+\.\d+\.\d+)"),
]


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def top_version(text):
    m = VERSION_HEADING.search(text)
    return tuple(int(x) for x in m.groups()) if m else None


def fmt(v):
    return ".".join(map(str, v))


def main():
    errors = []
    changelog = read("CHANGELOG.md")

    if UNRELEASED.search(changelog):
        errors.append(
            "CHANGELOG.md still has a `## [Unreleased]` entry. This PR isn't finalized: "
            "ask Claude to finalize it (merge master in, pick the version, update every "
            "version spot), then merge."
        )
        # The other checks would only compare the previous release's number.
        print("Version check failed:")
        print(f"  - {errors[0]}")
        return 1

    version = top_version(changelog)
    if version is None:
        errors.append("CHANGELOG.md has no `## [X.Y.Z]` entry.")
    else:
        if len(sys.argv) > 1:
            base = top_version(read(sys.argv[1]))
            if base and version <= base:
                errors.append(
                    f"The top CHANGELOG version v{fmt(version)} isn't higher than the base "
                    f"branch's v{fmt(base)}. Every change needs a new version (§17); if "
                    "another PR merged first, merge master in and finalize again."
                )
        for path, where, pattern in SPOTS:
            found = re.findall(pattern, read(path))
            if not found:
                errors.append(f"{path} ({where}): no version string found.")
            elif any(v != fmt(version) for v in found):
                errors.append(
                    f"{path} ({where}) shows v{', v'.join(sorted(set(found)))}, "
                    f"expected v{fmt(version)}."
                )

    if errors:
        print("Version check failed:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print(f"Version check passed: v{fmt(version)}, shown in every version spot.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
