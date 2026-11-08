# O'qituvchi paneli

O'qituvchi maqomini asosiy saytning admin paneli beradi (TUBE-MENTOR `role: teacher`). O'qituvchi kabinetdagi "Quiz" tugmasi orqali parolsiz kiradi (`server/platform-editor.ts`). Kabinetda eski Master Quiz o'qituvchi hisobini bog'lagan bo'lsa — o'sha hisob ochiladi.

## Bo'limlar
- **Bosh sahifa** — shaxsiy statistika (`GET /api/teacher-panel/stats`).
- **Quizlar** — admin "Tayyor quizlar"ga chiqargan papkalar. O'qituvchi testni o'zgartirmaydi: birinchi ochganda unga yashirin nusxa beriladi (`teacher_library_copies`), admin testni o'zgartirsa keyingi ochilishda yangi nusxa. Test sahifasi: jonli o'tkazish, havola (umumiy yoki guruhga, muddat bilan), vaqt belgilash.
- **Sinflarim** — guruh = ismlar ro'yxati (`teacher_groups`, `teacher_group_students`). Guruh havolasida o'quvchi ro'yxatdan ismini tanlaydi va testni bir marta ishlaydi.
- **Natijalar** — jonli/vaqtli o'yinlar (`quiz_results`) va havolalar (`shared_quizzes`) bitta ro'yxatda, reyting va Telegram uchun matn.
- Admin: "Tayyor quizlar" (qaysi papkalar ko'rinadi) va "O'qituvchilar" (statistika).

## Yashirilgan
AI nazorat, Jonli dars, Vazifalar, eski Sinflarim, Savol banki, Telegram bot, Discover — o'qituvchidan yashirilgan, kod va ma'lumot saqlangan (`client/src/lib/teacher-access.ts`). O'qituvchi test tuza olmaydi (`server/teacher-policy.ts`).

## Xavfsizlik
Havola orqali ishlanadigan testda to'g'ri javoblar brauzerga yuborilmaydi; har javob serverda tekshiriladi va natija serverda hisoblanadi (`server/shared-test.ts`).

Testlar: `tests/teacher-panel.test.ts`, `tests/teacher-work.test.ts`.
