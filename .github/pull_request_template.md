<!--
Title: "vX.Y.Z: Short title", version first (e.g. "v1.11.0: Budget alerts").
Sections are ##, subsections ###. No --- separators and no collapsed <details> blocks.
Merge order, the stacked note, Root cause and How to reproduce the bug appear only when they apply. Delete them otherwise.
Rules: CLAUDE.md §0.
-->

<!-- Only when this PR must merge before or after other PRs (same section touched, consecutive versions) -->
**Merge order:** #NN → **#MM (this PR)** → #KK

<!-- Only for a stack @gitluis approved -->
> **Stacked on #NN** — approved by @gitluis on <date>: <why it can't wait>

## Summary
What the PR does, in a few lines.
<!-- Add "Closes #N" when the PR resolves an issue -->

**Suggested version:** vX.Y.Z

## Root cause
<!-- Bug fixes only -->

## What changed

### Files
Files touched and what changed in each.

### Behavior
What the user sees or what the app does differently.
<!-- UI PRs: before/after screenshots -->
<!-- Storage changes: what happens to data already saved (IndexedDB, finlens-state.json, localStorage): kept, migrated or cleared -->

### Trade-offs
Choices made and what they cost.

### Found, not fixed
Related problems noticed but left for a later PR, or "None".

## Testing

### Automated checks
**Environment:** <runner> · **Commit:** `<short SHA>` · **Passed:** <passed>/<total>

| Check | Result | Notes |
|---|---|---|
| Version matches CHANGELOG, index.html, README, views-settings.js and CLAUDE.md, and is next after master | ✅ Pass | |
| ... | | |

<!-- ✅ Pass · ❌ Fail · ⏭️ Skipped. Replace this line and table in place when a new commit is tested. -->

### Not verified
What the tests couldn't cover (real Edge/Chrome with a real data folder, real bank exports, the Claude API, screen readers).

### How to reproduce the bug
<!-- Bug fixes only -->
1. One action per step, from a known state on master (or the affected PR/version)
2. ...

**What goes wrong:** ...
**What should happen:** ...

### Manual QA steps
**Setup:** check out `<branch>`, run `python3 -m http.server 8000` in the repo folder, open http://localhost:8000 in a private window, load `<sample from samples/>`.

1. Click **<label>** → you should see ...
2. ...
<!-- Main change first, then persistence (reload, Clear everything), then regressions.
     Bug fixes: repeat the reproduction steps and show the result is now correct.
     Docs-only: list what to read and what to check. -->

## Check before merging
- [ ] Decisions only @gitluis can make
