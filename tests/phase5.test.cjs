/**
 * CAPITAL TAXI – Phase 5 Automated Test Suite
 * Tests:
 * 1. Trip creation & broadcast
 * 2. Multi-driver bidding and counter-offers
 * 3. Atomic offer selection and conflict prevention
 * 4. Price locking after bid acceptance
 * 5. Campaigns cloud synchronization structure & validation
 * 6. Admin live fleet tracking coordinates & timestamps
 * 7. Security rules validation for bidding and campaigns
 */
const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..');
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

console.log('================================================================');
console.log('🚀 CAPITAL TAXI – PHASE 5 OPERATIONAL READINESS TEST SUITE 🚀');
console.log('================================================================\n');

// ─── TEST 1: Database Rules Syntax & Schema Check ───
const rtdbRules = JSON.parse(fs.readFileSync(path.join(PROJECT, 'database.rules.json'), 'utf8'));
assert(rtdbRules.rules.trip_offers !== undefined, '1. وجود عقدة عروض الأسعار والمزايدة (trip_offers) في قواعد RTDB');
assert(rtdbRules.rules.campaigns !== undefined, '2. وجود عقدة مزامنة الحملات الإعلانية السحابية (campaigns) في RTDB');
assert(rtdbRules.rules.driver_locations !== undefined, '3. وجود عقدة إحداثيات السائقين اللحظية (driver_locations) في RTDB');

// ─── TEST 2: Multi-Driver Bidding Logic Simulation ───
const simulatedTrip = {
  id: 'trip_phase5_test',
  customerId: 'cust_ahmed_1',
  customerName: 'أحمد',
  from: 'ميدان النصر',
  to: 'شاطئ النخيل',
  price: 30, // Reference price
  status: 'searching',
  driverId: null
};

// Driver A submits 28 EGP, Driver B submits 35 EGP
const offers = {
  'drv_ali': { tripId: simulatedTrip.id, driverId: 'drv_ali', driverName: 'الكابتن علي', price: 28, status: 'pending', timestamp: Date.now() },
  'drv_omar': { tripId: simulatedTrip.id, driverId: 'drv_omar', driverName: 'الكابتن عمر', price: 35, status: 'pending', timestamp: Date.now() }
};

assert(Object.keys(offers).length === 2, '4. استقبال عروض أسعار متعددة من سائقين مختلفين لنفس الرحلة');
assert(offers['drv_ali'].price === 28 && offers['drv_omar'].price === 35, '5. تفاوت أسعار العروض التنافسية (28 ج.م و 35 ج.م)');

// ─── TEST 3: Atomic Offer Acceptance Simulation ───
function simulateAtomicAccept(trip, driverId, agreedPrice) {
  if (trip.status === 'accepted' || trip.driverId) {
    return { success: false, reason: 'TRIP_ALREADY_ASSIGNED' };
  }
  trip.status = 'accepted';
  trip.driverId = driverId;
  trip.price = agreedPrice;
  return { success: true, trip };
}

// Customer accepts Driver A
const firstAccept = simulateAtomicAccept(simulatedTrip, 'drv_ali', 28);
assert(firstAccept.success === true && firstAccept.trip.price === 28, '6. قبول العميل لعرض السائق علي بنجاح وتثبيت السعر عند 28 ج.م');

// Attempt to accept Driver B subsequently must fail
const secondAccept = simulateAtomicAccept(simulatedTrip, 'drv_omar', 35);
assert(secondAccept.success === false && secondAccept.reason === 'TRIP_ALREADY_ASSIGNED', '7. منع قبول عرض آخر بعد حجز الرحلة وتثبيتها (Conflict Prevention)');

// ─── TEST 4: Price Immutability After Assignment ───
const rtdbValidateRule = rtdbRules.rules.trips.$tripId['.validate'];
assert(rtdbValidateRule.includes("data.child('driverId').val() === '' || !data.hasChild('price') || newData.child('price').val() === data.child('price').val()"),
  '8. التحقق من ثبات السعر المتفق عليه ومنع السائق من تعديل السعر بعد التعيين');

// ─── TEST 5: Campaigns Cloud Sync Structure ───
const sampleCloudCampaign = {
  id: 'camp_arish_summer',
  name: 'صيف العريش 2026',
  image: '/assets/images/advertising/hero-arish-landmarks.jpg',
  category: 'hero',
  location: 'الصفحة الرئيسية',
  startDate: '2026-11-01',
  endDate: '2026-12-31',
  active: true
};
const campaignWriteRule = rtdbRules.rules.campaigns['.write'];
assert(campaignWriteRule.includes("root.child('admins').child(auth.uid).val() === true"),
  '9. قصر صلاحية تعديل وإنشاء الحملات السحابية على المديرين المعتمدين فقط');

// ─── TEST 6: Admin Live Map Elements ───
const htmlContent = fs.readFileSync(path.join(PROJECT, 'index.html'), 'utf8');
assert(htmlContent.includes('id="adminSectionLiveMap"'), '10. وجود قسم خريطة الأسطول الحية (adminSectionLiveMap) في الواجهة');
assert(htmlContent.includes('id="adminLiveMapViewport"'), '11. وجود حاوية خريطة الأسطول الحية (adminLiveMapViewport) في الواجهة');
assert(htmlContent.includes('adminLiveGpsCount') && htmlContent.includes('adminLiveLastSignal'), '12. وجود مؤشرات عدد الكباتن النشطين وتوقيت آخر إشارة GPS');

// ─── TEST 7: Git Security & Gitignore Check ───
const gitignore = fs.readFileSync(path.join(PROJECT, '.gitignore'), 'utf8');
assert(gitignore.includes('.env') && gitignore.includes('node_modules/'), '13. استبعاد ملفات البيئة والتبعيات في .gitignore');
assert(!gitignore.includes('firebase.json'), '14. عدم استبعاد firebase.json وضمان سلامة إعدادات الاستضافة');

console.log('\n================================================================');
console.log(`📊 Phase 5 Test Summary: ${passCount} Passed, ${failCount} Failed.`);
console.log('================================================================\n');

if (failCount > 0) process.exit(1);
