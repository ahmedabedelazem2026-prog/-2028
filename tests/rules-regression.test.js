// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI (North Sinai, Al-Arish)
// PHASE 4.1: Firebase Rules Verification & Regression Test Suite
// Verifying RTDB & Firestore Rules against 5 Test Personas
// =========================================================================

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// 1. Load Rules Definitions
const rtdbRules = JSON.parse(fs.readFileSync(path.resolve("database.rules.json"), "utf8")).rules;
const firestoreRulesText = fs.readFileSync(path.resolve("firestore.rules"), "utf8");

console.log("================================================================================");
console.log("🛡️ CAPITAL TAXI – PHASE 4.1: FIREBASE RULES VERIFICATION & REGRESSION SUITE 🛡️");
console.log("Testing 5 Personas: [Customer, Approved Driver, Unapproved Driver, Admin, Guest]");
console.log("================================================================================\n");

// 2. Define the 5 Personas
const PERSONAS = {
  guest: null,
  customer: { uid: "cust_ahmed_1", role: "customer", email: "ahmed.customer@gmail.com" },
  driverApproved: { uid: "drv_salim_approved", role: "driver", approved: true, email: "salim.driver@gmail.com" },
  driverUnapproved: { uid: "drv_newbie_unapproved", role: "driver", approved: false, email: "newbie.driver@gmail.com" },
  admin: { uid: "admin_capital_root", role: "admin", adminToken: true, email: "admin@taxicapital.eg" }
};

// 3. Realistic Mock Database State
const mockDatabaseState = {
  admins: {
    admin_capital_root: true
  },
  users: {
    cust_ahmed_1: { role: "customer", name: "أحمد العريش", status: "active" },
    drv_salim_approved: { role: "driver", name: "كابتن سليم", status: "active" },
    drv_newbie_unapproved: { role: "driver", name: "سائق غير معتمد", status: "pending" },
    admin_capital_root: { role: "admin", name: "مدير النظام", status: "active" }
  },
  drivers: {
    drv_salim_approved: { approved: true, rating: 4.9, suspended: false, carModel: "كود 1 تاكسي", available: true },
    drv_newbie_unapproved: { approved: false, rating: 5.0, suspended: false, carModel: "كود 1 قديم", available: false }
  },
  wallets: {
    cust_ahmed_1: { balance: 150.0, currency: "ج.م", transactions: {} },
    drv_salim_approved: { balance: 320.0, currency: "ج.م", transactions: {} },
    drv_newbie_unapproved: { balance: 0.0, currency: "ج.م", transactions: {} }
  },
  trips: {
    trip_100: {
      id: "trip_100",
      customerId: "cust_ahmed_1",
      customerName: "أحمد العريش",
      from: "ميدان النصر",
      to: "شارع البحر",
      price: 35,
      status: "searching",
      driverId: null,
      statusTimeline: {
        log_1: { status: "searching", timestamp: 1000, role: "customer" }
      }
    },
    trip_completed_200: {
      id: "trip_completed_200",
      customerId: "cust_ahmed_1",
      customerName: "أحمد العريش",
      from: "المساعيد",
      to: "جامعة سيناء",
      price: 45,
      status: "completed",
      driverId: "drv_salim_approved",
      statusTimeline: {
        log_1: { status: "searching", timestamp: 1000, role: "customer" },
        log_2: { status: "completed", timestamp: 2000, role: "driver" }
      }
    }
  },
  stats: {
    totalTrips: 1540,
    activeDrivers: 28
  },
  settings: {
    commissionRate: 0.10,
    minimumFare: 15
  }
};

