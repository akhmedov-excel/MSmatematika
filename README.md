# MSmatematika — Production Web App

Bu loyiha `https://msmatematika.uz/` uchun noldan qayta tuzilgan production-ready frontend + Supabase backend skeletidir.

## Tasdiqlangan funksiyalar

- 20 ta variant.
- Har variantda 45 ta savol: 1–32 Y-1, 33–35 Y-2, 36–45 ochiq a/b.
- 150 daqiqalik timer; refresh/close qilinsa vaqt davom etadi.
- Javoblar local draft sifatida avtomatik saqlanadi.
- Testni ko'rish uchun login yoki shaxsiy ma'lumot shart emas.
- Natijani yuborishda familiya, ism va telefon majburiy.
- MathLive matematik javob kiritish: kasr, ildiz, daraja, pi va boshqa belgilar.
- Server-side grading: answer key browser bundle ichida yo'q.
- Har variantning Rasch statistikasi boshqa variantlardan ajratilgan.
- Natija tarixi foydalanuvchiga ko'rinadi, lekin update/delete yo'q.
- Javob kaliti faqat o'sha variant tugatilgandan keyin server orqali ochiladi.
- Admin panel: foydalanuvchilar, jami testlar, bugungi testlar, variantlar statistikasi.
- Night-only, tinch va ko'zni charchatmaydigan ranglar, mobile responsive dizayn.

## Muhim xavfsizlik arxitekturasi

`private-not-for-github/` papkasini GitHub'ga yuklamang. Unda real javob kaliti seed fayli bor. Public sayt fayllarida javob kaliti yo'q.

## Supabase ulash

1. Yangi Supabase project yarating.
2. Authentication > Providers ichida Anonymous Sign-ins ni yoqing.
3. `supabase/migrations/001_schema.sql` ni SQL Editor'da bajaring.
4. `private-not-for-github/answer_keys_seed.sql` ni SQL Editor'da bajaring.
5. Edge Functions'larni deploy qiling (supabase/functions/README.md).
6. `assets/js/config.js` ichiga Project URL va public anon key ni yozing.
7. Admin uchun Supabase Auth orqali email/password user yarating va uning UUID sini quyidagicha kiriting:

```sql
insert into public.admin_users(user_id) values ('ADMIN_USER_UUID');
```

## Rasch / MS

Rasmiy BMBA manbalarida test natijalari Rasch modeli bilan hisoblanishi va daraja chegaralari (A+ 70+, A 65–69.9, B+ 60–64.9, B 55–59.9, C+ 50–54.9, C 46–49.9) e'lon qilingan. Lekin yuklangan matematika spetsifikatsiyasida theta -> MS transformatsiya formulasi berilmagan.

Shuning uchun backend:
- 55 item response bilan variant bo'yicha alohida 1PL/Rasch diagnostik hisob qiladi;
- 10 ta oldingi urinishgacha MS ko'rsatmaydi;
- 10+ urinishda `50 + 10*theta`, 0–75 oralig'ida diagnostic/provisional MS beradi;
- bu qiymat UI'da rasmiy sertifikat bali deb ko'rsatilmaydi.

Agar vakolatli manbadan aniq theta->MS transformatsiyasi olinadigan bo'lsa, faqat `submit-attempt/index.ts` dagi transformatsiya qismini almashtirish kifoya.

## GitHub Pages

GitHub'ga public deploy uchun `private-not-for-github/` papkasini chiqarib tashlang. `.gitignore` allaqachon uni ignore qiladi.

Custom domain uchun repo rootida `CNAME` fayli `msmatematika.uz` bo'lishi mumkin.
