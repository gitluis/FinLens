# Custom domain — checklist

Placeholder for the v2.0 launch (milestone *v2.0 — Public launch*). Nothing here is done yet.

## Why
GitHub Pages serves every project of an account from one origin (`https://gitluis.github.io`), and browsers keep IndexedDB and localStorage per origin. A custom domain gives the app its own origin, so no other site can read its data.

## Steps (in this order)
GitHub asks for verification and the repo setting **before** DNS, so nobody else can claim the domain meanwhile. Full instructions with placeholders and exact records: PR #56.

1. **Pick the name** — then apply it with the rename script (#58).
2. **Check it's free:** domain (Cloudflare or Porkbun search), GitHub repo name, USPTO trademark search.
3. **Buy the domain** (.app, .dev or .com; compare renewal prices, not first-year deals). Delete the registrar's default records.
4. **Verify the domain** on the account: profile → Settings → Pages → Add a domain, then the TXT record GitHub shows. Keep it.
5. **GitHub → this repo → Settings → Pages → Custom domain.** Not on a `gitluis.github.io` user-site repo.
6. **DNS:** `CNAME` for the subdomain → `gitluis.github.io` (or GitHub's `A`/`AAAA` records for a root domain). On Cloudflare, **DNS only** (grey cloud). No wildcard records.
7. **Enforce HTTPS** (same page), once offered — DNS and the certificate can each take up to 24 hours.

## Test after it's live
- [ ] Site loads over HTTPS on the new domain
- [ ] `gitluis.github.io/<repo>/` redirects to it
- [ ] Choose folder: Edge/Chrome asks for access; Save Now writes `app-state.json`
- [ ] Reload keeps the data (new origin, so it starts empty the first time)
- [ ] No console errors: CDN scripts and fonts load under the CSP (#22)
