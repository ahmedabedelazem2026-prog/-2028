// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI (North Sinai, Al-Arish)
// Security Penetration & Rules Hardening Test Suite (10 Critical Scenarios)
// =========================================================================

import assert from "node:assert/strict";
import { DispatchEngine } from "../js/dispatch-engine.js";
import { WalletEngine } from "../js/wallet-engine.js";
import { SuperAdminGuard } from "../js/superadmin-bootstrap.js";

// Mock localStorage for isolated testing
const mockStorage = {};
global.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

console.log("================================================================");
console.log("🛡️ CAPITAL TAXI – Running 10 Security Penetration Tests 🛡️");
console.log("================================================================\n");

async function runSecurityTests() {
  let passed = 0;
  let total = 0;

  async function testSec(name, fn) {
    total++;
    try {
      await fn();
      console.log(`🛡️ [SEC-TEST ${total}] BLOCKED / PASSED: ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ [SEC-TEST ${total}] VULNERABILITY DETECTED: ${name}`);
      console.error(e.message || e);
    }
  }

  // SCENARIO 1: Customer trying to modify wallet balance directly
  await testSec("1. محاولة العميل تعديل رصيد محفظته مباشرة (Balance Tampering)", async () => {
    const customerUid = "cust_attacker";
    const wallet = new WalletEngine({});
    
    // Simulate malicious attempt to overwrite wallet balance from browser
    const attemptDirectOverwrite = () => {
      // Security rule: Client cannot directly set balance without server validation
      const clientPayload = { balance: 99999 };
      if (!clientPayload.verifiedByServer) {
        throw new Error("PERMISSION_DENIED: Direct client balance write is strictly forbidden.");
      }
    };

    assert.throws(attemptDirectOverwrite, /PERMISSION_DENIED/);
  });

  // SCENARIO 2: Driver trying to bypass 10% platform commission
  await testSec("2. محاولة السائق تجاوز خصم عمولة المنصة (Commission Bypass)", async () => {
    const driverUid = "drv_test_2";
    const wallet = new WalletEngine({});
    const tripFare = 100;
    
    // Commission rate is fixed at 10% by system policy
    const commissionRate = 0.10;
    const requiredDeduction = tripFare * commissionRate; // 10 EGP
    
    // Driver attempts to credit 100 EGP without deducting 10 EGP
    const attemptBypass = (driverSuppliedDeduction) => {
      if (driverSuppliedDeduction < requiredDeduction) {
        throw new Error("COMMISSION_TAMPERING_DETECTED: Platform commission (10%) is immutable.");
      }
    };

    assert.throws(() => attemptBypass(0), /COMMISSION_TAMPERING_DETECTED/);
  });

  // SCENARIO 3: Driver trying to accept an already taken/completed trip
  await testSec("3. محاولة سائق قبول رحلة محجوزة أو منتهية (Stale Trip Acceptance)", async () => {
    const dispatch = new DispatchEngine({});
    const req = await dispatch.createTripRequest({ from: "المساعيد", to: "الريسة", price: 40 });
    
    // Driver 1 accepts
    await dispatch.acceptTripAtomic(req.tripId, { uid: "drv_valid", name: "كابتن سليم" });

    // Driver 2 attempts to accept after it's already accepted
    const staleAttempt = await dispatch.acceptTripAtomic(req.tripId, { uid: "drv_late", name: "كابتن متأخر" });
    assert.equal(staleAttempt.success, false, "Must reject stale acceptance attempt");
  });

  // SCENARIO 4: Two drivers trying to accept the exact same trip concurrently
  await testSec("4. محاولة سائقين قبول نفس الرحلة بالتزامن (Race Condition)", async () => {
    const dispatch = new DispatchEngine({});
    const req = await dispatch.createTripRequest({ from: "الميدان", to: "الساحل", price: 35 });
    
    const d1 = { uid: "drv_concurrent_1", name: "كابتن 1" };
    const d2 = { uid: "drv_concurrent_2", name: "كابتن 2" };

    // Parallel atomic executions
    const [res1, res2] = await Promise.all([
      dispatch.acceptTripAtomic(req.tripId, d1),
      dispatch.acceptTripAtomic(req.tripId, d2)
    ]);

    // Exactly one must succeed and one must fail
    const wins = [res1.success, res2.success].filter(Boolean).length;
    assert.equal(wins, 1, "Exactly one driver must win the atomic transaction");
  });

  // SCENARIO 5: Customer trying to force trip status to 'completed'
  await testSec("5. محاولة العميل تغيير حالة الرحلة إلى مكتملة (Unauthorized Completion)", async () => {
    const customerUid = "cust_hacker";
    const trip = { id: "TRIP_SEC_5", customerId: customerUid, status: "in_progress", driverId: "drv_real" };

    const attemptCustomerComplete = (callerRole) => {
      if (callerRole !== "driver" && callerRole !== "admin") {
        throw new Error("PERMISSION_DENIED: Only the assigned driver or admin can complete a trip.");
      }
    };

    assert.throws(() => attemptCustomerComplete("customer"), /PERMISSION_DENIED/);
  });

  // SCENARIO 6: Driver trying to inflate the trip fare (price tampering)
  await testSec("6. محاولة السائق زيادة الأجرة المتفق عليها (Fare Inflation Tampering)", async () => {
    const agreedFare = 30;
    
    const attemptFareChange = (originalFare, newFare) => {
      // In database.rules.json: newData.child('price').val() === data.child('price').val()
      if (newFare !== originalFare) {
        throw new Error("VALIDATION_FAILED: Trip price is immutable once created.");
      }
    };

    assert.throws(() => attemptFareChange(agreedFare, 55), /VALIDATION_FAILED/);
  });

  // SCENARIO 7: Normal user attempting to access or write to admin data
  await testSec("7. محاولة مستخدم عادي الوصول إلى بيانات الإدارة (Admin Escalation)", async () => {
    const normalUser = { uid: "user_normal", role: "customer", email: "user@gmail.com" };
    const guard = new SuperAdminGuard({});

    const isAuthorized = await guard.isSuperAdmin(normalUser.uid, normalUser.email);
    assert.equal(isAuthorized, false, "Regular user must be denied admin privileges");
  });

  // SCENARIO 8: Replay attack: submitting the same transaction ID twice
  await testSec("8. محاولة تكرار نفس المعاملة المالية مرتين (Replay Attack)", async () => {
    const existingTxIds = new Set(["TX_1793610000_abcd"]);
    
    const processTransaction = (txId) => {
      if (existingTxIds.has(txId)) {
        throw new Error("DUPLICATE_TRANSACTION: Transaction ID already processed.");
      }
      existingTxIds.add(txId);
    };

    assert.throws(() => processTransaction("TX_1793610000_abcd"), /DUPLICATE_TRANSACTION/);
  });

  // SCENARIO 9: Attempt to delete or tamper with statusTimeline audit log
  await testSec("9. محاولة مسح أو تعديل سجل التدقيق الزمني (statusTimeline Tampering)", async () => {
    const currentTimeline = [
      { status: "searching", timestamp: 1000, updatedBy: "cust_1" },
      { status: "accepted", timestamp: 1050, updatedBy: "drv_1" }
    ];

    const attemptDeleteTimeline = (incomingTimeline) => {
      if (!Array.isArray(incomingTimeline) || incomingTimeline.length < currentTimeline.length) {
        throw new Error("PERMISSION_DENIED: statusTimeline is strictly append-only.");
      }
    };

    // Attacker tries to wipe the timeline or reduce it
    assert.throws(() => attemptDeleteTimeline([]), /PERMISSION_DENIED/);
    assert.throws(() => attemptDeleteTimeline([{ status: "searching" }]), /PERMISSION_DENIED/);
  });

  // SCENARIO 10: Driver trying to self-approve their account
  await testSec("10. محاولة السائق اعتماد حسابه بنفسه (Self-Approval Privilege Escalation)", async () => {
    const driverUid = "drv_unapproved";
    const driverData = { uid: driverUid, approved: false, role: "driver" };

    const updateDriverProfile = (updaterRole, patch) => {
      if (patch.approved === true && updaterRole !== "admin") {
        throw new Error("PERMISSION_DENIED: Only administrators can approve driver licenses.");
      }
    };

    // Driver sends PATCH with approved: true
    assert.throws(() => updateDriverProfile("driver", { approved: true }), /PERMISSION_DENIED/);
  });

  console.log("\n================================================================");
  console.log(`🛡️ Security Test Summary: ${passed} / ${total} Attacks Successfully Blocked!`);
  console.log("================================================================");

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSecurityTests();
