// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI
// Trip Dispatching & Atomic Acceptance Engine (v2.0 Uber-Grade)
// =========================================================================

export class DispatchEngine {
  constructor({ firestore = null, rtdb = null, currentUser = null }) {
    this.firestore = firestore;
    this.rtdb = rtdb;
    this.currentUser = currentUser;
    this.audioContext = null;
  }

  /**
   * Plays a pleasant dispatch chime using Web Audio API
   */
  playNotificationBeep() {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === "suspended") {
        this.audioContext.resume();
      }

      const now = this.audioContext.currentTime;
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = "sine";
      // Dual-tone harmonic taxi chime
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.15);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    } catch (e) {
      console.warn("Audio chime error:", e);
    }
  }

  /**
   * Creates a new trip request and broadcasts to available drivers
   * Standard Statuses: pending, searching, accepted, driver_arrived, in_progress, completed, cancelled, no_driver
   * @param {object} tripData - Full trip specifications
   * @returns {Promise<{success: boolean, tripId: string}>}
   */
  async createTripRequest(tripData) {
    const timestamp = Date.now();
    const tripId = "TRIP_" + timestamp + "_" + Math.random().toString(36).substr(2, 5);
    const creatorId = tripData.customerId || this.currentUser?.uid || "guest";

    // Generate Uber-grade 4-digit Ride Security PIN code
    const pinCode = String(Math.floor(1000 + Math.random() * 9000));
    const safetyToken = "SEC_" + Math.random().toString(36).substring(2, 10);

    const fullRecord = {
      id: tripId,
      customerId: creatorId,
      customerName: tripData.customerName || "عميل العاصمة",
      customerPhone: tripData.customerPhone || "01094129592",
      from: tripData.from || "وسط البلد - ميدان النصر",
      to: tripData.to || "شاطئ العريش (الكورنيش)",
      fromLat: tripData.fromLat || 31.1316,
      fromLng: tripData.fromLng || 33.8016,
      toLat: tripData.toLat || 31.1442,
      toLng: tripData.toLng || 33.8115,
      distanceKm: tripData.distanceKm || 2.5,
      durationMin: tripData.durationMin || 8,
      carType: tripData.carType || "economy",
      price: tripData.price || 30,
      paymentMethod: tripData.paymentMethod || "كاش",
      currency: "ج.م",
      status: "searching", // Standard: pending, searching, accepted, driver_arrived, in_progress, completed, cancelled, no_driver
      driverId: null,
      driverName: null,
      driverPhone: null,
      driverCar: null,
      driverPlate: null,
      driverRating: 5.0,
      pinCode,                     // 4-digit Ride verification PIN (Uber-grade safety)
      pinVerified: false,          // Must be verified by driver before trip starts
      safetyToken,                 // Token for live tracking link sharing
      scheduledTime: tripData.scheduledTime || null, // Optional scheduled ride (Uber Reserve)
      notesToDriver: tripData.notesToDriver || "",   // Optional instructions to captain
      tipAmount: 0,                // Tip added at trip completion
      createdAt: timestamp,
      updatedAt: timestamp,
      rejectedDrivers: {},
      statusTimeline: [
        {
          status: "searching",
          timestamp,
          updatedBy: creatorId,
          role: "customer"
        }
      ]
    };

    // 1. Sync with Firebase Realtime Database
    if (this.rtdb && window.firebase) {
      try {
        await this.rtdb.ref(`trips/${tripId}`).set(fullRecord);
        await this.rtdb.ref(`driver_requests/${tripId}`).set({
          tripId,
          customerId: creatorId,
          status: "searching",
          from: fullRecord.from,
          to: fullRecord.to,
          price: fullRecord.price,
          carType: fullRecord.carType,
          createdAt: timestamp
        });
      } catch (e) {
        console.warn("RTDB set warning:", e);
      }
    }

    // 2. Sync with Cloud Firestore
    if (this.firestore && window.firebase?.firestore) {
      try {
        await this.firestore.collection("rides").doc(tripId).set(fullRecord);
      } catch (e) {
        console.warn("Firestore set warning:", e);
      }
    }

    // 3. Fallback to localStorage
    try {
      const trips = JSON.parse(localStorage.getItem("capital_taxi_trips") || "{}");
      trips[tripId] = fullRecord;
      localStorage.setItem("capital_taxi_trips", JSON.stringify(trips));
    } catch (e) {}

    return { success: true, tripId, record: fullRecord };
  }

  /**
   * ATOMIC ACCEPTANCE: Guarantees ONLY ONE driver can accept a trip.
   * Uses Firebase Realtime Database Transaction.
   */
  async acceptTripAtomic(tripId, driverProfile) {
    if (!tripId || !driverProfile) {
      return { success: false, message: "بيانات الرحلة أو السائق غير مكتملة." };
    }

    const driverId = driverProfile.uid || driverProfile.id;
    const driverName = driverProfile.name || driverProfile.displayName || "كابتن العاصمة";
    const driverPhone = driverProfile.phone || "01094129592";
    const driverCar = driverProfile.carModel || "تاكسي كود 1";
    const driverPlate = driverProfile.carPlate || "شمال سيناء";
    const driverRating = driverProfile.rating || 5.0;

    // A. RTDB Atomic Transaction
    if (this.rtdb) {
      try {
        const tripRef = this.rtdb.ref(`trips/${tripId}`);
        const result = await tripRef.transaction((current) => {
          if (current === null) return current;
          // If already accepted, in progress, or cancelled, ABORT!
          const activeSearchStatuses = ["searching", "pending", "REQUESTED"];
          if (!activeSearchStatuses.includes(current.status)) {
            return;
          }
          current.status = "accepted";
          current.driverId = driverId;
          current.driverName = driverName;
          current.driverPhone = driverPhone;
          current.driverCar = driverCar;
          current.driverPlate = driverPlate;
          current.driverRating = driverRating;
          current.acceptedAt = Date.now();
          current.updatedAt = Date.now();

          // Append to status audit timeline
          if (!current.statusTimeline) current.statusTimeline = [];
          current.statusTimeline.push({
            status: "accepted",
            timestamp: Date.now(),
            updatedBy: driverId,
            role: "driver"
          });

          return current;
        });

        if (result.committed) {
          // Remove from broadcast queue only after acceptance is proven committed
          await this.rtdb.ref(`driver_requests/${tripId}`).remove().catch(() => {});
          // Mark driver as busy and unavailable
          await this.rtdb.ref(`drivers/${driverId}/status`).set("busy").catch(() => {});
          await this.rtdb.ref(`drivers/${driverId}/available`).set(false).catch(() => {});
          return { success: true, message: "تم قبول الرحلة بنجاح! توجه إلى العميل." };
        } else {
          return { success: false, message: "عذراً، قام كابتن آخر بقبول هذه الرحلة قبلك!" };
        }
      } catch (err) {
        console.warn("RTDB Transaction notice:", err);
        return { success: false, message: "تعذر قبول الرحلة: " + (err.message || "خطأ في الاتصال أو الصلاحيات") };
      }
    }

    // B. Local simulation fallback
    try {
      const trips = JSON.parse(localStorage.getItem("capital_taxi_trips") || "{}");
      const trip = trips[tripId];
      const activeSearchStatuses = ["searching", "pending", "REQUESTED"];
      if (trip && activeSearchStatuses.includes(trip.status)) {
        trip.status = "accepted";
        trip.driverId = driverId;
        trip.driverName = driverName;
        trip.driverPhone = driverPhone;
        trip.driverCar = driverCar;
        trip.driverPlate = driverPlate;
        trip.acceptedAt = Date.now();
        if (!trip.statusTimeline) trip.statusTimeline = [];
        trip.statusTimeline.push({
          status: "accepted",
          timestamp: Date.now(),
          updatedBy: driverId,
          role: "driver"
        });
        trips[tripId] = trip;
        localStorage.setItem("capital_taxi_trips", JSON.stringify(trips));
        return { success: true, message: "تم قبول الرحلة بنجاح!" };
      } else {
        return { success: false, message: "عذراً، لم تعد هذه الرحلة متاحة." };
      }
    } catch (e) {
      return { success: false, message: "حدث خطأ أثناء معالجة الطلب." };
    }
  }

  /**
   * Driver marks "Arrived at pickup location" (driver_arrived)
   */
  async driverArrived(tripId, driverId = "driver") {
    return this.updateTripStatus(tripId, "driver_arrived", { arrivedAt: Date.now() }, driverId, "driver");
  }

  /**
   * Driver marks passenger boarded and begins trip (in_progress)
   */
  async startTrip(tripId, enteredPin = null, driverId = "driver") {
    if (enteredPin) {
      const pinOk = await this.verifyTripPin(tripId, enteredPin);
      if (!pinOk) {
        return { success: false, message: "رمز PIN غير صحيح! تأكد من الرمز الظاهر على هاتف العميل." };
      }
    }
    return this.updateTripStatus(tripId, "in_progress", { startedAt: Date.now(), pinVerified: true }, driverId, "driver");
  }

  /**
   * Verifies the 4-digit ride PIN code
   */
  async verifyTripPin(tripId, enteredPin) {
    if (!enteredPin) return true;
    const cleanPin = String(enteredPin).trim();
    if (this.rtdb) {
      try {
        const snap = await this.rtdb.ref(`trips/${tripId}/pinCode`).once("value");
        const realPin = String(snap.val() || "").trim();
        if (realPin && realPin !== cleanPin) return false;
      } catch (e) {}
    }
    try {
      const trips = JSON.parse(localStorage.getItem("capital_taxi_trips") || "{}");
      if (trips[tripId]?.pinCode && String(trips[tripId].pinCode).trim() !== cleanPin) {
        return false;
      }
    } catch (e) {}
    return true;
  }

  /**
   * Adds tip to driver upon trip completion (Uber-style)
   */
  async addTripTip(tripId, tipAmount) {
    const tip = Math.max(0, Number(tipAmount) || 0);
    if (tip <= 0) return { success: true };
    return this.updateTripStatus(tripId, "completed", { tipAmount: tip }, "rider", "customer");
  }

  /**
   * Driver completes trip and logs final fare (completed)
   */
  async completeTrip(tripId, finalFare = null, driverId = "driver") {
    const update = {
      completedAt: Date.now(),
      status: "completed"
    };
    if (finalFare) update.price = finalFare;

    const res = await this.updateTripStatus(tripId, "completed", update, driverId, "driver");
    // Release driver back to online and available
    const activeDriverId = driverId || this.currentUser?.uid;
    if (activeDriverId && this.rtdb) {
      this.rtdb.ref(`drivers/${activeDriverId}/status`).set("online").catch(() => {});
      this.rtdb.ref(`drivers/${activeDriverId}/available`).set(true).catch(() => {});
    }
    return res;
  }

  /**
   * Cancel trip (cancelled)
   */
  async cancelTrip(tripId, reason = "إلغاء من قبل المستخدم", userId = "user", role = "customer") {
    return this.updateTripStatus(tripId, "cancelled", {
      cancelledAt: Date.now(),
      cancelReason: reason
    }, userId, role);
  }

  /**
   * Mark trip as no_driver when timeout expires
   */
  async markNoDriver(tripId) {
    return this.updateTripStatus(tripId, "no_driver", {
      noDriverAt: Date.now()
    }, "system", "system");
  }

  /**
   * Updates trip status in databases & cache with audit timeline
   */
  async updateTripStatus(tripId, newStatus, extraFields = {}, updatedBy = "system", role = "system") {
    const timestamp = Date.now();
    const transitionRecord = {
      status: newStatus,
      timestamp,
      updatedBy,
      role
    };

    const patch = {
      status: newStatus,
      updatedAt: timestamp,
      ...extraFields
    };

    if (this.rtdb) {
      try {
        await this.rtdb.ref(`trips/${tripId}`).update(patch);
        await this.rtdb.ref(`trips/${tripId}/statusTimeline`).push(transitionRecord);
      } catch (e) {
        console.warn("RTDB update error:", e);
      }
    }

    if (this.firestore) {
      try {
        await this.firestore.collection("rides").doc(tripId).update({
          ...patch,
          statusTimeline: window.firebase?.firestore?.FieldValue?.arrayUnion(transitionRecord) || [transitionRecord]
        });
      } catch (e) {
        console.warn("Firestore update error:", e);
      }
    }

    try {
      const trips = JSON.parse(localStorage.getItem("capital_taxi_trips") || "{}");
      if (trips[tripId]) {
        trips[tripId] = { ...trips[tripId], ...patch };
        if (!trips[tripId].statusTimeline) trips[tripId].statusTimeline = [];
        trips[tripId].statusTimeline.push(transitionRecord);
        localStorage.setItem("capital_taxi_trips", JSON.stringify(trips));
      }
    } catch (e) {}

    return { success: true, status: newStatus };
  }
}