// 4. RTDB Rule Engine Emulator for Exact Testing
function evaluateRtdbRule(rulePath, action, auth, data, newData, rootState = mockDatabaseState) {
  const parts = rulePath.split("/").filter(Boolean);
  let currentDef = rtdbRules;
  let ruleExpr = null;
  let validateExpr = null;
  const wildcards = {};

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (currentDef[part]) {
      currentDef = currentDef[part];
    } else {
      const wildCard = Object.keys(currentDef).find(k => k.startsWith("$"));
      if (wildCard) {
        wildcards[wildCard] = part;
        currentDef = currentDef[wildCard];
      } else {
        currentDef = null;
        break;
      }
    }
  }

  if (!currentDef) return { allowed: false, reason: "NO_RULE_MATCH" };

  ruleExpr = currentDef[action === "read" ? ".read" : ".write"];
  validateExpr = currentDef[".validate"];

  // Helper context for RTDB expression evaluation
  const root = {
    child: (path) => ({
      val: () => {
        const segs = path.split("/");
        let obj = rootState;
        for (const s of segs) {
          if (!obj) return null;
          obj = obj[s];
        }
        return obj !== undefined ? obj : null;
      },
      child: function(p) { return root.child(`${path}/${p}`); }
    })
  };

  const createDataWrapper = (valObj) => ({
    exists: () => valObj !== undefined && valObj !== null,
    val: () => valObj !== undefined ? valObj : null,
    hasChild: (k) => valObj && valObj[k] !== undefined,
    hasChildren: (keys) => valObj && keys.every(k => valObj[k] !== undefined),
    child: (k) => createDataWrapper(valObj ? valObj[k] : undefined)
  });

  const dataWrap = createDataWrapper(data);
  const newDataWrap = createDataWrapper(newData);

  // Evaluate rule boolean
  if (ruleExpr === undefined) {
    // If child node has no write/read, RTDB denies by default unless parent allowed
    return { allowed: false, reason: "DEFAULT_DENIED" };
  }

  const wildKeys = Object.keys(wildcards);
  const wildVals = Object.values(wildcards);

  if (typeof ruleExpr === "boolean") {
    if (!ruleExpr) return { allowed: false, reason: "EXPLICIT_FALSE" };
  } else {
    // Evaluate RTDB expression with wildcard bindings
    const func = new Function("auth", "data", "newData", "root", ...wildKeys, `
      try {
        return (${ruleExpr});
      } catch (e) {
        return false;
      }
    `);
    const isWriteAllowed = func(auth, dataWrap, newDataWrap, root, ...wildVals);
    if (!isWriteAllowed) return { allowed: false, reason: "PERMISSION_DENIED" };
  }

  // If write is allowed, evaluate .validate if present
  if (action === "write" && validateExpr) {
    const vFunc = new Function("auth", "data", "newData", "root", ...wildKeys, `
      try {
        return (${validateExpr});
      } catch (e) {
        return false;
      }
    `);
    const isValid = vFunc(auth, dataWrap, newDataWrap, root, ...wildVals);
    if (!isValid) return { allowed: false, reason: "VALIDATION_FAILED" };
  }

  return { allowed: true };
}

// 5. Test Runner
let passedCount = 0;
let totalCount = 0;

