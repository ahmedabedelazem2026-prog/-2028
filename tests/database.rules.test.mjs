import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { ref, set, get, runTransaction, update } from "firebase/database";
import assert from "node:assert/strict";

const env = await initializeTestEnvironment({
  projectId: "demo-taxi-capital-rules",
  database: { host: "127.0.0.1", port: 9000, rules: readFileSync("database.rules.draft.json", "utf8") }
});
try {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.database();
    await set(ref(db, "customers/c1"), { name: "Customer", phone: "01000000000", email: "c@test.local", createdAt: 1 });
    await set(ref(db, "drivers/d1"), { name: "Driver", phone: "01000000001", email: "d@test.local", role: "driver", approved: true, available: true, createdAt: 1 });
    await set(ref(db, "drivers/d2"), { name: "Pending", phone: "01000000002", email: "p@test.local", role: "driver", approved: false, available: false, createdAt: 1 });
  });
  const c1 = env.authenticatedContext("c1").database();
  const d1 = env.authenticatedContext("d1").database();
  const d2 = env.authenticatedContext("d2").database();
  await assertSucceeds(set(ref(c1, "trips/t1"), { clientId: "c1", clientPhone: "01000000000", from: "A", fromName: "A", to: "B", toName: "B", carType: "economy", rideWhen: "now", notes: "", status: "PENDING", createdAt: 2 }));
  await assertFails(get(ref(d2, "driver_requests")));
  await assertFails(get(ref(env.authenticatedContext("c2").database(), "customers/c1")));
  await assertSucceeds(get(ref(d1, "trips/t1")));
  await assertSucceeds(set(ref(c1, "customer_trips/c1/t1"), { clientId: "c1", clientPhone: "01000000000", from: "A", fromName: "A", to: "B", toName: "B", carType: "economy", rideWhen: "now", notes: "", status: "PENDING", createdAt: 2 }));
  await assertSucceeds(set(ref(c1, "driver_requests/t1"), { tripId: "t1", clientId: "c1", pickup: "A", destination: "B", carType: "economy", createdAt: 2, status: "PENDING" }));
  await assertSucceeds(get(ref(d1, "driver_requests")));
  const accepted = await assertSucceeds(runTransaction(ref(d1, "trips/t1"), current => {
    if (current === null) return { __transactionProbe: true };
    if (current.status !== "PENDING") return;
    return { ...current, status: "ACCEPTED", driverId: "d1", driverName: "Driver", acceptedAt: 3 };
  }));
  assert.equal(accepted.committed, true);
  await assertSucceeds(update(ref(d1), {
    "customer_trips/c1/t1/status": "ACCEPTED",
    "customer_trips/c1/t1/driverName": "Driver",
    "customer_trips/c1/t1/driverId": "d1",
    "customer_trips/c1/t1/acceptedAt": 3,
    "driver_active/d1/t1": { fromName: "A", toName: "B", clientPhone: "01000000000", clientId: "c1", status: "ACCEPTED", createdAt: 2, acceptedAt: 3 },
    "drivers/d1/available": false
  }));
  const started = await assertSucceeds(runTransaction(ref(d1, "trips/t1"), current => {
    if (current === null) return { __transactionProbe: true };
    if (current.driverId !== "d1" || current.status !== "ACCEPTED") return;
    return { ...current, status: "IN_PROGRESS", inProgressAt: 4 };
  }));
  assert.equal(started.committed, true);
  await assertSucceeds(update(ref(d1), {
    "customer_trips/c1/t1/status": "IN_PROGRESS",
    "customer_trips/c1/t1/updatedAt": 4,
    "driver_active/d1/t1/status": "IN_PROGRESS"
  }));
  const completed = await assertSucceeds(runTransaction(ref(d1, "trips/t1"), current => {
    if (current === null) return { __transactionProbe: true };
    if (current.driverId !== "d1" || current.status !== "IN_PROGRESS") return;
    return { ...current, status: "COMPLETED", completedAt: 5 };
  }));
  assert.equal(completed.committed, true);
  await assertSucceeds(update(ref(d1), {
    "customer_trips/c1/t1/status": "COMPLETED",
    "customer_trips/c1/t1/updatedAt": 5,
    "driver_active/d1/t1": null
  }));
} finally {
  await env.cleanup();
}
