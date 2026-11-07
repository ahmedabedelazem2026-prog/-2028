import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('================================================================');
console.log('🖼️ CAPITAL TAXI – Comprehensive Image Asset Verification Suite 🖼️');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ [PASS]: ${message}`);
    passCount++;
  } else {
    console.error(`❌ [FAIL]: ${message}`);
    failCount++;
  }
}

// 1. Check index.html exists
const indexPath = path.join(__dirname, '..', 'index.html');
assert(fs.existsSync(indexPath), 'ملف index.html موجود');

const html = fs.readFileSync(indexPath, 'utf8');

// 2. Extract all img tags
const imgRegex = /<img\s+([^>]+)>/gi;
const matches = [...html.matchAll(imgRegex)];
assert(matches.length > 0, `تم العثور على ${matches.length} عنصر <img> في الصفحة`);

// 3. Verify every image source exists on disk
const srcRegex = /src=["'](\/assets\/images\/[^"']+)["']/i;
const checkedSrcs = new Set();

matches.forEach((m, idx) => {
  const fullTag = m[0];
  const srcMatch = fullTag.match(srcRegex);
  if (srcMatch) {
    const webPath = srcMatch[1];
    // Skip template literal interpolations inside dynamic JS blocks
    if (webPath.includes('${')) return;
    checkedSrcs.add(webPath);
    const diskPath = path.join(__dirname, '..', webPath.replace(/^\//, ''));
    const exists = fs.existsSync(diskPath);
    assert(exists, `صورة رقم ${idx + 1}: المسار ${webPath} موجود فعلياً على القرص`);
  }
});

// 4. Verify all img tags have onerror fallback
matches.forEach((m, idx) => {
  const fullTag = m[0];
  const hasOnError = fullTag.includes('onerror=');
  assert(hasOnError, `صورة رقم ${idx + 1}: تحتوي على خاصية onerror fallback لمنع الروابط المعطلة`);
});

// 5. Verify all img tags have alt text
matches.forEach((m, idx) => {
  const fullTag = m[0];
  const hasAlt = /alt=["'][^"']+["']/i.test(fullTag);
  assert(hasAlt, `صورة رقم ${idx + 1}: تحتوي على نص بديل (alt) وصفي واضح`);
});

// 6. Check styles.css rules for aspect ratios and object-fit
const cssPath = path.join(__dirname, '..', 'css', 'styles.css');
assert(fs.existsSync(cssPath), 'ملف css/styles.css موجود');
const css = fs.readFileSync(cssPath, 'utf8');

assert(css.includes('aspect-ratio: 16 / 9') || css.includes('aspect-ratio: 16/9'), 'تطبيق نسبة العرض للارتفاع 16:9 للبانر ومعرض الصور');
assert(css.includes('aspect-ratio: 4 / 3') || css.includes('aspect-ratio: 4/3'), 'تطبيق نسبة العرض للارتفاع 4:3 لبطاقات الخدمات والسيارات');
assert(css.includes('aspect-ratio: 1 / 1') || css.includes('aspect-ratio: 1/1'), 'تطبيق نسبة 1:1 للأيقونات وصور السائق والمعالم');
assert(css.includes('object-fit: cover'), 'تطبيق object-fit: cover لملء الحاويات دون تشويه');
assert(css.includes('object-fit: contain'), 'تطبيق object-fit: contain للشعارات والأيقونات');

// 7. Check backup directory integrity
const backupDir = path.join(__dirname, '..', 'backups', 'images_original_backup');
assert(fs.existsSync(backupDir), 'مجلد النسخة الاحتياطية backups/images_original_backup موجود');
const backupFiles = fs.readdirSync(backupDir);
assert(backupFiles.length >= 100, `النسخ الاحتياطية تحتوي على ${backupFiles.length} ملف أصلي محفوظ بأمان`);

console.log('\n================================================================');
console.log(`📊 Image Suite Summary: ${passCount} Passed, ${failCount} Failed.`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
}