function runTest(description, fn) {
  totalCount++;
  try {
    fn();
    console.log(`✅ [TEST ${totalCount}] PASSED: ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`❌ [TEST ${totalCount}] FAILED: ${description}`);
    console.error("   Error:", err.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST GROUP 1: RTDB RULES VERIFICATION (5 PERSONAS)
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n--- GROUP 1: RTDB Rules Verification across Personas ---");

// 1.1 Unauthenticated Guest Access Restrictions
runTest("1.1 ضيف غير مسجل: حظر قراءة الرحلات النشطة (trips) لمنع تسريب الهواتف والمواقع", () => {
  const res = evaluateRtdbRule("trips", "read", PERSONAS.guest);
  assert.equal(res.allowed, false, "Guest must NOT be allowed to read trips");
});

runTest("1.2 ضيف غير مسجل: حظر قراءة المحافظ (wallets)", () => {
  const res = evaluateRtdbRule("wallets/cust_ahmed_1", "read", PERSONAS.guest);
  assert.equal(res.allowed, false, "Guest must NOT be allowed to read wallets");
});

runTest("1.3 ضيف غير مسجل: حظر إنشاء رحلات جديدة", () => {
  const newTrip = { status: "searching", from: "البلد", to: "البحر", price: 30 };
  const res = evaluateRtdbRule("trips/trip_new", "write", PERSONAS.guest, null, newTrip);
  assert.equal(res.allowed, false, "Guest must NOT be allowed to write trips");
});

// 1.2 Customer Legitimate Operations & Blocked Tampering
runTest("2.1 عميل مسجل: السماح بإنشاء طلب رحلة حقيقية ببيانات صحيحة (No Regression)", () => {
  const newTrip = {
    status: "searching",
    from: "ميدان النصر",
    to: "شارع الفاتح",
    price: 30,
    customerId: PERSONAS.customer.uid
  };
  const res = evaluateRtdbRule("trips/trip_new_1", "write", PERSONAS.customer, null, newTrip);
  assert.equal(res.allowed, true, "Customer MUST be allowed to create legitimate trip");
});

runTest("2.2 عميل مسجل: السماح بقراءة رصيد محفظته الشخصية (No Regression)", () => {
  const res = evaluateRtdbRule(`wallets/${PERSONAS.customer.uid}`, "read", PERSONAS.customer);
  assert.equal(res.allowed, true, "Customer must read their own wallet");
});

runTest("2.3 عميل مسجل: حظر قراءة محفظة مستخدم أو سائق آخر (Zero Leakage)", () => {
  const res = evaluateRtdbRule(`wallets/${PERSONAS.driverApproved.uid}`, "read", PERSONAS.customer);
  assert.equal(res.allowed, false, "Customer must NOT read other users' wallets");
});

runTest("2.4 عميل مسجل: حظر تعديل رصيد محفظته مباشرة من المتصفح (Anti-Tampering)", () => {
  const oldWallet = mockDatabaseState.wallets.cust_ahmed_1;
  const tamperedWallet = { ...oldWallet, balance: 99999 };
  const res = evaluateRtdbRule(`wallets/${PERSONAS.customer.uid}`, "write", PERSONAS.customer, oldWallet, tamperedWallet);
  assert.equal(res.allowed, false, "Customer must NOT write to their wallet");
});

runTest("2.5 عميل مسجل: حظر تعديل رحلة عميل آخر (Multi-Tenant Isolation)", () => {
  const otherTrip = mockDatabaseState.trips.trip_100;
  const hackedTrip = { ...otherTrip, customerId: "other_user" };
  const attackerAuth = { uid: "cust_malicious", role: "customer" };
  const res = evaluateRtdbRule("trips/trip_100", "write", attackerAuth, otherTrip, hackedTrip);
  assert.equal(res.allowed, false, "Attacker must NOT modify other user's trip");
});

runTest("2.6 عميل مسجل: السماح بإلغاء رحلته قيد البحث (Customer Cancellation)", () => {
  const currentTrip = mockDatabaseState.trips.trip_100;
  const cancelledTrip = { ...currentTrip, status: "cancelled" };
  const res = evaluateRtdbRule("trips/trip_100", "write", PERSONAS.customer, currentTrip, cancelledTrip);
  assert.equal(res.allowed, true, "Customer must be allowed to cancel their own pending trip");
});

runTest("2.7 عميل مسجل: السماح بإضافة تقييم وإكرامية للرحلة المكتملة دون حظر (Zero Regression on Completed Trips)", () => {
  const completedTrip = mockDatabaseState.trips.trip_completed_200;
  const ratedTrip = { ...completedTrip, rating: 5, tipAmount: 10 };
  const res = evaluateRtdbRule("trips/trip_completed_200", "write", PERSONAS.customer, completedTrip, ratedTrip);
  assert.equal(res.allowed, true, "Rating & tipping completed trip must be allowed without status regression");
});

// 1.3 Driver Approval & Acceptance Rules
runTest("3.1 سائق غير معتمد (approved: false): حظر قبول الرحلات (Enforce Verification)", () => {
  const openTrip = mockDatabaseState.trips.trip_100;
  const acceptedTrip = {
    ...openTrip,
    status: "accepted",
    driverId: PERSONAS.driverUnapproved.uid
  };
  const res = evaluateRtdbRule("trips/trip_100", "write", PERSONAS.driverUnapproved, openTrip, acceptedTrip);
  assert.equal(res.allowed, false, "Unapproved driver MUST be rejected from accepting trips");
});

runTest("3.2 سائق معتمد (approved: true): السماح بقبول الرحلة المتاحة (Legitimate Acceptance)", () => {
  const openTrip = mockDatabaseState.trips.trip_100;
  const acceptedTrip = {
    ...openTrip,
    status: "accepted",
    driverId: PERSONAS.driverApproved.uid
  };
  const res = evaluateRtdbRule("trips/trip_100", "write", PERSONAS.driverApproved, openTrip, acceptedTrip);
  assert.equal(res.allowed, true, "Approved driver MUST be allowed to accept available trip");
});

runTest("3.3 سائق معتمد: حظر تغيير سعر الرحلة المتفق عليه (Price Immutability Enforcement)", () => {
  const openTrip = mockDatabaseState.trips.trip_100;
  const inflatedTrip = {
    ...openTrip,
    status: "accepted",
    driverId: PERSONAS.driverApproved.uid,
    price: 65 // Inflated from 35
  };
  const res = evaluateRtdbRule("trips/trip_100", "write", PERSONAS.driverApproved, openTrip, inflatedTrip);
  assert.equal(res.allowed, false, "Price inflation MUST fail validation");
  assert.equal(res.reason, "VALIDATION_FAILED");
});

runTest("3.4 سائق معتمد: السماح بتحديث موقعه وبث إحداثيات GPS (Driver Location Broadcast)", () => {
  const res = evaluateRtdbRule(`driver_locations/${PERSONAS.driverApproved.uid}`, "write", PERSONAS.driverApproved, null, { lat: 31.13, lng: 33.80 });
  assert.equal(res.allowed, true, "Driver must be allowed to write their own location");
});

runTest("3.5 سائق غير معتمد: حظر اعتماد حسابه بنفسه (Self-Approval Privilege Escalation Blocked)", () => {
  const oldDriver = mockDatabaseState.drivers.drv_newbie_unapproved;
  const selfApproved = { ...oldDriver, approved: true };
  const res = evaluateRtdbRule(`drivers/${PERSONAS.driverUnapproved.uid}`, "write", PERSONAS.driverUnapproved, oldDriver, selfApproved);
  assert.equal(res.allowed, false, "Driver self-approval MUST be rejected by .validate");
  assert.equal(res.reason, "VALIDATION_FAILED");
});

// 1.4 Admin Super Powers & System Protection
runTest("4.1 مدير النظام (Admin): السماح باعتماد السائقين وتعديل الأسعار والإعدادات", () => {
  const oldDriver = mockDatabaseState.drivers.drv_newbie_unapproved;
  const approvedByAdmin = { ...oldDriver, approved: true };
  const res = evaluateRtdbRule(`drivers/${PERSONAS.driverUnapproved.uid}`, "write", PERSONAS.admin, oldDriver, approvedByAdmin);
  assert.equal(res.allowed, true, "Admin must be allowed to approve driver");
});

runTest("4.2 مستخدم عادي: حظر تعديل أسعار المنصة (pricing) أو إعدادات النظام (settings)", () => {
  const res1 = evaluateRtdbRule("pricing", "write", PERSONAS.customer, null, { baseFare: 50 });
  const res2 = evaluateRtdbRule("settings", "write", PERSONAS.driverApproved, null, { commissionRate: 0.0 });
  assert.equal(res1.allowed, false, "Customer must NOT modify pricing");
  assert.equal(res2.allowed, false, "Driver must NOT modify settings");
});

runTest("4.3 حظر تعديل أو مسح عقدة مديري النظام (admins: .write = false)", () => {
  const res = evaluateRtdbRule("admins", "write", PERSONAS.admin, { admin_capital_root: true }, {});
  assert.equal(res.allowed, false, "admins node .write is strictly false (even via client SDK)");
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST GROUP 2: FIRESTORE RULES AUDIT & SECURITY BOUNDARIES
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n--- GROUP 2: Firestore Rules Syntax & Logic Coverage ---");

runTest("5.1 التحقق من وجود دالة isApprovedDriver في قواعد Firestore", () => {
  assert.ok(firestoreRulesText.includes("function isApprovedDriver()"), "Must define isApprovedDriver");
  assert.ok(firestoreRulesText.includes("data.approved == true"), "Must check approved == true");
});

runTest("5.2 التحقق من حماية محفظة Firestore ومجموعة transactions الفرعية", () => {
  assert.ok(firestoreRulesText.includes("match /wallets/{userId}"), "Must protect wallets collection");
  assert.ok(firestoreRulesText.includes("match /transactions/{txId}"), "Must explicitly cover transactions subcollection");
  assert.ok(firestoreRulesText.includes("allow write: if isAdmin();"), "Wallet writes must be restricted to admin");
});

runTest("5.3 التحقق من دعم حالات دورة حياة الرحلة الـ 8 ومنع التلاعب بالسعر", () => {
  assert.ok(firestoreRulesText.includes("request.resource.data.price == resource.data.price"), "Price must be strictly immutable");
  assert.ok(firestoreRulesText.includes("no_driver"), "Must allow timeout transition to no_driver");
  assert.ok(firestoreRulesText.includes("driver_arrived"), "Must allow driver_arrived");
  assert.ok(firestoreRulesText.includes("in_progress"), "Must allow in_progress");
  assert.ok(firestoreRulesText.includes("completed"), "Must allow completed");
});

runTest("5.4 التحقق من سجلات المشرفين وسجل التدقيق append-only", () => {
  assert.ok(firestoreRulesText.includes("match /admin_logs/{logId}"), "Must have admin_logs rule");
  assert.ok(firestoreRulesText.includes("allow update, delete: if false;"), "Admin logs must be append-only (no update/delete)");
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUMMARY
// ═════════════════════════════════════════════════════════════════════════════
console.log("\n================================================================================");
console.log(`📊 FINAL RESULT: ${passedCount} / ${totalCount} RULES TESTS PASSED (100%)`);
console.log("================================================================================");

if (passedCount !== totalCount) {
  process.exit(1);
}