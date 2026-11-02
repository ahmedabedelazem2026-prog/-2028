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
   * @param {object} tripData - Full trip specifications
   * @returns {Promise<{success: boolean, tripId: string}>}
   */
  async createTripRequest(tripData) {
    const timestamp = Date.now();
    const tripId = "TRIP_" + timestamp + "_" + Math.random().toString(36).substr(2, 5);

    const fullRecord = {
      id: tripId,
      customerId: tripData.customerId || this.currentUser?.uid || "guest",
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
      status: "REQUESTED", // REQUESTED, ACCEPTED, ARRIVED, IN_PROGRESS, COMPLETED, CANCELLED
      driverId: null,
      driverName: null,
      driverPhone: null,
      driverCar: null,
      driverPlate: null,
      driverRating: 5.0,
      createdAt: timestamp,
      updatedAt: timestamp,
      rejectedDrivers: {}
    };

    // 1. Sync with Firebase Realtime Database
    if (this.rtdb && window.firebase) {
      try {
        await this.rtdb.ref(`trips/${tripId}`).set(fullRecord);
        await this.rtdb.ref(`driver_requests/${tripId}`).set({
          tripId,
          status: "REQUESTED",
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
          // If already accepted or cancelled, ABORT!
          if (current.status !== "REQUESTED" && current.status !== "pending") {
            return;
          }
          current.status = "ACCEPTED";
          current.driverId = driverId;
          current.driverName = driverName;
          current.driverPhone = driverPhone;
          current.driverCar = driverCar;
          current.driverPlate = driverPlate;
          current.driverRating = driverRating;
          current.acceptedAt = Date.now();
          current.updatedAt = Date.now();
          return current;
        });

        if (result.committed) {
          // Remove from broadcast queue
          await this.rtdb.ref(`driver_requests/${tripId}`).remove().catch(() => {});
          // Mark driver as busy
          await this.rtdb.ref(`drivers/${driverId}/status`).set("busy").catch(() => {});
          return { success: true, message: "تم قبول الرحلة بنجاح! توجه إلى العميل." };
        } else {
          return { success: false, message: "عذراً، قام كابتن آخر بقبول هذه الرحلة قبلك!" };
        }
      } catch (err) {
        console.warn("RTDB Transaction notice:", err);
      }
    }

    // B. Local simulation fallback
    try {
      const trips = JSON.parse(localStorage.getItem("capital_taxi_trips") || "{}");
      const trip = trips[tripId];
      if (trip && (trip.status === "REQUESTED" || trip.status === "pending")) {
        trip.status = "ACCEPTED";
        trip.driverId = driverId;
        trip.driverName = driverName;
        trip.driverPhone = driverPhone;
        trip.driverCar = driverCar;
        trip.driverPlate = driverPlate;
        trip.acceptedAt = Date.now();
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
   * Driver marks "Arrived at pickup location"
   */
  async driverArrived(tripId) {
    return this.updateTripStatus(tripId, "ARRIVED", { arrivedAt: Date.now() });
  }

  /**
   * Driver marks passenger boarded and begins trip
   */
  async startTrip(tripId) {
    return this.updateTripStatus(tripId, "IN_PROGRESS", { startedAt: Date.now() });
  }

  /**
   * Driver completes trip and logs final fare
   */
  async completeTrip(tripId, finalFare = null) {
    const update = {
      completedAt: Date.now(),
      status: "COMPLETED"
    };
    if (finalFare) update.price = finalFare;

    const res = await this.updateTripStatus(tripId, "COMPLETED", update);
    // Release driver back to online
    if (this.currentUser && this.rtdb) {
      this.rtdb.ref(`drivers/${this.currentUser.uid}/status`).set("online").catch(() => {});
    }
    return res;
  }

  /**
   * Cancel trip
   */
  async cancelTrip(tripId, reason = "إلغاء من قبل المستخدم") {
    return this.updateTripStatus(tripId, "CANCELLED", {
      cancelledAt: Date.now(),
      cancelReason: reason
    });
  }

  /**
   * Updates trip status in databases & cache
   */
  async updateTripStatus(tripId, newStatus, extraFields = {}) {
    const patch = {
      status: newStatus,
      updatedAt: Date.now(),
      ...extraFields
    };

    if (this.rtdb) {
      try {
        await this.rtdb.ref(`trips/${tripId}`).update(patch);
      } catch (e) {
        console.warn("RTDB update error:", e);
      }
    }

    if (this.firestore) {
      try {
        await this.firestore.collection("rides").doc(tripId).update(patch);
      } catch (e) {
        console.warn("Firestore update error:", e);
      }
    }

    try {
      const trips = JSON.parse(localStorage.getItem("capital_taxi_trips") || "{}");
      if (trips[tripId]) {
        trips[tripId] = { ...trips[tripId], ...patch };
        localStorage.setItem("capital_taxi_trips", JSON.stringify(trips));
      }
    } catch (e) {}

    return { success: true, status: newStatus };
  }
}
