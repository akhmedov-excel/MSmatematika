# MS Matematika

Premium digital companion for the **Matematika Milliy Sertifikat** book.

## Product flow

`QR → variant route → answer view OR result check → name/surname → answers → result → error analysis → history`

### Two modes

**Javoblarni darhol ko‘rish**
- Lets the learner choose a variant and immediately view the verified answer key.
- Does not require entering their own answers.

**Natijamni tekshirish**
- Learner enters name/surname.
- Selects a variant.
- Enters answers for 1–35 and open responses for 36–45.
- The prototype calculates the score locally and stores history in the browser.
- Production mode should move grading to Supabase/server-side logic.

## GitHub Pages

1. Create a GitHub repository named `MSmatematika`.
2. Upload the contents of this folder to the repository root.
3. Enable GitHub Pages using the included Actions workflow.
4. Set the custom domain to `msmatematika.uz`.
5. Configure DNS at the registrar with the records GitHub displays for the custom domain.
6. Verify HTTPS and all 20 variant routes.

## Important before printing the book

Do **not** print the QR codes until:
- `https://msmatematika.uz/` works;
- every `/test/variant/1/` … `/test/variant/20/` route works on a phone;
- HTTPS is active;
- the answer keys have been verified against the authoritative source.

## Backend

See `supabase/schema_production.sql` and `DEPLOYMENT.md`.

Never put a Supabase service-role key in browser code.
