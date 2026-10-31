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
  // Prime this client with the server value before starting the transaction.
  const tripBeforeAccept = await get(ref(d1, "trips/t1"));
  assert.equal(tripBeforeAccept.val()?.status, "PENDING");
  const accepted = await assertSucceeds(runTransaction(ref(d1, "trips/t1"), current => {
    // Returning undefined aborts immediately when the local cache starts as null.
    // Return the unchanged value so RTDB can reconcile with the server value.
    if (current === null) return null;
    if (current.status !== "PENDING") return;
    return { ...current, status: "ACCEPTED", driverId: "d1", driverName: "Driver", acceptedAt: 3 };
  }));
  assert.equal(accepted.committed, true);
  assert.equal(accepted.snapshot.val()?.status, "ACCEPTED");
  assert.equal(accepted.snapshot.val()?.driverId, "d1");
  const tripBeforeLocationWrite = await get(ref(d1, "trips/t1"));
  assert.equal(tripBeforeLocationWrite.val()?.status, "ACCEPTED");
  assert.equal(tripBeforeLocationWrite.val()?.driverId, "d1");
  const liveLocation = { lat: 31.1321, lng: 33.8033, accuracy: 12, updatedAt: 3 };
  // Control case: seed an already-accepted trip outside security rules.
  // This distinguishes a rules-path issue from transaction timing/state visibility.
  await env.withSecurityRulesDisabled(async c => {
    await set(ref(c.database(), "trips/control"), {
      clientId: "c1", clientPhone: "01000000000", from: "A", fromName: "A",
      to: "B", toName: "B", carType: "economy", rideWhen: "now", notes: "",
      status: "ACCEPTED", driverId: "d1", driverName: "Driver", createdAt: 2, acceptedAt: 3
    });
  });
  await assertSucceeds(set(ref(d1, "trip_locations/control"), liveLocation));
  await assertSucceeds(set(ref(d1, "trip_locations/t1"), liveLocation));
  await assertSucceeds(get(ref(c1, "trip_locations/t1")));
  await assertFails(get(ref(env.authenticatedContext("c2").database(), "trip_locations/t1")));
  await assertFails(get(ref(d2, "trip_locations/t1")));
  await assertFails(set(ref(d2, "trip_locations/t1"), liveLocation));
  await assertSucceeds(update(ref(d1), {
    "customer_trips/c1/t1/status": "ACCEPTED",
    "customer_trips/c1/t1/driverName": "Driver",
    "customer_trips/c1/t1/driverId": "d1",
    "customer_trips/c1/t1/acceptedAt": 3,
    "driver_active/d1/t1": { fromName: "A", toName: "B", clientPhone: "01000000000", clientId: "c1", status: "ACCEPTED", createdAt: 2, acceptedAt: 3 },
    "drivers/d1/available": false
  }));
  const started = await assertSucceeds(runTransaction(ref(d1, "trips/t1"), current => {
    if (current === null) return;
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
    if (current === null) return;
    if (current.driverId !== "d1" || current.status !== "IN_PROGRESS") return;
    return { ...current, status: "COMPLETED", completedAt: 5 };
  }));
  assert.equal(completed.committed, true);
  await assertFails(set(ref(d1, "trip_locations/t1"), { ...liveLocation, updatedAt: 6 }));
  await assertSucceeds(update(ref(d1), {
    "customer_trips/c1/t1/status": "COMPLETED",
    "customer_trips/c1/t1/updatedAt": 5,
    "driver_active/d1/t1": null
  }));
} finally {
  await env.cleanup();
}
