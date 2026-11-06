# REDESIGN_BASELINE.md

## 1️⃣ ملخص المشروع
- **اسم المشروع:** تاكسي العاصمة (Capital Taxi)
- **المسار المحلي:** `C:/Users/ahmed/OneDrive/سطح المكتب/المشروع النهائي`
- **Firebase Project ID:** `taxi-alasema-app-2026` (موجود في `.firebaserc`)
- **Hosting Site ID:** `taxi-alasema` (موجود في `firebase.json`)
- **اللغة الأساسية:** العربية – RTL
- **التقنية الحالية**:
  - **HTML/CSS/JavaScript** (بدون إطار عمل واضح – يعتمد على ملفات ثابتة).
  - **Firebase SDK** (المستورد من ملفات `index.html` / `platform-firebase.html`).
  - **Google Maps JavaScript API** (مفتاح مخزن في بيئة السحابة – لا يظهر في الكود).
  - **Node.js** (مطلوب لتشغيل `server.cjs` و`npm test`).
  - **npm** (أو `uv` – لا توجد حزمة `package-lock.json` في الجذر، لكن توجد `devDependencies` في `package.json`).

## 2️⃣ بنية الملفات الأساسية (ملخص)
> تم استخراج القائمة الكاملة للملفات في `reports/project_file_list.txt`. إليك نظرة مختصرة:

| الفئة | عدد الملفات | مثال | ملاحظات |
|-------|--------------|------|----------|
| جذر المشروع | 20 | `index.html`, `firebase.json`, `server.cjs` | ملفات استضافة وتكوين.
| **assets/images** | 70+ | صور سيارات، صور WhatsApp، شعارات | جميعها بصيغة `jpeg` أو `jpg`.
| **css** | 2 | `styles.css`, `design-system.css` (لم يخلق بعد) | ملفات CSS العامة.
| **backups** | 1 (مجلد النسخة الاحتياطية) | `full_project_backup_20261106_1137.zip` | تم إنشاؤه في المرحلة 0.
| **reports** | 6 (تقارير سابقة) | `FINAL_PRE_DEPLOYMENT_CHECKLIST.md` … | سيتم إضافة تقارير جديدة.
| **functions** | لا توجد ملفات مصدرية حاليًا (مجلد فارغ). | — | لا تستخدم Cloud Functions في النسخة الحالية.
| **tests** | 5 | `system.test.js`, `images.test.js` … | اختبارات وحدة/اندماج.
| **.well-known** | 1 | `acme-challenge/k7-...` | ملف تحقق ACME.
| **ملفات إخفاء (dotfiles)** | 3 | `.firebaserc`, `.gitignore`, `.git` (مستتر) | غير مطروحة للنشر.

**المجموع التقريبي للملفات:** 120 ملف (بما في ذلك الصور).  
**عدد الملفات التي ستُنشر:** سيُستبعد كل ما في `ignore` من `firebase.json` + ما يبدأ بـ `.` + `node_modules/`, `tests/`, `backups/`, `reports/`, `functions/`. يقدر عدد الملفات القابلة للنشر بـ **≈ 70 ملف** (صفحات HTML, CSS, JS, الصور، ملفات التكوين العامة).

## 3️⃣ إعدادات Firebase Hosting (`firebase.json`)
```json
{
  "hosting": {
    "site": "taxi-alasema",
    "public": ".",
    "ignore": [
      "firebase.json",
      "**/.*",
      "!**/.well-known/**",
      "**/node_modules/**",
      "README.md",
      "tests/**",
      "backups/**",
      "reports/**",
      "functions/**",
      "firestore.rules",
      "storage.rules",
      "database.rules.json",
      "server.js",
      "server.cjs",
      "configstore_test.js",
      "index.admin-old.html",
      "package.json",
      "package-lock.json",
      "vercel.json"
    ],
    "headers": [
      { "source": ".well-known/acme-challenge/**", "headers": [{"key":"Content-Type","value":"text/plain; charset=utf-8"},{"key":"Cache-Control","value":"no-cache, no-store, must-revalidate"}]},
      { "source": "**/*.@(js|css|json)", "headers": [{"key":"Cache-Control","value":"public, max-age=3600"}]},
      { "source": "sw.js", "headers": [{"key":"Cache-Control","value":"no-cache, no-store, must-revalidate"}]}
    ],
    "rewrites": [{"source":"**","destination":"/index.html"}]
  }
}
```
- لا توجد قواعد تعديل لموقع أو DNS.
- `!**/.well-known/**` يضمن نشر ملف التحقق.
- كل ملفات الصور داخل `assets/images/` ليست ضمن `ignore` وبالتالي ستنشر.

## 4️⃣ إعدادات Firebase Project (`.firebaserc`)
```json
{
  "projects": {
    "default": "taxi-alasema-app-2026"
  }
}
```
> لا توجد أي مشاريع بديلة أو إعدادات إضافية.

## 5️⃣ حزم npm (من `package.json`)
```json
{
  "name": "capital-taxi-web-app",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.cjs",
    "dev": "node server.cjs",
    "test": "node tests/system.test.js && node tests/security.test.js"
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "^6.0.0",
    "firebase-admin": "^14.5.0"
  }
}
```
- لا توجد تبعيات إنتاجية (runtime) محددة؛ التطبيق يعتمد على SDK من CDN داخل HTML.
- **Node.js** مطلوب لتشغيل `server.cjs` (خادم تطوير بسيط) واختبارات.

## 6️⃣ ملفات البيئة والأسرار
- لا توجد ملفات `.env` داخل المشروع.
- مفاتيح Google Maps ومفاتيح Firebase مخزنة كمتغيرات بيئة في Firebase Console أو في ملفات غير منشورة (ليس في الشجرة الحالية).
- لا توجد مفاتيح سرية مُدمجة في ملفات الواجهة.

## 7️⃣ ملخص الفحوصات الأولية
- **نسخة احتياطية** تم إنشاؤها داخل `backups/full_project_backup_20261106_1137.zip`.
- تم توليد **قائمة شاملة للملفات** (`reports/project_file_list.txt`).
- تم استخراج جميع الإعدادات المهمة من `firebase.json` و`.firebaserc`.
- لا توجد ملفات `.env` أو أسرار ظاهرية.
- لا توجد أي Cloud Functions نشطة في المجلد `functions/` (مجلد فارغ).
- جميع الملفات الحساسة (قواعد الأمان، النسخ الاحتياطية، التقارير، الاختبارات) مُدرجة في `ignore` وبالتالي لن تُنشر.

## 8️⃣ الخطوات التالية (محددة في خطة التطوير)
1. **Design System** – إنشاء `css/design-system.css` ومكونات UI المشتركة. 
2. **إعادة تصميم الواجهات** للعميل، السائق، ولوحة الإدارة مع ربطها بقاعدة البيانات الحالية. 
3. **تحسين محرك Dispatch** وضمان العمليات الذرية. 
4. **اختبارات شاملة** باستخدام المحاكيات (`firebase emulators:start`). 
5. **توثيق كل مرحلة** داخل `reports/` وتحديث مستمر للملف `reports/PENDING_TASKS.md`.

---
*تم إنشاء هذا التقرير كجزء من المرحلة 0 (Baseline). سيُحدَّث مع تقدم العمل.*
