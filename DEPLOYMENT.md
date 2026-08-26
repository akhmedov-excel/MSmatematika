# MS Matematika — release/deploy plan

## Phase A — ready now
- Static frontend in `index.html`, `assets/` and `test/variant/*`.
- Permanent domain placeholder: `msmatematika.uz` via `CNAME`.
- SEO files: `sitemap.xml`, `robots.txt`.
- PWA files: `manifest.webmanifest`, `sw.js`.
- 20 printable QR images in `qr/`.
- GitHub Pages workflow in `.github/workflows/pages.yml`.

## Phase B — after domain purchase is active
1. Create a GitHub repository (recommended name: `MSmatematika`).
2. Upload the contents of this project so `index.html` is at repository root.
3. Enable GitHub Pages using GitHub Actions.
4. In repository Settings → Pages → Custom domain, enter `msmatematika.uz`.
5. In the domain provider DNS zone, configure the GitHub Pages records supplied by GitHub.
6. Wait for DNS propagation and enable HTTPS.
7. Test:
   - `https://msmatematika.uz/`
   - `https://msmatematika.uz/test/variant/1/`
   - `https://msmatematika.uz/test/variant/20/`
8. Only after these tests pass, approve QR codes for print.

## Phase C — production backend
Use `supabase/schema_production.sql` to create the database.

The intended production split is:
- Frontend: GitHub Pages.
- Data/API: Supabase.
- Public answer-view mode: allowed by design.
- Grading: server-side using the answer-key tables/RPC rather than trusting browser-side calculations.
- Attempts/history: stored in the database, with anti-abuse/rate limiting added before public launch.

## Important
Do not publish real Supabase service-role keys in frontend JavaScript. Public browser code may only use the Supabase anon/publishable key together with Row Level Security policies.

Do not print QR codes in the book until the permanent domain, HTTPS and all 20 variant routes have been verified on a real phone.
