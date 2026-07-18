# YouTube O'zbek Tarjimon (brauzer kengaytmasi)

YouTube'dagi inglizcha (yoki istalgan tildagi) subtitrlarni **real vaqtda o'zbek
tiliga** tarjima qilib, video ustida ko'rsatadigan Chrome/Edge kengaytmasi.

Inglizcha darslarni endi o'zbekcha subtitr bilan ko'rish mumkin — hech qanday
API kalit yoki ro'yxatdan o'tish kerak emas.

## Qanday ishlaydi

1. Siz videoda **CC (subtitr)** tugmasini yoqasiz (inglizcha yoki
   "auto-generated" avtomatik subtitr ham bo'laveradi).
2. Kengaytma pleerdagi subtitr matnini kuzatib turadi.
3. Har bir jumla Google Translate orqali o'zbekchaga tarjima qilinadi va
   video pastida sariq panel ko'rinishida chiqadi.
4. Bir marta tarjima qilingan jumlalar keshda saqlanadi — takrorlanganda
   internetga qayta so'rov ketmaydi.

## O'rnatish (Chrome / Edge / Yandex Browser)

1. Ushbu `youtube-uzbek-translator` papkasini kompyuterga yuklab oling.
2. Brauzerda `chrome://extensions` sahifasini oching.
3. O'ng yuqoridagi **Developer mode** (Dasturchi rejimi) ni yoqing.
4. **Load unpacked** (Paketlanmagan kengaytmani yuklash) tugmasini bosib,
   shu papkani tanlang.
5. YouTube'da istalgan videoni oching, **CC** tugmasini yoqing — pastda
   o'zbekcha tarjima paydo bo'ladi.

## Sozlamalar

Brauzer panelidagi kengaytma belgisini bosing:

- **Tarjima yoqilgan** — yoqish/o'chirish.
- **Rejim** — "Asl + O'zbekcha" (ikkalasi ko'rinadi) yoki
  "Faqat O'zbekcha" (inglizcha subtitr yashiriladi).
- **Shrift** — tarjima matnining kattaligi.

## Cheklovlar

- Videoda subtitr (oddiy yoki avtomatik) bo'lishi shart — tarjima subtitr
  matnidan olinadi. Deyarli barcha inglizcha darslarda avtomatik subtitr bor.
- Tarjima mashina tarjimasi (Google Translate), shuning uchun texnik
  atamalarda ba'zan noaniqlik bo'lishi mumkin.
- Avtomatik subtitrlarda YouTube'ning o'zi xato qilsa, tarjima ham shunga
  qarab chiqadi.

## Fayllar

| Fayl | Vazifasi |
|------|----------|
| `manifest.json` | Kengaytma tavsifi (Manifest V3) |
| `content.js` | Subtitrni kuzatish, tarjima qilish, ekranga chiqarish |
| `styles.css` | Tarjima panelining ko'rinishi |
| `popup.html` / `popup.js` | Sozlamalar oynasi |
