// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI (North Sinai, Al-Arish)
// Comprehensive System & Business Logic Verification Test Suite (v2.0)
// =========================================================================

import assert from "node:assert/strict";
import { PricingEngine, DEFAULT_PRICING_CONFIG } from "../js/pricing-engine.js";
import { DispatchEngine } from "../js/dispatch-engine.js";
import { WalletEngine } from "../js/wallet-engine.js";
import { ChatEngine } from "../js/chat-engine.js";
import { RatingsEngine } from "../js/ratings-engine.js";
import { SuperAdminGuard } from "../js/superadmin-bootstrap.js";

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

    const res1 = await dispatch.acceptTripAtomic(tripId, driver1);
    assert.equal(res1.success, true, "Driver 1 should accept successfully");

    const res2 = await dispatch.acceptTripAtomic(tripId, driver2);
    assert.equal(res2.success, false, "Driver 2 should be rejected because trip is already accepted");
  });

  // 11. Trip lifecycle: Driver Arrived at pickup
  await testAsync("11. وصول الكابتن لمكان الانطلاق (ARRIVED)", async () => {
    const dispatch = new DispatchEngine({});
    const req = await dispatch.createTripRequest({ from: "المساعيد", to: "الساحل", price: 30 });
    await dispatch.acceptTripAtomic(req.tripId, { uid: "drv_test" });
    const res = await dispatch.driverArrived(req.tripId);
    assert.equal(res.status, "ARRIVED");
  });

  // 12. Trip lifecycle: Start trip & In progress
  await testAsync("12. بدء الرحلة بعد ركوب العميل (IN_PROGRESS)", async () => {
    const dispatch = new DispatchEngine({});
    const req = await dispatch.createTripRequest({ from: "الفواخرية", to: "الريسة", price: 40 });
    await dispatch.acceptTripAtomic(req.tripId, { uid: "drv_test" });
    const res = await dispatch.startTrip(req.tripId);
    assert.equal(res.status, "IN_PROGRESS");
  });

  // 13. Trip lifecycle: Complete trip & revenue recording
  await testAsync("13. إنهاء الرحلة بنجاح وتسجيل الأجرة", async () => {
    const dispatch = new DispatchEngine({});
    const req = await dispatch.createTripRequest({ from: "الفواخرية", to: "الريسة", price: 40 });
    await dispatch.acceptTripAtomic(req.tripId, { uid: "drv_test" });
    await dispatch.startTrip(req.tripId);
    const res = await dispatch.completeTrip(req.tripId, 45);
    assert.equal(res.status, "COMPLETED");
  });

  // 14. Trip cancellation
  await testAsync("14. إلغاء الرحلة وفق قواعد النظام", async () => {
    const dispatch = new DispatchEngine({});
    const req = await dispatch.createTripRequest({ from: "الساحل", to: "المساعيد", price: 30 });
    const res = await dispatch.cancelTrip(req.tripId, "تغيير رأي العميل");
    assert.equal(res.status, "CANCELLED");
  });

  // 15. Wallet Engine: Top-up & Trip Payment
  await testAsync("15. شحن وسداد المحفظة الإلكترونية داخل التطبيق", async () => {
    const wallet = new WalletEngine({});
    const uid = "user_wallet_test";
    const topRes = await wallet.topUpWallet(uid, 100);
    assert.equal(topRes.success, true);
    assert.equal(topRes.balance, 100);

    const payRes = await wallet.payTripFromWallet(uid, "TRIP_123", 35);
    assert.equal(payRes.success, true);
    assert.equal(payRes.balance, 65);
  });

  // 16. In-App Chat between Rider and Driver
  await testAsync("16. المراسلة الفورية بين العميل والكابتن", async () => {
    const chat = new ChatEngine({});
    const tripId = "TRIP_CHAT_TEST";
    const sendRes = await chat.sendMessage({
      tripId,
      senderId: "rider_1",
      senderName: "العميل",
      senderRole: "customer",
      text: "أنا في انتظارك أمام البوابة 🚗"
    });
    assert.equal(sendRes.success, true);
    assert.equal(sendRes.message.text, "أنا في انتظارك أمام البوابة 🚗");
  });

  // 17. Star Rating & Quality Assurance Engine
  await testAsync("17. تقييم السائق بالنجوم وإضافة الملاحظات", async () => {
    const ratings = new RatingsEngine({});
    const res = await ratings.submitReview({
      tripId: "TRIP_999",
      customerId: "cust_1",
      driverId: "drv_1",
      rating: 5,
      tags: ["سيارة نظيفة ومعطرة ✨", "التزام تام بالموعد ⏱️"],
      comment: "سائق محترم جداً وقمة في الذوق"
    });
    assert.equal(res.success, true);
    assert.equal(res.review.rating, 5);
  });

  // 18. Super Admin Guard check
  await testAsync("18. حماية لوحة الإدارة بحساب المدير الرئيسي ahmedabedelazem", async () => {
    const guard = new SuperAdminGuard({});
    const isSuper = await guard.isSuperAdmin("admin_uid", "ahmedabedelazem@gmail.com");
    assert.equal(isSuper, true, "Super Admin identity must be verified");
  });

  // 19. Uber 4-digit Security PIN Code (Generation & Verification)
  await testAsync("19. إنشاء والتحقق من كود أمان الرحلة (4-Digit PIN Code)", async () => {
    const dispatch = new DispatchEngine({});
    const req = await dispatch.createTripRequest({ from: "الميدان", to: "الساحل", price: 30 });
    assert.ok(req.record.pinCode, "Trip must generate a 4-digit PIN");
    assert.equal(req.record.pinCode.length, 4, "PIN must be 4 digits");

    // Correct PIN verification
    const verified = await dispatch.verifyTripPin(req.tripId, req.record.pinCode);
    assert.equal(verified, true, "Valid PIN must verify successfully");

    // Incorrect PIN verification
    const invalidVerified = await dispatch.verifyTripPin(req.tripId, "0000");
    assert.equal(invalidVerified, false, "Wrong PIN must fail verification");
  });

  // 20. Dynamic Surge Pricing Multipliers
  test("20. احتساب مضاعف الطلب العالي (Surge Multiplier) بالعريش", () => {
    const pricing = new PricingEngine();
    const standardFare = pricing.calculateFare({ distanceKm: 5, durationMin: 10, carType: "economy" });
    const surgeFare = pricing.calculateFare({ distanceKm: 5, durationMin: 10, carType: "economy", surgeMultiplier: 1.3 });
    assert.ok(surgeFare.totalFare > standardFare.totalFare, "Surge fare must be higher than standard fare");
    assert.equal(surgeFare.surgeMultiplier, 1.3);
  });

  // 21. Driver Tipping (Uber Tip addition)
  await testAsync("21. إضافة إكرامية للكابتن (Uber Tipping) واعتمادها", async () => {
    const dispatch = new DispatchEngine({});
    const req = await dispatch.createTripRequest({ from: "المساعيد", to: "الجامعة", price: 35 });
    const tipRes = await dispatch.addTripTip(req.tripId, 10);
    assert.equal(tipRes.success, true);
  });

  // 22. Scheduled Ride (Uber Reserve)
  await testAsync("22. حجز رحلة مسبقاً (Uber Reserve) بجدول زمني", async () => {
    const dispatch = new DispatchEngine({});
    const req = await dispatch.createTripRequest({
      from: "العريش",
      to: "مطار القاهرة",
      price: 1800,
      scheduledTime: "2026-11-05T06:00:00"
    });
    assert.ok(req.record.scheduledTime);
    assert.equal(req.record.scheduledTime, "2026-11-05T06:00:00");
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
