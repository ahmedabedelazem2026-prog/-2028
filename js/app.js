// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI (North Sinai, Al-Arish)
// Master Application Controller v2.0 (Uber-Grade Architecture)
// =========================================================================

import { firebaseConfig, googleMapsConfig } from "./firebase-config.js";
import { PricingEngine } from "./pricing-engine.js";
import { MapsEngine } from "./maps-engine.js";
import { DispatchEngine } from "./dispatch-engine.js";
import { WalletEngine } from "./wallet-engine.js";
import { ChatEngine } from "./chat-engine.js";
import { RatingsEngine } from "./ratings-engine.js";
import { SuperAdminGuard } from "./superadmin-bootstrap.js";

// Load Firebase Compat SDK from Google CDN
const loadFirebaseLibraries = async () => {
  if (window.firebase) return true;
  const scripts = [
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js"
  ];
  for (const src of scripts) {
    await new Promise((res) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = res;
      document.head.appendChild(s);
    });
  }
  return !!window.firebase;
};

class CapitalTaxiApp {
  constructor() {
    this.pricing = new PricingEngine();
    this.maps = null;
    this.dispatch = null;
    this.wallet = null;
    this.chat = null;
    this.ratings = null;
    this.adminGuard = null;

    this.firebaseApp = null;
    this.auth = null;
    this.rtdb = null;
    this.firestore = null;
    this.storage = null;

    this.currentUser = null;
    this.userProfile = null;
    this.currentRole = "customer"; // customer, driver, admin, supervisor

    // Booking state
    this.pickupLocation = { ...googleMapsConfig.defaultCenter, name: "وسط البلد - ميدان النصر" };
    this.dropoffLocation = { lat: 31.1442, lng: 33.8115, name: "شاطئ العريش (الكورنيش)" };
    this.selectedCarType = "economy";
    this.selectedPaymentMethod = "كاش"; // "كاش" or "محفظة"
    this.currentFareDetails = null;
    this.activeCustomerTrip = null;

    // Driver state
    this.isDriverOnline = true;
    this.activeDriverTrip = null;
    this.incomingCountdownTimer = null;
    this.geoWatchId = null;

    // Admin state
    this.adminData = {
      drivers: {},
      trips: {},
      users: {},
      complaints: {},
      reviews: []
    };

    // Chat state
    this.activeChatTripId = null;

    this.deferredPrompt = null;
  }

  async init() {
    console.log("🚕 Starting Capital Taxi Master Platform v2.0...");
    this.setupPWA();
    this.bindDOMEvents();

    // Init Firebase
    await loadFirebaseLibraries();
    if (window.firebase) {
      try {
        this.firebaseApp = window.firebase.initializeApp(firebaseConfig);
        this.auth = window.firebase.auth();
        this.rtdb = window.firebase.database();
        this.firestore = window.firebase.firestore();
        this.storage = window.firebase.storage();
        console.log("🔥 Firebase initialized successfully.");
        this.updateConnectionStatus(true);
      } catch (err) {
        console.warn("Firebase init notice:", err.message);
        this.updateConnectionStatus(false);
      }
    }

    // Init Core Engines
    this.dispatch = new DispatchEngine({
      firestore: this.firestore,
      rtdb: this.rtdb,
      currentUser: this.currentUser
    });
    this.wallet = new WalletEngine({ rtdb: this.rtdb, currentUser: this.currentUser });
    this.chat = new ChatEngine({ rtdb: this.rtdb, currentUser: this.currentUser });
    this.ratings = new RatingsEngine({ rtdb: this.rtdb, firestore: this.firestore });
    this.adminGuard = new SuperAdminGuard({ auth: this.auth, rtdb: this.rtdb, firestore: this.firestore });

    this.maps = new MapsEngine({
      containerId: "customerMap",
      onLocationSelected: (coords) => this.handleMapClick(coords)
    });
    await this.maps.init();

    // Default pins & route
    this.updateRouteAndFare();

    // Listen to Firebase Auth
    if (this.auth) {
      this.auth.onAuthStateChanged((user) => this.handleAuthStateChanged(user));
    } else {
      this.loadLocalProfile();
    }

    // Realtime Database data listeners
    this.attachRealtimeListeners();

    // Populate landmarks chips
    this.renderLandmarkChips();

    // Start geolocation watcher for drivers
    this.initDriverLocationTracking();

    // Set initial view
    this.switchView("landing");
  }

