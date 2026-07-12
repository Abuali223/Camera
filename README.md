# Sentinel AI — Hikvision/NIKVision kameralari uchun AI video nazorat platformasi

Sun'iy intellekt asosidagi real vaqt xavfsizlik nazorati: jonli kuzatuv devori, AI obyekt
aniqlash, xavfli vaziyatlarda avtomatik ogohlantirish (sirena + push + Telegram), muhim
daqiqalarda avtomatik surat olish va **ovozli buyruqlarni tushunadigan AI yordamchi**.

Interfeys to'liq o'zbek tilida, tungi/kunduzgi rejim mavjud.

## Imkoniyatlar

| Imkoniyat | Tavsif |
|---|---|
| 📺 Jonli devor | 2×2 / 3×3 / 4×4 kamera tarmog'i, jonli hodisalar lentasi |
| 🤖 AI aniqlash | Brauzerda TensorFlow.js (COCO-SSD): shaxs, transport, buyumlar |
| 🚨 Xavf ogohlantirishi | Cheklangan zonada shaxs → sirena, brauzer push, Telegram xabari |
| 📷 Suratlar | Xavfli hodisada avtomatik + "rasmga ol" buyrug'i bilan qo'lda, yuklab olish |
| 🎙 Ovozli yordamchi | "rasmga ol", "holatni ayt", "kamera 2 ni och", "sirena o'chir"… |
| 📊 Analitika | Signallar dinamikasi, aniqlash turlari, zonalar, KPI |
| 🎥 Kamera boshqaruvi | Jonli oqim (RTSP), ISAPI snapshot, PTZ zoom, obyekt xaritasi |

## Ishga tushirish (kompyuterda)

Talablar: [Node.js 18+](https://nodejs.org) va real kameralar uchun [ffmpeg](https://ffmpeg.org).

**Bitta buyruq** (IDE terminalida — Antigravity/VS Code) — o'rnatadi, ishga tushiradi
va brauzerni avtomatik ochadi:

```bash
npm run go
```

Keyingi safar (paketlar allaqachon o'rnatilgan bo'lsa) qisqasi ham yetadi:

```bash
npm start
```

Brauzer o'zi ochilmasa: http://localhost:8080

`server/cameras.json` fayli bo'lmasa dastur **DEMO rejimda** ishlaydi — simulyatsiya
qilingan 8 kamera bilan barcha funksiyalarni sinab ko'rishingiz mumkin.

## Real kameralarni ulash

1. `server/cameras.example.json` faylini `server/cameras.json` nomi bilan nusxalang
2. Har bir kamera uchun IP, login, parolni kiriting (Hikvision standart RTSP porti 554)
3. Serverni qayta ishga tushiring — dastur avtomatik REAL rejimga o'tadi

Kamera oqimi manzili: `rtsp://user:parol@IP:554/Streaming/Channels/101`
Snapshot va PTZ Hikvision **ISAPI** (digest auth) orqali ishlaydi.

### Telegram ogohlantirishlari

`cameras.json` ichida:
```json
"telegram": { "botToken": "123:ABC...", "chatId": "-100123456" }
```
Bot tokenini [@BotFather](https://t.me/BotFather) dan oling.

### Aqlli AI chat (ixtiyoriy)

`cameras.json` ichiga `"anthropicApiKey": "sk-ant-..."` qo'shsangiz, yordamchi lokal
buyruqlardan tashqari erkin savollarga ham Claude yordamida javob beradi.

## Ovozli buyruqlar

Yordamchi panelini ochib (o'ng pastdagi tugma) mikrofon belgisini bosing:

- **"rasmga ol"** / "kamera 3 ni rasmga ol" — surat olish
- **"holatni ayt"** — umumiy xavfsizlik hisoboti (ovozli javob)
- **"kamera 2 ni och"** — kamera batafsil ko'rinishi
- **"signallarni ko'rsat"**, "analitika", "jonli devor" — bo'limlar
- **"sirena o'chir / yoq"** — xavf sirenasini boshqarish
- **"ovozni o'chir / yoq"** — yordamchining ovozli javobini boshqarish
- **"hammasini tasdiqla"** — signallarni yopish

Surat **faqat siz buyurganingizda** yoki **yuqori xavfli vaziyatda** avtomatik olinadi.

> Ovoz tanish Chrome/Edge brauzerlarida ishlaydi. O'zbekcha ovoz tanish qo'llanmasa
> tizim avtomatik ruschaga o'tadi; matnli buyruqlar har doim o'zbekcha ishlaydi.
> Ovozli javob uchun brauzerda tayyor o'zbek ovozi bo'lmagani sabab eng yaqin
> tabiiy ovoz (turkcha/ruscha) tanlanadi; yordamchi faqat muhim xabarlarda gapiradi.

## Firebase'ga joylash (hosting)

Interfeys (demo rejim) Firebase Hosting'da bepul turadi:

```bash
npm install -g firebase-tools
firebase login
firebase projects:create sentinel-ai-kamera   # yoki mavjud loyihani tanlang
firebase deploy --only hosting
```

> **Muhim:** kameralar lokal tarmoqda bo'lgani uchun RTSP ko'prigi (`npm start`)
> kompyuteringizda ishlashi kerak. Firebase'dagi sahifa demo/interfeys uchun;
> real kameralar bilan ishlash uchun lokal server manzilini oching.

## Tuzilma

```
server/index.js          — lokal ko'prik: RTSP→MJPEG, ISAPI, Telegram, AI proxy
server/cameras.example.json — kamera konfiguratsiyasi namunasi
public/                  — webapp (Firebase Hosting'ga joylanadi)
  js/app.js              — asosiy logika, signallar, suratlar
  js/detector.js         — TensorFlow.js obyekt aniqlash
  js/assistant.js        — ovozli/matnli AI yordamchi
  js/stream.js           — jonli oqimlar (demo sahna / WS MJPEG)
firebase.json            — hosting konfiguratsiyasi
```
