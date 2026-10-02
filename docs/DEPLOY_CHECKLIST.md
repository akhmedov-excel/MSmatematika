# Deployment checklist

## 1. Supabase
- [ ] Anonymous Sign-ins yoqilgan.
- [ ] `supabase/migrations/001_schema.sql` bajarilgan.
- [ ] `private-not-for-github/answer_keys_seed.sql` bajarilgan (1100 answer-key row).
- [ ] `submit-attempt`, `get-answer-key`, `admin-summary` Edge Functions deploy qilingan.
- [ ] Admin email/password account yaratilgan va UID `admin_users` jadvaliga qo'shilgan.

## 2. Frontend
- [ ] `assets/js/config.js` ichiga Supabase URL va anon key kiritilgan.
- [ ] `private-not-for-github/` GitHub'ga yuklanmagan.
- [ ] CNAME = `msmatematika.uz`.
- [ ] GitHub Pages `main` branch root'dan deploy qilinadi.

## 3. Sinov
- [ ] 1-variant: 1–35 yopiq javoblar ishlaydi.
- [ ] 36–45 math-field mobil va desktopda ishlaydi.
- [ ] Refresh'dan keyin draft va timer saqlanadi.
- [ ] 150 daqiqa tugasa submit dialog ochiladi.
- [ ] Natija serverga yoziladi va history'da chiqadi.
- [ ] History row'larini client update/delete qila olmaydi.
- [ ] Variant 1 tugagach faqat Variant 1 kaliti ochiladi.
- [ ] URL orqali ishlanmagan variant kalitini olish 403 beradi.
- [ ] Admin bo'lmagan user `admin-summary` uchun 403 oladi.
- [ ] Mobil ekran: 360–430 px.
- [ ] Desktop: 1280–1920 px.

## 4. Rasch
- [ ] Variantlar alohida kalibrlanadi.
- [ ] 10 tadan kam oldingi urinishda MS ko'rsatilmaydi.
- [ ] 10–49 urinishda provisional, 50+ urinishda stable belgisi chiqadi.
- [ ] Rasmiy theta->MS formulasi topilsa diagnostik transformatsiya almashtiriladi.