  updateConnectionStatus(connected) {
    const el = document.getElementById("fbStatusBadge");
    if (el) {
      el.textContent = connected ? "متصل بقاعدة البيانات ✓" : "وضع محلي / غير متصل";
      el.className = connected ? "live-badge" : "feature-pill";
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // AUTHENTICATION & USER ROLES
  // ═════════════════════════════════════════════════════════════════════════
  async handleAuthStateChanged(user) {
    this.currentUser = user;
    if (user) {
      console.log("Logged in UID:", user.uid);
      let profile = null;
      if (this.rtdb) {
        try {
          const snap = await this.rtdb.ref(`users/${user.uid}`).once("value");
          profile = snap.val();
          if (!profile) {
            const dSnap = await this.rtdb.ref(`drivers/${user.uid}`).once("value");
            profile = dSnap.val();
          }
        } catch (e) {}
      }

      // Check Super Admin privileges
      const isSuper = await this.adminGuard?.isSuperAdmin(user.uid, user.email || "");

      if (!profile) {
        profile = {
          uid: user.uid,
          name: user.displayName || user.email?.split("@")[0] || "مستخدم العاصمة",
          email: user.email,
          role: isSuper ? "admin" : "customer",
          phone: "01094129592"
        };
      }

      if (isSuper) {
        profile.role = "admin";
        profile.isSuperAdmin = true;
      }

      this.userProfile = profile;
      this.currentRole = profile.role || "customer";
      this.showToast(`مرحباً بك، ${profile.name}`);
      this.updateUserUI();
      this.refreshUserWalletUI();
    } else {
      this.userProfile = null;
      this.currentRole = "customer";
      this.updateUserUI();
    }
  }

  loadLocalProfile() {
    const saved = localStorage.getItem("capital_taxi_user");
    if (saved) {
      this.userProfile = JSON.parse(saved);
      this.currentRole = this.userProfile.role || "customer";
    }
    this.updateUserUI();
    this.refreshUserWalletUI();
  }

  updateUserUI() {
    const authBtn = document.getElementById("btnAuthModal");
    const userNameEl = document.getElementById("navUserName");
    const adminTab = document.querySelector('[data-view="admin"]');

    if (this.userProfile) {
      if (authBtn) authBtn.style.display = "none";
      if (userNameEl) {
        userNameEl.style.display = "inline-flex";
        userNameEl.textContent = `👤 ${this.userProfile.name} (${this.getRoleName(this.currentRole)})`;
      }
      if (adminTab) {
        // Only show Admin tab if user is admin or for convenient testing
        adminTab.style.display = "inline-flex";
      }
    } else {
      if (authBtn) authBtn.style.display = "inline-flex";
      if (userNameEl) userNameEl.style.display = "none";
    }
  }

  getRoleName(role) {
    return { customer: "عميل", driver: "كابتن", admin: "إدارة", supervisor: "مشرف" }[role] || role;
  }

  async login(email, password) {
    if (this.auth) {
      return this.auth.signInWithEmailAndPassword(email, password);
    } else {
      this.userProfile = {
        uid: "local_" + Date.now(),
        name: email.split("@")[0],
        email,
        role: email.toLowerCase().includes("ahmedabedelazem") || email.includes("admin")
          ? "admin"
          : email.includes("driver")
          ? "driver"
          : "customer",
        phone: "01094129592"
      };
      localStorage.setItem("capital_taxi_user", JSON.stringify(this.userProfile));
      this.currentRole = this.userProfile.role;
      this.updateUserUI();
      return true;
    }
  }

  async register({ name, phone, email, password, role, carModel, carPlate }) {
    if (this.auth) {
      const cred = await this.auth.createUserWithEmailAndPassword(email, password);
      const uid = cred.user.uid;
      const profile = {
        uid,
        name,
        phone,
        email,
        role,
        createdAt: Date.now(),
        status: role === "driver" ? "approved" : "active"
      };
      if (role === "driver") {
        profile.carModel = carModel || "تاكسي العاصمة كود 1";
        profile.carPlate = carPlate || "ط أ س 1234";
        profile.available = true;
        profile.rating = 5.0;
        profile.totalTrips = 0;
        await this.rtdb?.ref(`drivers/${uid}`).set(profile);
      }
      await this.rtdb?.ref(`users/${uid}`).set(profile);
      this.userProfile = profile;
      this.currentRole = role;
      return true;
    } else {
      const uid = "USR_" + Date.now();
      const profile = { uid, name, phone, email, role, carModel, carPlate, createdAt: Date.now() };
      localStorage.setItem("capital_taxi_user", JSON.stringify(profile));
      this.userProfile = profile;
      this.currentRole = role;
      this.updateUserUI();
      return true;
    }
  }

  async logout() {
    if (this.auth) await this.auth.signOut();
    localStorage.removeItem("capital_taxi_user");
    this.userProfile = null;
    this.currentUser = null;
    this.currentRole = "customer";
    this.updateUserUI();
    this.showToast("تم تسجيل الخروج بنجاح.");
    this.switchView("landing");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // GPS & DRIVER LOCATION TRACKING
  // ═════════════════════════════════════════════════════════════════════════
  initDriverLocationTracking() {
    if ("geolocation" in navigator) {
      this.geoWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if (this.currentRole === "driver" && this.currentUser && this.isDriverOnline) {
            if (this.rtdb) {
              this.rtdb.ref(`driver_locations/${this.currentUser.uid}`).set({
                lat,
                lng,
                updatedAt: Date.now()
              });
              this.rtdb.ref(`drivers/${this.currentUser.uid}/lat`).set(lat);
              this.rtdb.ref(`drivers/${this.currentUser.uid}/lng`).set(lng);
            }
          }
        },
        (err) => console.warn("GPS watch position notice:", err.message),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // REALTIME DATABASE SYNCHRONIZATION
  // ═════════════════════════════════════════════════════════════════════════
  attachRealtimeListeners() {
    if (!this.rtdb) {
      setInterval(() => this.pollLocalTrips(), 3000);
      return;
    }

    // 1. Drivers Listener
    this.rtdb.ref("drivers").on("value", (snap) => {
      const data = snap.val() || {};
      this.adminData.drivers = data;
      this.renderAdminDrivers(data);
      this.updateAdminMetrics();

      // Show online drivers on maps
      Object.entries(data).forEach(([id, d]) => {
        if (d.available || d.status === "online") {
          const lat = d.lat || 31.1316 + (Math.random() - 0.5) * 0.02;
          const lng = d.lng || 33.8016 + (Math.random() - 0.5) * 0.02;
          this.maps?.updateDriverMarker({
            driverId: id,
            lat,
            lng,
            name: d.name || "كابتن العاصمة",
            carModel: d.carModel || "كود 1"
          });
        }
      });
    });

    // 2. Trips Listener
    this.rtdb.ref("trips").on("value", (snap) => {
      const data = snap.val() || {};
      this.adminData.trips = data;
      this.renderAdminTrips(data);
      this.updateAdminMetrics();
      this.checkDriverIncomingTrip(data);
      this.checkCustomerTripStatus(data);
    });

    // 3. Users Listener
    this.rtdb.ref("users").on("value", (snap) => {
      this.adminData.users = snap.val() || {};
      this.renderAdminUsers(this.adminData.users);
      this.updateAdminMetrics();
    });

    // 4. Complaints Listener
    this.rtdb.ref("complaints").on("value", (snap) => {
      this.adminData.complaints = snap.val() || {};
      this.renderAdminComplaints(this.adminData.complaints);
    });
  }

  pollLocalTrips() {
    try {
      const trips = JSON.parse(localStorage.getItem("capital_taxi_trips") || "{}");
      this.adminData.trips = trips;
      this.renderAdminTrips(trips);
      this.updateAdminMetrics();
      this.checkDriverIncomingTrip(trips);
      this.checkCustomerTripStatus(trips);
    } catch (e) {}
  }

  // ═════════════════════════════════════════════════════════════════════════
  // CUSTOMER BOOKING FLOW
  // ═════════════════════════════════════════════════════════════════════════
  renderLandmarkChips() {
    const pickupChips = document.getElementById("pickupChips");
    const dropoffChips = document.getElementById("dropoffChips");
    if (!pickupChips || !dropoffChips) return;

    pickupChips.innerHTML = "";
    dropoffChips.innerHTML = "";

    googleMapsConfig.arishLandmarks.forEach((lm) => {
      const pChip = document.createElement("button");
      pChip.type = "button";
      pChip.className = "chip-btn";
      pChip.textContent = lm.name;
      pChip.onclick = () => {
        this.pickupLocation = { lat: lm.lat, lng: lm.lng, name: lm.name };
        document.getElementById("inputPickup").value = lm.name;
        this.updateRouteAndFare();
      };
      pickupChips.appendChild(pChip);

      const dChip = document.createElement("button");
      dChip.type = "button";
      dChip.className = "chip-btn";
      dChip.textContent = lm.name;
      dChip.onclick = () => {
        this.dropoffLocation = { lat: lm.lat, lng: lm.lng, name: lm.name };
        document.getElementById("inputDropoff").value = lm.name;
        this.updateRouteAndFare();
      };
      dropoffChips.appendChild(dChip);
    });
  }

  handleMapClick({ lat, lng }) {
    if (!this.pickupSetFirst) {
      this.pickupLocation = { lat, lng, name: `موقع بالخريطة (${lat.toFixed(4)}, ${lng.toFixed(4)})` };
      document.getElementById("inputPickup").value = this.pickupLocation.name;
      this.pickupSetFirst = true;
      this.showToast("تم تحديد نقطة الانطلاق");
    } else {
      this.dropoffLocation = { lat, lng, name: `وجهة بالخريطة (${lat.toFixed(4)}, ${lng.toFixed(4)})` };
      document.getElementById("inputDropoff").value = this.dropoffLocation.name;
      this.pickupSetFirst = false;
      this.showToast("تم تحديد الوجهة");
    }
    this.updateRouteAndFare();
  }

  async updateRouteAndFare() {
    if (!this.maps) return;
    this.maps.setPickupMarker({
      lat: this.pickupLocation.lat,
      lng: this.pickupLocation.lng,
      title: this.pickupLocation.name
    });
    this.maps.setDestinationMarker({
      lat: this.dropoffLocation.lat,
      lng: this.dropoffLocation.lng,
      title: this.dropoffLocation.name
    });

    const route = await this.maps.drawRoute({
      origin: this.pickupLocation,
      destination: this.dropoffLocation
    });

    const couponCode = document.getElementById("inputCoupon")?.value?.trim() || "";

    const fare = this.pricing.calculateFare({
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      carType: this.selectedCarType,
      couponCode
    });

    this.currentFareDetails = fare;
    this.renderFareBreakdown(fare);
  }

  renderFareBreakdown(fare) {
    const distEl = document.getElementById("fareDistance");
    const timeEl = document.getElementById("fareDuration");
    const totalEl = document.getElementById("fareTotal");
    const baseEl = document.getElementById("fareBase");

    if (distEl) distEl.textContent = `${fare.distanceKm} كم`;
    if (timeEl) timeEl.textContent = `${fare.durationMin} دقيقة تقريباً`;
    if (baseEl) baseEl.textContent = `${fare.baseFare} ج.م`;
    if (totalEl) totalEl.textContent = `${fare.totalFare} ${fare.currency}`;

    const config = this.pricing.getConfig();
    Object.keys(config.carCategories).forEach((key) => {
      const priceEl = document.getElementById(`price-${key}`);
      if (priceEl) {
        const catFare = this.pricing.calculateFare({
          distanceKm: fare.distanceKm,
          durationMin: fare.durationMin,
          carType: key
        });
        priceEl.textContent = `${catFare.totalFare} ج.م`;
      }
    });
  }

  async requestRide() {
    if (!this.currentFareDetails) {
      this.showToast("يرجى تحديد مسار الرحلة أولاً");
      return;
    }

    const customerName = this.userProfile?.name || document.getElementById("inputCustomerName")?.value?.trim() || "عميل العاصمة";
    const customerPhone = this.userProfile?.phone || document.getElementById("inputCustomerPhone")?.value?.trim() || "01094129592";

    const requestData = {
      customerId: this.userProfile?.uid || "guest_" + Date.now(),
      customerName,
      customerPhone,
      from: this.pickupLocation.name,
      to: this.dropoffLocation.name,
      fromLat: this.pickupLocation.lat,
      fromLng: this.pickupLocation.lng,
      toLat: this.dropoffLocation.lat,
      toLng: this.dropoffLocation.lng,
      distanceKm: this.currentFareDetails.distanceKm,
      durationMin: this.currentFareDetails.durationMin,
      carType: this.selectedCarType,
      price: this.currentFareDetails.totalFare,
      paymentMethod: this.selectedPaymentMethod
    };

    const res = await this.dispatch.createTripRequest(requestData);
    if (res.success) {
      this.activeCustomerTrip = res.record;
      this.showCustomerActiveTripOverlay(res.record);
      this.showToast("تم إرسال طلبك بنجاح! جاري البحث عن أقرب كابتن...");
    }
  }

  showCustomerActiveTripOverlay(trip) {
    const card = document.getElementById("customerTripStatusCard");
    if (!card) return;
    card.style.display = "block";
    document.getElementById("custTripStatus").textContent = this.getStatusName(trip.status);
    document.getElementById("custTripFrom").textContent = trip.from;
    document.getElementById("custTripTo").textContent = trip.to;
    document.getElementById("custTripPrice").textContent = `${trip.price} ج.م (${trip.paymentMethod || 'كاش'})`;
    document.getElementById("custTripDriver").textContent = trip.driverName || "بانتظار قبول الكابتن...";
    document.getElementById("custTripDriverPhone").textContent = trip.driverPhone || "—";
    if (trip.driverCar) {
      document.getElementById("custTripDriverCar").textContent = `${trip.driverCar} • لوحة: ${trip.driverPlate || 'شمال سيناء'}`;
    }

    // Chat button active during ride
    const chatBtn = document.getElementById("btnCustOpenChat");
    if (chatBtn) {
      chatBtn.style.display = trip.driverId ? "inline-flex" : "none";
      chatBtn.onclick = () => this.openChatModal(trip.id, "customer");
    }
  }

  checkCustomerTripStatus(trips) {
    if (!this.activeCustomerTrip) return;
    const current = trips[this.activeCustomerTrip.id];
    if (current) {
      const prevStatus = this.activeCustomerTrip.status;
      this.activeCustomerTrip = current;
      this.showCustomerActiveTripOverlay(current);

      if (current.status === "ARRIVED" && prevStatus !== "ARRIVED") {
        this.dispatch.playNotificationBeep();
        this.showToast("الكابتن وصل الآن إلى نقطة الانطلاق وبانتظارك! 🚖");
      }

      if (current.status === "IN_PROGRESS" && prevStatus !== "IN_PROGRESS") {
        this.showToast("بدأت الرحلة.. نتمنى لك مشواراً مريحاً مع تاكسي العاصمة!");
      }

      if (current.status === "COMPLETED") {
        this.showToast("حمد لله على السلامة! اكتملت رحلتك بنجاح.");
        this.openRatingModal(current);
        document.getElementById("customerTripStatusCard").style.display = "none";
        this.activeCustomerTrip = null;
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // DRIVER APP FLOW
  // ═════════════════════════════════════════════════════════════════════════
  toggleDriverOnline(isOnline) {
    this.isDriverOnline = isOnline;
    const statusText = document.getElementById("driverStatusText");
    if (statusText) {
      statusText.textContent = isOnline ? "أنت متصل ومتاح لاستقبال الرحلات" : "أنت غير متاح حالياً";
      statusText.style.color = isOnline ? "var(--status-green)" : "var(--text-muted)";
    }
    if (this.currentUser && this.rtdb) {
      this.rtdb.ref(`drivers/${this.currentUser.uid}/available`).set(isOnline);
      this.rtdb.ref(`drivers/${this.currentUser.uid}/status`).set(isOnline ? "online" : "offline");
    }
    this.showToast(isOnline ? "أنت الآن متاح للعمل!" : "تم تحويل حالتك إلى غير متاح");
  }

  checkDriverIncomingTrip(trips) {
    if (!this.isDriverOnline) return;
    const incomingCard = document.getElementById("incomingTripCard");
    const activeCard = document.getElementById("driverActiveTripCard");
    if (!incomingCard) return;

    const myUid = this.userProfile?.uid || "mock_driver";

    // Check if driver is assigned an active trip
    const myActiveTrip = Object.values(trips).find(
      (t) => t.driverId === myUid && (t.status === "ACCEPTED" || t.status === "ARRIVED" || t.status === "IN_PROGRESS")
    );

    if (myActiveTrip) {
      this.activeDriverTrip = myActiveTrip;
      incomingCard.style.display = "none";
      if (this.incomingCountdownTimer) clearInterval(this.incomingCountdownTimer);

      if (activeCard) {
        activeCard.style.display = "block";
        document.getElementById("activeTripCustomerName").textContent = myActiveTrip.customerName;
        document.getElementById("activeTripCustomerPhone").textContent = myActiveTrip.customerPhone;
        document.getElementById("activeTripCustomerPhoneLink").href = `tel:${myActiveTrip.customerPhone}`;
        document.getElementById("activeTripFrom").textContent = myActiveTrip.from;
        document.getElementById("activeTripTo").textContent = myActiveTrip.to;
        document.getElementById("activeTripPrice").textContent = `${myActiveTrip.price} ج.م (${myActiveTrip.paymentMethod || 'كاش'})`;
        document.getElementById("activeTripStatus").textContent = this.getStatusName(myActiveTrip.status);

        // Chat button
        const chatBtn = document.getElementById("btnDriverOpenChat");
        if (chatBtn) chatBtn.onclick = () => this.openChatModal(myActiveTrip.id, "driver");
      }
      return;
    } else {
      if (activeCard) activeCard.style.display = "none";
      this.activeDriverTrip = null;
    }

    // Look for pending request
    const pendingTrip = Object.values(trips).find(
      (t) => (t.status === "REQUESTED" || t.status === "pending") && !t.rejectedDrivers?.[myUid]
    );

    if (pendingTrip) {
      incomingCard.style.display = "flex";
      this.dispatch.playNotificationBeep();
      document.getElementById("incomingFrom").textContent = pendingTrip.from;
      document.getElementById("incomingTo").textContent = pendingTrip.to;
      document.getElementById("incomingDistance").textContent = `${pendingTrip.distanceKm || 2.5} كم`;
      document.getElementById("incomingPrice").textContent = `${pendingTrip.price} ج.م`;

      // 20s Countdown Timer
      let secondsLeft = 25;
      const countEl = document.getElementById("incomingCountdown");
      if (countEl) countEl.textContent = `${secondsLeft} ثانية`;
      if (this.incomingCountdownTimer) clearInterval(this.incomingCountdownTimer);
      this.incomingCountdownTimer = setInterval(() => {
        secondsLeft--;
        if (countEl) countEl.textContent = `${secondsLeft} ثانية`;
        if (secondsLeft <= 0) {
          clearInterval(this.incomingCountdownTimer);
          incomingCard.style.display = "none";
        }
      }, 1000);

      const acceptBtn = document.getElementById("btnAcceptTrip");
      const rejectBtn = document.getElementById("btnRejectTrip");

      acceptBtn.onclick = async () => {
        clearInterval(this.incomingCountdownTimer);
        acceptBtn.disabled = true;
        acceptBtn.textContent = "جاري التأكيد...";
        const res = await this.dispatch.acceptTripAtomic(pendingTrip.id, this.userProfile || {
          uid: myUid,
          name: "كابتن العاصمة",
          phone: "01094129592",
          carModel: "كود 1",
          carPlate: "ط أ س 1"
        });
        acceptBtn.disabled = false;
        acceptBtn.textContent = "قبول الرحلة ✓";
        this.showToast(res.message);
      };

      rejectBtn.onclick = () => {
        clearInterval(this.incomingCountdownTimer);
        incomingCard.style.display = "none";
        this.showToast("تم رفض الطلب.");
      };
    } else {
      incomingCard.style.display = "none";
      if (this.incomingCountdownTimer) clearInterval(this.incomingCountdownTimer);
    }
  }

  async markDriverArrived() {
    if (!this.activeDriverTrip) return;
    await this.dispatch.driverArrived(this.activeDriverTrip.id);
    this.showToast("تم إشعار العميل بوصولك إلى نقطة الالتقاء!");
  }

  async startActiveTrip() {
    if (!this.activeDriverTrip) return;
    await this.dispatch.startTrip(this.activeDriverTrip.id);
    this.showToast("تم بدء الرحلة! توكل على الله وسر بأمان.");
  }

  async completeActiveTrip() {
    if (!this.activeDriverTrip) return;
    const trip = this.activeDriverTrip;
    await this.dispatch.completeTrip(trip.id);
    // Credit driver wallet
    await this.wallet?.creditDriverTrip(trip.driverId || this.currentUser?.uid, trip.id, trip.price);
    this.showToast(`تم إنهاء الرحلة بنجاح! حصّل مبلغ ${trip.price} ج.م.`);
  }

  openGoogleMapsDirections() {
    if (!this.activeDriverTrip) return;
    const dest = encodeURIComponent(this.activeDriverTrip.from);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, "_blank");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // IN-APP CHAT MODAL
  // ═════════════════════════════════════════════════════════════════════════
  openChatModal(tripId, role) {
    this.activeChatTripId = tripId;
    const modal = document.getElementById("chatModal");
    if (!modal) return;
    modal.classList.add("open");

    // Populate quick replies
    const quickContainer = document.getElementById("chatQuickReplies");
    if (quickContainer) {
      quickContainer.innerHTML = "";
      const replies = this.chat.getQuickReplies(role);
      replies.forEach((r) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip-btn";
        btn.textContent = r;
        btn.onclick = () => {
          document.getElementById("chatInputText").value = r;
          this.sendChatMessage(role);
        };
        quickContainer.appendChild(btn);
      });
    }

    // Listen to messages
    this.chat.listenToTripChat(tripId, (msgs) => {
      const msgList = document.getElementById("chatMessagesList");
      if (!msgList) return;
      if (msgs.length === 0) {
        msgList.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">لا توجد رسائل بعد.. ابدأ المحادثة.</div>';
        return;
      }
      msgList.innerHTML = msgs.map((m) => {
        const isMe = m.senderRole === role;
        return `
          <div style="display:flex; justify-content:${isMe ? 'flex-start' : 'flex-end'}; margin-bottom:8px;">
            <div style="background:${isMe ? 'var(--blue-primary)' : 'rgba(212,175,55,0.18)'}; border:1px solid ${isMe ? 'var(--blue-accent)' : 'var(--border-gold)'}; border-radius:12px; padding:8px 14px; max-width:80%;">
              <small style="color:var(--gold-light); display:block; font-size:0.7rem;">${m.senderName}</small>
              <div style="font-size:0.92rem; color:#fff;">${m.text}</div>
              <small style="color:var(--text-dim); font-size:0.65rem;">${new Date(m.timestamp).toLocaleTimeString('ar-EG')}</small>
            </div>
          </div>
        `;
      }).join("");
      msgList.scrollTop = msgList.scrollHeight;
    });
  }

  async sendChatMessage(role) {
    const input = document.getElementById("chatInputText");
    const text = input?.value?.trim();
    if (!text || !this.activeChatTripId) return;

    await this.chat.sendMessage({
      tripId: this.activeChatTripId,
      senderId: this.userProfile?.uid || "anon",
      senderName: this.userProfile?.name || (role === "driver" ? "الكابتن" : "العميل"),
      senderRole: role,
      text
    });
    if (input) input.value = "";
  }

  closeChatModal() {
    this.chat.stopListening();
    this.activeChatTripId = null;
    document.getElementById("chatModal")?.classList.remove("open");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // RATINGS & REVIEWS MODAL
  // ═════════════════════════════════════════════════════════════════════════
  openRatingModal(trip) {
    const modal = document.getElementById("ratingModal");
    if (!modal) return;
    modal.classList.add("open");
    modal.dataset.tripId = trip.id;
    modal.dataset.driverId = trip.driverId || "";

    // Populate review tags
    const tagsBox = document.getElementById("ratingTagsBox");
    if (tagsBox) {
      tagsBox.innerHTML = "";
      this.ratings.getReviewTags().forEach((tag) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip-btn";
        btn.textContent = tag.label;
        btn.onclick = () => btn.classList.toggle("active");
        tagsBox.appendChild(btn);
      });
    }
  }

  async submitDriverRating() {
    const modal = document.getElementById("ratingModal");
    if (!modal) return;
    const tripId = modal.dataset.tripId;
    const driverId = modal.dataset.driverId;
    const rating = Number(document.querySelector('input[name="starRating"]:checked')?.value || 5);
    const comment = document.getElementById("ratingComment")?.value || "";

    const activeTags = [];
    document.querySelectorAll("#ratingTagsBox .chip-btn.active").forEach((b) => activeTags.push(b.textContent));

    await this.ratings.submitReview({
      tripId,
      customerId: this.userProfile?.uid || "guest",
      customerName: this.userProfile?.name || "عميل",
      driverId,
      rating,
      tags: activeTags,
      comment
    });

    modal.classList.remove("open");
    this.showToast("شكراً لتقييمك! تقييمك يساعدنا في رفع جودة الخدمة دائماً.");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // WALLET & TRANSACTIONS
  // ═════════════════════════════════════════════════════════════════════════
  async refreshUserWalletUI() {
    const uid = this.userProfile?.uid;
    const data = await this.wallet?.getWallet(uid);
    const balanceEl = document.getElementById("walletBalanceText");
    const driverBalanceEl = document.getElementById("driverWalletBalanceText");
    if (balanceEl) balanceEl.textContent = `${data?.balance || 0} ج.م`;
    if (driverBalanceEl) driverBalanceEl.textContent = `${data?.balance || 0} ج.م`;

    const txList = document.getElementById("walletTransactionsList");
    if (txList && data?.transactions) {
      if (data.transactions.length === 0) {
        txList.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:10px;">لا توجد معاملات سابقة</div>';
      } else {
        txList.innerHTML = data.transactions.map((tx) => `
          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-subtle); font-size:0.85rem;">
            <div>
              <b>${tx.description}</b>
              <small style="color:var(--text-dim); display:block;">${new Date(tx.createdAt).toLocaleDateString('ar-EG')}</small>
            </div>
            <strong style="color:${tx.type === 'credit' ? '#34D399' : '#F87171'};">
              ${tx.type === 'credit' ? '+' : '-'}${tx.amount} ج.م
            </strong>
          </div>
        `).join("");
      }
    }
  }

  async topUpUserWallet(amount) {
    const uid = this.userProfile?.uid || "guest";
    await this.wallet?.topUpWallet(uid, amount);
    await this.refreshUserWalletUI();
    this.showToast(`تم شحن المحفظة بمبلغ ${amount} ج.م بنجاح!`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ADMIN DASHBOARD
  // ═════════════════════════════════════════════════════════════════════════
  updateAdminMetrics() {
    const trips = Object.values(this.adminData.trips || {});
    const drivers = Object.values(this.adminData.drivers || {});
    const users = Object.values(this.adminData.users || {});

    const totalTrips = trips.length;
    const activeTrips = trips.filter((t) => t.status === "IN_PROGRESS" || t.status === "ACCEPTED" || t.status === "ARRIVED").length;
    const completedTrips = trips.filter((t) => t.status === "COMPLETED" || t.status === "done").length;
    const cancelledTrips = trips.filter((t) => t.status === "CANCELLED" || t.status === "canceled").length;

    const totalRevenue = trips.reduce((sum, t) => sum + (Number(t.price) || 0), 0);
    const companyCommission = totalRevenue * 0.10;
    const driversNet = totalRevenue - companyCommission;

    const onlineDrivers = drivers.filter((d) => d.status === "online" || d.available).length;

    this.setAdminText("adminTotalTrips", totalTrips);
    this.setAdminText("adminActiveTrips", activeTrips);
    this.setAdminText("adminCompletedTrips", completedTrips);
    this.setAdminText("adminCancelledTrips", cancelledTrips);
    this.setAdminText("adminTotalDrivers", drivers.length);
    this.setAdminText("adminOnlineDrivers", onlineDrivers);
    this.setAdminText("adminTotalUsers", users.length);
    this.setAdminText("adminTotalRevenue", `${Math.round(totalRevenue)} ج.م`);
    this.setAdminText("adminCommission", `${Math.round(companyCommission)} ج.م`);
    this.setAdminText("adminDriversPayout", `${Math.round(driversNet)} ج.م`);
  }

  setAdminText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  renderAdminDrivers(driversObj) {
    const tbody = document.getElementById("adminDriversTableBody");
    if (!tbody) return;
    const list = Object.entries(driversObj);
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">لا يوجد كباتن مسجلون بعد.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(([id, d]) => `
      <tr>
        <td><b>${d.name || "كابتن العاصمة"}</b></td>
        <td><a href="tel:${d.phone}" style="color:var(--gold-light)">${d.phone || "01094129592"}</a></td>
        <td>${d.carModel || "كود 1"} (${d.carPlate || "شمال سيناء"})</td>
        <td><span class="status-badge ${d.available ? 'green' : 'yellow'}">${d.available ? 'متاح' : 'غير متاح'}</span></td>
        <td>⭐ ${Number(d.rating || 5.0).toFixed(1)}</td>
        <td>${d.totalTrips || 0}</td>
        <td>
          <button class="chip-btn" onclick="window.app.toggleDriverApproval('${id}', ${!d.approved})">
            ${d.approved ? 'إيقاف 🛑' : 'اعتماد ✓'}
          </button>
        </td>
      </tr>
    `).join("");
  }

  renderAdminUsers(usersObj) {
    const tbody = document.getElementById("adminUsersTableBody");
    if (!tbody) return;
    const list = Object.entries(usersObj);
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">لا يوجد عملاء مسجلون بعد.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(([id, u]) => `
      <tr>
        <td><b>${u.name || "عميل"}</b></td>
        <td><a href="tel:${u.phone}">${u.phone || "—"}</a></td>
        <td>${u.email || "—"}</td>
        <td><span class="status-badge ${u.status === 'blocked' ? 'red' : 'green'}">${u.status === 'blocked' ? 'محظور' : 'نشط'}</span></td>
        <td>
          <button class="chip-btn" onclick="window.app.toggleUserBlock('${id}', ${u.status !== 'blocked'})">
            ${u.status === 'blocked' ? 'فك الحظر' : 'حظر الحساب'}
          </button>
        </td>
      </tr>
    `).join("");
  }

  renderAdminTrips(tripsObj) {
    const tbody = document.getElementById("adminTripsTableBody");
    if (!tbody) return;
    const list = Object.entries(tripsObj).reverse().slice(0, 50);
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">لا توجد رحلات مسجلة بعد.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(([id, t]) => `
      <tr>
        <td><code>${id.slice(0, 8)}</code></td>
        <td>${t.customerName || "عميل"} (${t.customerPhone || "—"})</td>
        <td>${t.from} ← ${t.to}</td>
        <td><b>${t.price} ج.م</b></td>
        <td><span class="status-badge ${this.getStatusBadgeClass(t.status)}">${this.getStatusName(t.status)}</span></td>
        <td>${t.driverName || "—"}</td>
        <td>${new Date(t.createdAt || Date.now()).toLocaleTimeString("ar-EG")}</td>
        <td>
          <button class="chip-btn" onclick="window.app.cancelTripByAdmin('${id}')">إلغاء</button>
        </td>
      </tr>
    `).join("");
  }

  renderAdminComplaints(complaintsObj) {
    const tbody = document.getElementById("adminComplaintsTableBody");
    if (!tbody) return;
    const list = Object.entries(complaintsObj).reverse();
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">لا توجد شكاوى واردة حالياً.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(([id, c]) => `
      <tr>
        <td>${c.userName || "مستخدم"} (${c.userPhone || "—"})</td>
        <td>${c.tripId ? c.tripId.slice(0,8) : 'عام'}</td>
        <td>${c.message}</td>
        <td>${new Date(c.createdAt).toLocaleDateString('ar-EG')}</td>
        <td><span class="status-badge ${c.resolved ? 'green' : 'yellow'}">${c.resolved ? 'محلولة' : 'قيد المراجعة'}</span></td>
      </tr>
    `).join("");
  }

  toggleDriverApproval(driverId, approve) {
    if (this.rtdb) {
      this.rtdb.ref(`drivers/${driverId}/approved`).set(approve);
      this.showToast(approve ? "تم اعتماد الكابتن بنجاح" : "تم إيقاف حساب الكابتن");
    }
  }

  toggleUserBlock(userId, block) {
    if (this.rtdb) {
      this.rtdb.ref(`users/${userId}/status`).set(block ? "blocked" : "active");
      this.showToast(block ? "تم حظر الحساب" : "تم فك الحظر عن الحساب");
    }
  }

  cancelTripByAdmin(tripId) {
    if (confirm("هل أنت متأكد من إلغاء هذه الرحلة إدارياً؟")) {
      this.dispatch.cancelTrip(tripId, "إلغاء إداري");
      this.showToast("تم إلغاء الرحلة.");
    }
  }

  exportReportToCSV() {
    const trips = Object.values(this.adminData.trips || {});
    let csv = "المعرف,العميل,الهاتف,الانطلاق,الوجهة,السعر,طريقة_الدفع,الحالة,السائق,التاريخ\n";
    trips.forEach((t) => {
      csv += `"${t.id}","${t.customerName}","${t.customerPhone}","${t.from}","${t.to}",${t.price},"${t.paymentMethod || 'كاش'}","${t.status}","${t.driverName || ''}","${new Date(t.createdAt).toLocaleDateString('ar-EG')}"\n`;
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `تقرير_رحلات_تاكسي_العاصمة_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast("تم تصدير التقرير بنجاح!");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // UI HELPERS & NAVIGATION
  // ═════════════════════════════════════════════════════════════════════════
  switchView(viewName) {
    document.querySelectorAll(".app-view").forEach((v) => v.classList.remove("active"));
    document.querySelectorAll(".nav-tab-btn").forEach((b) => b.classList.remove("active"));

    const targetView = document.getElementById(`view-${viewName}`);
    const targetTab = document.querySelector(`[data-view="${viewName}"]`);

    if (targetView) targetView.classList.add("active");
    if (targetTab) targetTab.classList.add("active");

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (viewName === "customer" && this.maps) {
      setTimeout(() => {
        if (this.maps.leafletMap) this.maps.leafletMap.invalidateSize();
      }, 250);
    }
  }

  getStatusName(s) {
    return (
      {
        REQUESTED: "بانتظار كابتن",
        pending: "قيد الانتظار",
        ACCEPTED: "تم القبول",
        ARRIVED: "الكابتن وصل للمكان",
        IN_PROGRESS: "الرحلة جارية",
        COMPLETED: "مكتملة",
        CANCELLED: "ملغاة"
      }[s] || s || "—"
    );
  }

  getStatusBadgeClass(s) {
    return (
      {
        REQUESTED: "yellow",
        pending: "yellow",
        ACCEPTED: "blue",
        ARRIVED: "green",
        IN_PROGRESS: "blue",
        COMPLETED: "green",
        CANCELLED: "red"
      }[s] || "yellow"
    );
  }

  showToast(msg) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

  bindDOMEvents() {
    // Navigation tabs
    document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.switchView(btn.dataset.view));
    });

    // Car category cards
    document.querySelectorAll(".car-card-option").forEach((card) => {
      card.addEventListener("click", () => {
        document.querySelectorAll(".car-card-option").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        this.selectedCarType = card.dataset.cartype;
        this.updateRouteAndFare();
      });
    });

    // Payment method switcher
    document.querySelectorAll(".payment-method-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".payment-method-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        this.selectedPaymentMethod = chip.dataset.method;
      });
    });

    // Driver availability toggle
    const toggle = document.getElementById("driverOnlineToggle");
    if (toggle) {
      toggle.addEventListener("change", (e) => this.toggleDriverOnline(e.target.checked));
    }

    // Modal close handlers
    document.querySelectorAll(".modal-close-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".modal-overlay").forEach((m) => m.classList.remove("open"));
      });
    });
  }

  setupPWA() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").then(
          (reg) => console.log("SW registered with scope:", reg.scope),
          (err) => console.log("SW registration failed:", err)
        );
      });
    }

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      const installBtn = document.getElementById("pwaInstallBtn");
      if (installBtn) {
        installBtn.style.display = "inline-flex";
        installBtn.onclick = () => {
          this.deferredPrompt.prompt();
          this.deferredPrompt.userChoice.then(() => {
            this.deferredPrompt = null;
            installBtn.style.display = "none";
          });
        };
      }
    });
  }
}

// Instantiate and expose globally
window.app = new CapitalTaxiApp();
document.addEventListener("DOMContentLoaded", () => window.app.init());
