# Custom domain — checklist

Placeholder for the v2.0 launch (milestone *v2.0 — Public launch*). Nothing here is done yet.

## Why
GitHub Pages serves every project of an account from one origin (`https://gitluis.github.io`), and browsers keep IndexedDB and localStorage per origin. A custom domain gives the app its own origin, so no other site can read its data.

## Steps
1. **Pick the name** — then apply it with the rename script (#58).
2. **Check it's free:** domain (Cloudflare or Porkbun search), GitHub repo name, USPTO trademark search.
3. **Buy the domain** (.app, .dev or .com; compare renewal prices, not first-year deals).
4. **DNS:** `CNAME` for the subdomain → `gitluis.github.io` (or GitHub's `A` records for a root domain). On Cloudflare, set the record to **DNS only** (grey cloud).
5. **GitHub → this repo → Settings → Pages → Custom domain.** Not on a `gitluis.github.io` user-site repo.
6. **Enforce HTTPS** (same page), once the certificate is issued.
7. **Verify the domain** in account Settings → Pages.

## Test after it's live
- [ ] Site loads over HTTPS on the new domain
- [ ] `gitluis.github.io/<repo>/` redirects to it
- [ ] Choose folder: Edge/Chrome asks for access; Save Now writes `app-state.json`
- [ ] Reload keeps the data (new origin, so it starts empty the first time)
- [ ] No console errors: CDN scripts and fonts load under the CSP (#22)
