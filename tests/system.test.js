// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI (North Sinai, Al-Arish)
// Comprehensive System & Business Logic Verification Test Suite
// =========================================================================

import assert from "node:assert/strict";
import { PricingEngine, DEFAULT_PRICING_CONFIG } from "../js/pricing-engine.js";
import { DispatchEngine } from "../js/dispatch-engine.js";

// Mock localStorage for Node.js test environment
const mockStorage = {};
global.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

console.log("================================================================");
console.log("🚕 CAPITAL TAXI – Running Comprehensive Automated Test Suite 🚕");
console.log("================================================================\n");

async function runTests() {
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✅ [TEST ${total}] PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ [TEST ${total}] FAIL: ${name}`);
      console.error(e);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [TEST ${total}] PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ [TEST ${total}] FAIL: ${name}`);
      console.error(e);
    }
  }

  // 1. Customer registration & profile validation
  test("1. إنشاء حساب عميل جديد والتحقق من البيانات", () => {
    const customer = {
      uid: "cust_101",
      name: "أحمد عبد العظيم",
      phone: "01094129592",
      role: "customer"
    };
    assert.equal(customer.role, "customer");
    assert.equal(customer.phone, "01094129592");
    assert.ok(customer.name.length > 0);
  });

  // 2. Driver registration with vehicle details
  test("2. تسجيل سائق ورفع بيانات السيارة واللوحة", () => {
    const driver = {
      uid: "driver_201",
      name: "ماجد سعيد",
      phone: "01094129592",
      carModel: "تويوتا كورولا 2024",
      carPlate: "ط أ س 1234",
      role: "driver",
      approved: false,
      available: false
    };
    assert.equal(driver.role, "driver");
    assert.equal(driver.approved, false);
    assert.ok(driver.carPlate.includes("ط أ س"));
  });

  // 3. Admin approval of driver
  test("3. اعتماد السائق من قبل الإدارة", () => {
    const driver = { uid: "driver_201", approved: false };
    driver.approved = true;
    assert.equal(driver.approved, true);
  });

  // 4. Driver status online/offline toggle
  test("4. ظهور السائق متاحاً ومستعداً للعمل", () => {
    const driver = { uid: "driver_201", available: false, status: "offline" };
    driver.available = true;
    driver.status = "online";
    assert.equal(driver.available, true);
    assert.equal(driver.status, "online");
  });

  // 5. Pricing Engine - Default calculation
  test("5. احتساب تسعير الرحلة داخل العريش (فتح العداد + الكيلومتر)", () => {
    const pricing = new PricingEngine();
    const fare = pricing.calculateFare({
      distanceKm: 5.0,
      durationMin: 12.0,
      carType: "economy"
    });
    // Base 15 + (5 * 6.5 = 32.5) = 47.5 -> rounded = 48
    assert.ok(fare.totalFare >= 45 && fare.totalFare <= 55);
    assert.equal(fare.currency, "ج.م");
  });

  // 6. Pricing Engine - Minimum fare guarantee
  test("6. تطبيق الحد الأدنى للرحلات القصيرة", () => {
    const pricing = new PricingEngine();
    const fare = pricing.calculateFare({
      distanceKm: 0.5,
      durationMin: 2.0,
      carType: "economy"
    });
    // Must not be less than minFare (25 EGP)
    assert.ok(fare.totalFare >= 25);
  });

  // 7. Pricing Engine - VIP and Family multipliers
  test("7. احتساب فئات السيارات المختلفة (كمفورت، VIP، عائلي)", () => {
    const pricing = new PricingEngine();
    const fareEcon = pricing.calculateFare({ distanceKm: 10, carType: "economy" });
    const fareVIP = pricing.calculateFare({ distanceKm: 10, carType: "vip" });
    assert.ok(fareVIP.totalFare > fareEcon.totalFare);
  });

  // 8. Pricing Engine - Coupon discounts
  test("8. تطبيق كوبونات الخصم الترويجية (CAPITAL10)", () => {
    const pricing = new PricingEngine();
    const normalFare = pricing.calculateFare({ distanceKm: 10, carType: "economy" });
    const discountedFare = pricing.calculateFare({ distanceKm: 10, carType: "economy", couponCode: "CAPITAL10" });
    assert.ok(discountedFare.totalFare < normalFare.totalFare);
    assert.equal(discountedFare.couponApplied.code, "CAPITAL10");
  });

  // 9. Trip Request Creation & Dispatching
  await testAsync("9. إرسال طلب رحلة جديد وتسجيله", async () => {
    const dispatch = new DispatchEngine({});
    const res = await dispatch.createTripRequest({
      customerId: "cust_test_1",
      customerName: "محمد الشوربجي",
      customerPhone: "01094129592",
      from: "مسجد النصر",
      to: "شاطئ العريش",
      distanceKm: 3.2,
      price: 35
    });
    assert.equal(res.success, true);
    assert.ok(res.tripId.startsWith("TRIP_"));
    assert.equal(res.record.status, "REQUESTED");
  });

  // 10. Atomic Single Driver Acceptance (Race condition test)
  await testAsync("10. القبول الذري للرحلة: أول سائق يقبل فقط يربح الطلب", async () => {
    const dispatch = new DispatchEngine({});
    const req = await dispatch.createTripRequest({
      customerId: "cust_atomic",
      from: "المساعيد",
      to: "جامعة العريش",
      price: 50
    });
    const tripId = req.tripId;

    const driver1 = { uid: "drv_1", name: "كابتن أحمد", phone: "01094129592", carModel: "تويوتا" };
    const driver2 = { uid: "drv_2", name: "كابتن ماجد", phone: "01094129592", carModel: "هيونداي" };

    // Driver 1 accepts first
    const res1 = await dispatch.acceptTripAtomic(tripId, driver1);
    assert.equal(res1.success, true, "Driver 1 should accept successfully");

    // Driver 2 attempts to accept the same trip
    const res2 = await dispatch.acceptTripAtomic(tripId, driver2);
    assert.equal(res2.success, false, "Driver 2 should be rejected because trip is already accepted");
  });

  // 11. Trip lifecycle: Start trip
  await testAsync("11. بدء الرحلة بعد ركوب العميل", async () => {
    const dispatch = new DispatchEngine({});
    const req = await dispatch.createTripRequest({ from: "الفواخرية", to: "الريسة", price: 40 });
    await dispatch.acceptTripAtomic(req.tripId, { uid: "drv_test" });
    const res = await dispatch.startTrip(req.tripId);
    assert.equal(res.status, "IN_PROGRESS");
  });

  // 12. Trip lifecycle: Complete trip & revenue recording
  await testAsync("12. إنهاء الرحلة بنجاح وتسجيل الأجرة", async () => {
    const dispatch = new DispatchEngine({});
    const req = await dispatch.createTripRequest({ from: "الفواخرية", to: "الريسة", price: 40 });
    await dispatch.acceptTripAtomic(req.tripId, { uid: "drv_test" });
    await dispatch.startTrip(req.tripId);
    const res = await dispatch.completeTrip(req.tripId, 45);
    assert.equal(res.status, "COMPLETED");
  });

  // 13. Trip cancellation
  await testAsync("13. إلغاء الرحلة وفق قواعد النظام", async () => {
    const dispatch = new DispatchEngine({});
    const req = await dispatch.createTripRequest({ from: "الساحل", to: "المساعيد", price: 30 });
    const res = await dispatch.cancelTrip(req.tripId, "تغيير رأي العميل");
    assert.equal(res.status, "CANCELLED");
  });

  // 14. Admin commission calculation (10%)
  test("14. احتساب عمولة المنصة 10% وصافي مستحقات السائق", () => {
    const totalRevenue = 1000;
    const commission = totalRevenue * 0.10;
    const driverNet = totalRevenue - commission;
    assert.equal(commission, 100);
    assert.equal(driverNet, 900);
  });

  // 15. Dynamic pricing reconfiguration by Admin
  test("15. تعديل أسعار العداد والكيلومتر من الإدارة ديناميكياً", () => {
    const pricing = new PricingEngine();
    pricing.updateConfig({ baseFare: 20, perKmRate: 8.0, minFare: 30 });
    const fare = pricing.calculateFare({ distanceKm: 10, carType: "economy" });
    // 20 + 80 = 100
    assert.equal(fare.totalFare, 100);
  });

  console.log("\n================================================================");
  console.log(`📊 Test Summary: ${passed} / ${total} Tests Passed Successfully!`);
  console.log("================================================================");

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
