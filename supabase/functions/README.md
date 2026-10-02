# Edge Functions

Deploy:

```bash
supabase functions deploy submit-attempt
supabase functions deploy get-answer-key
supabase functions deploy admin-summary
```

Supabase hosted projectda `SUPABASE_URL`, `SUPABASE_ANON_KEY` va `SUPABASE_SERVICE_ROLE_KEY` odatda function environmentda mavjud bo'ladi. Zarur bo'lsa Secrets orqali kiriting.

`submit-attempt`:
- authenticated anonymous studentni tekshiradi;
- javob kalitini serverdan oladi;
- 55 ta itemni tekshiradi;
- ayni variantning oldingi response bazasi bilan Rasch qiyinliklarini hisoblaydi;
- natijani immutable `attempts` va `attempt_items` jadvallariga yozadi.

`get-answer-key`:
- user ayni variantni yakunlaganini server tomonda tekshiradi;
- faqat shu variant kalitini qaytaradi.

`admin-summary`:
- faqat `admin_users` jadvalida mavjud UID uchun ishlaydi;
- umumiy va variant kesimidagi ko'rsatkichlarni qaytaradi.
