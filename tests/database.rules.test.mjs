import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { ref, set, get } from "firebase/database";
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
  assert.ok(true);
} finally {
  await env.cleanup();
}
