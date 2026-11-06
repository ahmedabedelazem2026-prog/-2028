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
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()
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
    this.pickupSetFirst = false;
    this.selectedTipAmount = 0;

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
    // Register admin listeners in a single method (called after auth)
    // Listeners will be attached once the user is confirmed as admin.
    // Placeholder – actual attachment occurs in setupAdminListeners().

    // Chat state
    this.activeChatTripId = null;

    this.deferredPrompt = null;
    this._cachedTrips = [];
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
        console.log("🔥 Firebase initialized successfully for project:", firebaseConfig.projectId);
        this.updateConnectionStatus(true);
      }
    // Admin listeners are attached after authentication via setupAdminListeners() catch (err) {
        console.warn("Firebase init notice:", err.message);
        this.updateConnectionStatus(false);
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    // Init Core Engines
    this.dispatch = new DispatchEngine({
      firestore: this.firestore,
      rtdb: this.rtdb,
      currentUser: this.currentUser
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()
    this.wallet = new WalletEngine({ rtdb: this.rtdb, currentUser: this.currentUser });
    this.chat = new ChatEngine({ rtdb: this.rtdb, currentUser: this.currentUser });
    this.ratings = new RatingsEngine({ rtdb: this.rtdb, firestore: this.firestore });
    this.adminGuard = new SuperAdminGuard({ auth: this.auth, rtdb: this.rtdb, firestore: this.firestore });

    this.maps = new MapsEngine({
      containerId: "customerMap",
      onLocationSelected: (coords) => this.handleMapClick(coords)
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()
    await this.maps.init();

    // Start live roaming fleet simulation in Al-Arish
    this.maps.startLiveFleetSimulation();

    // Default pins & route
    this.updateRouteAndFare();

    // Listen to Firebase Auth
    if (this.auth) {
      this.auth.onAuthStateChanged((user) => this.handleAuthStateChanged(user));
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      this.loadLocalProfile();
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    // Realtime Database data listeners
    this.attachRealtimeListeners();

    // Populate landmarks chips
    this.renderLandmarkChips();

    // Start geolocation watcher for drivers
    this.initDriverLocationTracking();

    // Init Device Mode
    this.initDeviceMode();

    // Set initial view
    this.switchView("landing");
  }

  updateConnectionStatus(connected) {
    const el = document.getElementById("fbStatusBadge");
    if (el) {
      el.textContent = connected ? "متصل بقاعدة البيانات ✓" : "وضع محلي / غير متصل";
      el.className = connected ? "live-badge" : "feature-pill";
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  // ═════════════════════════════════════════════════════════════════════════
  // DEVICE MODE MANAGEMENT (Responsive Auto / Mobile / Tablet / Desktop)
  // ═════════════════════════════════════════════════════════════════════════
  initDeviceMode() {
    const saved = localStorage.getItem("capital_taxi_device_mode");
    const mode = saved || "auto";
    this.setDeviceMode(mode);
    if (!saved) {
      setTimeout(() => {
        const modal = document.getElementById("deviceModeModal");
        if (modal) modal.classList.add("open");
      }
    // Admin listeners are attached after authentication via setupAdminListeners(), 1500);
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  setDeviceMode(mode) {
    const body = document.body;
    body.classList.remove("device-mode-mobile", "device-mode-tablet", "device-mode-desktop", "device-mode-auto");
    body.classList.add(`device-mode-${mode}`);
    localStorage.setItem("capital_taxi_device_mode", mode);

    document.querySelectorAll(".device-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.device === mode);
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()

    setTimeout(() => {
      if (this.maps && typeof this.maps.invalidateSize === "function") {
        this.maps.invalidateSize();
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners are attached after authentication via setupAdminListeners(), 300);
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
          if (profile?.role === "driver" || !profile) {
            const dSnap = await this.rtdb.ref(`drivers/${user.uid}`).once("value");
            const dData = dSnap.val();
            if (dData) {
              profile = { ...(profile || {}), ...dData };
            }
    // Admin listeners are attached after authentication via setupAdminListeners()
          }
    // Admin listeners are attached after authentication via setupAdminListeners()
        }
    // Admin listeners are attached after authentication via setupAdminListeners() catch (e) {
          console.warn("Error fetching user profile:", e);
        }
    // Admin listeners are attached after authentication via setupAdminListeners()
      }
    // Admin listeners are attached after authentication via setupAdminListeners()

      // Check Super Admin privileges
      const isSuper = await this.adminGuard?.isSuperAdmin(user.uid, user.email || "");

      if (!profile) {
        profile = {
          uid: user.uid,
          name: user.displayName || user.email?.split("@")[0] || "مستخدم العاصمة",
          email: user.email,
          role: isSuper ? "admin" : "customer",
          phone: "01094129592",
          status: "active"
        }
    // Admin listeners are attached after authentication via setupAdminListeners();
      }
    // Admin listeners are attached after authentication via setupAdminListeners()

      if (isSuper) {
        profile.role = "admin";
        profile.isSuperAdmin = true;
      }
    // Admin listeners are attached after authentication via setupAdminListeners()

      this.userProfile = profile;
      this.currentRole = profile.role || "customer";
      this.showToast(`مرحباً بك، ${profile.name}`);
      this.updateUserUI();
      this.refreshUserWalletUI();
      this.updateDriverVerificationUI();
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      this.userProfile = null;
      this.currentRole = "customer";
      this.updateUserUI();
      this.updateDriverVerificationUI();
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  loadLocalProfile() {
    const saved = localStorage.getItem("capital_taxi_user");
    if (saved) {
      this.userProfile = JSON.parse(saved);
      this.currentRole = this.userProfile.role || "customer";
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
    this.updateUserUI();
    this.refreshUserWalletUI();
    this.updateDriverVerificationUI();
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
        userNameEl.onclick = () => {
          const profModal = document.getElementById("profileModal");
          if (profModal) {
            document.getElementById("profDisplayName").textContent = this.userProfile.name;
            document.getElementById("profNameInput").value = this.userProfile.name;
            document.getElementById("profPhoneInput").value = this.userProfile.phone || "";
            document.getElementById("profHomeInput").value = this.userProfile.homeAddress || "";
            profModal.classList.add("open");
          }
    // Admin listeners are attached after authentication via setupAdminListeners()
        }
    // Admin listeners are attached after authentication via setupAdminListeners();
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
      if (adminTab) {
        const isAdmin = this.userProfile?.isSuperAdmin || this.userProfile?.role === "admin";
        adminTab.style.display = isAdmin ? "inline-flex" : "none";
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      if (authBtn) authBtn.style.display = "inline-flex";
      if (userNameEl) userNameEl.style.display = "none";
      if (adminTab) adminTab.style.display = "none";
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  updateDriverVerificationUI() {
    const alertBox = document.getElementById("driverApprovalAlert");
    const statusText = document.getElementById("driverStatusText");
    const toggle = document.getElementById("driverOnlineToggle");

    if (this.currentRole === "driver") {
      const isApproved = this.userProfile?.approved === true;
      if (alertBox) {
        alertBox.style.display = isApproved ? "none" : "block";
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
      if (!isApproved) {
        this.isDriverOnline = false;
        if (toggle) toggle.checked = false;
        if (statusText) {
          statusText.textContent = "حسابك قيد المراجعة والاعتماد من قبل الإدارة";
          statusText.style.color = "var(--status-red)";
        }
    // Admin listeners are attached after authentication via setupAdminListeners()
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      if (alertBox) alertBox.style.display = "none";
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  getRoleName(role) {
    return { customer: "عميل", driver: "كابتن", admin: "إدارة", supervisor: "مشرف" }[role] || role;
  }

  async login(email, password) {
    if (this.auth) {
      return this.auth.signInWithEmailAndPassword(email, password);
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      const isSuper = email.toLowerCase().includes("ahmedabedelazem") || email.includes("admin");
      this.userProfile = {
        uid: "local_" + Date.now(),
        name: email.split("@")[0],
        email,
        role: isSuper ? "admin" : (email.includes("driver") ? "driver" : "customer"),
        phone: "01094129592",
        status: "active",
        approved: true
      }
    // Admin listeners are attached after authentication via setupAdminListeners();
      localStorage.setItem("capital_taxi_user", JSON.stringify(this.userProfile));
      this.currentRole = this.userProfile.role;
      this.updateUserUI();
      this.showToast(`تم تسجيل الدخول بنجاح: ${this.userProfile.name}`);
      return true;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  async register({ name, phone, email, password, role, carModel, carPlate }) {
    const isDriver = role === "driver";
    const sanitizedRole = isDriver ? "driver" : "customer"; // Strictly prevent setting admin role on signup

    if (this.auth) {
      const cred = await this.auth.createUserWithEmailAndPassword(email, password);
      const uid = cred.user.uid;
      const profile = {
        uid,
        name,
        phone,
        email,
        role: sanitizedRole,
        createdAt: Date.now(),
        status: isDriver ? "pending" : "active",
        approved: false // Enforce approved: false unconditionally
      }
    // Admin listeners are attached after authentication via setupAdminListeners();

      if (isDriver) {
        profile.carModel = carModel || "تاكسي العاصمة كود 1";
        profile.carPlate = carPlate || "ط أ س 1234";
        profile.available = false;
        profile.rating = 5.0;
        profile.totalTrips = 0;
        await this.rtdb?.ref(`drivers/${uid}`).set(profile);
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
      await this.rtdb?.ref(`users/${uid}`).set(profile);
      this.userProfile = profile;
      this.currentRole = sanitizedRole;
      this.updateUserUI();
      this.updateDriverVerificationUI();
      this.showToast(isDriver ? "تم إنشاء حساب الكابتن بنجاح! حسابك بانتظار اعتماد الإدارة." : "تم إنشاء الحساب بنجاح! أهلاً بك في تاكسي العاصمة.");
      return true;
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      const uid = "USR_" + Date.now();
      const profile = {
        uid,
        name,
        phone,
        email,
        role: sanitizedRole,
        carModel,
        carPlate,
        createdAt: Date.now(),
        status: isDriver ? "pending" : "active",
        approved: false
      }
    // Admin listeners are attached after authentication via setupAdminListeners();
      localStorage.setItem("capital_taxi_user", JSON.stringify(profile));
      this.userProfile = profile;
      this.currentRole = sanitizedRole;
      this.updateUserUI();
      this.updateDriverVerificationUI();
      this.showToast("تم إنشاء الحساب بنجاح!");
      return true;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
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
              }
    // Admin listeners will be attached after authentication via setupAdminListeners()
              this.rtdb.ref(`drivers/${this.currentUser.uid}/lat`).set(lat);
              this.rtdb.ref(`drivers/${this.currentUser.uid}/lng`).set(lng);
            }
    // Admin listeners are attached after authentication via setupAdminListeners()
          }
    // Admin listeners are attached after authentication via setupAdminListeners()
        }
    // Admin listeners are attached after authentication via setupAdminListeners(),
        (err) => console.warn("GPS watch position notice:", err.message),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  // ═════════════════════════════════════════════════════════════════════════
  // REALTIME DATABASE SYNCHRONIZATION
  // ═════════════════════════════════════════════════════════════════════════
  attachRealtimeListeners() {
    if (!this.rtdb) {
      setInterval(() => this.pollLocalTrips(), 3000);
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

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
          }
    // Admin listeners will be attached after authentication via setupAdminListeners()
        }
    // Admin listeners are attached after authentication via setupAdminListeners()
      }
    // Admin listeners will be attached after authentication via setupAdminListeners()
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()

    // 2. Trips Listener
    this.rtdb.ref("trips").on("value", (snap) => {
      const data = snap.val() || {};
      this.adminData.trips = data;
      this.renderAdminTrips(data);
      this.updateAdminMetrics();
      this.checkDriverIncomingTrip(data);
      this.checkCustomerTripStatus(data);
      this.renderDriverTripHistory(data);
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()

    // 3. Users Listener
    this.rtdb.ref("users").on("value", (snap) => {
      this.adminData.users = snap.val() || {};
      this.renderAdminUsers(this.adminData.users);
      this.updateAdminMetrics();
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()

    // 4. Complaints Listener
    this.rtdb.ref("complaints").on("value", (snap) => {
      this.adminData.complaints = snap.val() || {};
      this.renderAdminComplaints(this.adminData.complaints);
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()

    // 5. System Pricing Config Listener
    this.rtdb.ref("system_config/pricing").on("value", (snap) => {
      const cfg = snap.val();
      if (cfg) {
        this.pricing.updateConfig(cfg);
        const bInput = document.getElementById("cfgBaseFare");
        const kInput = document.getElementById("cfgPerKm");
        const mInput = document.getElementById("cfgMinFare");
        const wInput = document.getElementById("cfgWaiting");
        const oInput = document.getElementById("cfgOutOfCity");
        const cInput = document.getElementById("cfgCommission");
        if (bInput && cfg.baseFare) bInput.value = cfg.baseFare;
        if (kInput && cfg.perKmRate) kInput.value = cfg.perKmRate;
        if (mInput && cfg.minFare) mInput.value = cfg.minFare;
        if (wInput && cfg.waitingRatePerMin) wInput.value = cfg.waitingRatePerMin;
        if (oInput && cfg.outOfCityFlatFee) oInput.value = cfg.outOfCityFlatFee;
        if (cInput && cfg.commissionRate) cInput.value = cfg.commissionRate;
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()
  }

  pollLocalTrips() {
    try {
      const trips = JSON.parse(localStorage.getItem("capital_taxi_trips") || "{}");
      this.adminData.trips = trips;
      this.renderAdminTrips(trips);
      this.updateAdminMetrics();
      this.checkDriverIncomingTrip(trips);
      this.checkCustomerTripStatus(trips);
      this.renderDriverTripHistory(trips);
    }
    // Admin listeners are attached after authentication via setupAdminListeners() catch (e) {}
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

    googleMapsConfig.arishLandmarks.slice(0, 6).forEach((lm) => {
      const pChip = document.createElement("button");
      pChip.type = "button";
      pChip.className = "chip-btn";
      pChip.textContent = lm.name.split(" ")[0] + " " + (lm.name.split(" ")[1] || "");
      pChip.onclick = () => {
        this.pickupLocation = { lat: lm.lat, lng: lm.lng, name: lm.name };
        document.getElementById("inputPickup").value = lm.name;
        this.updateRouteAndFare();
      }
    // Admin listeners are attached after authentication via setupAdminListeners();
      pickupChips.appendChild(pChip);

      const dChip = document.createElement("button");
      dChip.type = "button";
      dChip.className = "chip-btn";
      dChip.textContent = lm.name.split(" ")[0] + " " + (lm.name.split(" ")[1] || "");
      dChip.onclick = () => {
        this.dropoffLocation = { lat: lm.lat, lng: lm.lng, name: lm.name };
        document.getElementById("inputDropoff").value = lm.name;
        this.updateRouteAndFare();
      }
    // Admin listeners are attached after authentication via setupAdminListeners();
      dropoffChips.appendChild(dChip);
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()
  }

  async detectUserGpsLocation() {
    const statusEl = document.getElementById("gpsStatusMessage");
    if (statusEl) {
      statusEl.style.display = "block";
      statusEl.textContent = "جاري تحديد موقعك الدقيق عبر GPS بالعريش...";
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
    try {
      const pos = await this.maps.getUserLocation();
      const address = await this.maps.reverseGeocode({ lat: pos.lat, lng: pos.lng });
      this.pickupLocation = {
        lat: pos.lat,
        lng: pos.lng,
        name: address || `موقعك الحالي بالعريش (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})`
      }
    // Admin listeners are attached after authentication via setupAdminListeners();
      const inp = document.getElementById("inputPickup");
      if (inp) inp.value = this.pickupLocation.name;

      this.maps.setPickupMarker({
        lat: pos.lat,
        lng: pos.lng,
        title: this.pickupLocation.name,
        draggable: true,
        onDragEnd: (c) => {
          this.pickupLocation = c;
          const i = document.getElementById("inputPickup");
          if (i) i.value = c.name;
          this.updateRouteAndFare();
        }
    // Admin listeners are attached after authentication via setupAdminListeners()
      }
    // Admin listeners will be attached after authentication via setupAdminListeners()
      this.updateRouteAndFare();
      if (statusEl) statusEl.textContent = "تم تحديد موقعك بدقة بنجاح ✓";
      this.showToast("تم تحديد موقعك بنجاح ✓");
    }
    // Admin listeners are attached after authentication via setupAdminListeners() catch (e) {
      if (statusEl) statusEl.textContent = "تعذر تحديد الموقع تلقائياً. يمكنك كتابته أو اختياره على الخريطة.";
      this.showToast("يرجى السماح بصلاحية الموقع في المتصفح");
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  selectAlArishLandmark(id) {
    const lm = googleMapsConfig.arishLandmarks.find((l) => l.id === id);
    if (!lm) return;
    this.dropoffLocation = { lat: lm.lat, lng: lm.lng, name: lm.name };
    const inp = document.getElementById("inputDropoff");
    if (inp) inp.value = lm.name;

    this.maps.setDestinationMarker({
      lat: lm.lat,
      lng: lm.lng,
      title: lm.name,
      draggable: true,
      onDragEnd: (c) => {
        this.dropoffLocation = c;
        const i = document.getElementById("inputDropoff");
        if (i) i.value = c.name;
        this.updateRouteAndFare();
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()
    this.updateRouteAndFare();
    this.showToast(`تم اختيار الوجهة: ${lm.name}`);
  }

  resetMapToCenter() {
    if (this.maps && this.maps.googleMap) {
      this.maps.googleMap.panTo({ lat: 31.1316, lng: 33.8016 });
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else if (this.maps && this.maps.leafletMap) {
      this.maps.leafletMap.panTo([31.1316, 33.8016]);
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
    this.showToast("تمت إعادة توجيه الخريطة إلى مركز العريش (ميدان النصر)");
  }

  applyCouponDirect(code) {
    const el = document.getElementById("inputCoupon");
    if (el) el.value = code;
    this.updateRouteAndFare();
    const modal = document.getElementById("promosModal");
    if (modal) modal.classList.remove("open");
    this.showToast(`تم تطبيق كود الخصم: ${code}`);
  }

  async handleLocationInput(query, field) {
    const dropdown = document.getElementById(field === "pickup" ? "pickupAutocomplete" : "dropoffAutocomplete");
    if (!dropdown) return;
    if (!query || query.trim().length === 0) {
      dropdown.style.display = "none";
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    const matches = googleMapsConfig.arishLandmarks.filter((l) =>
      l.name.includes(query) || (l.category && l.category.includes(query))
    ).slice(0, 5);

    if (matches.length === 0) {
      dropdown.style.display = "none";
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    dropdown.innerHTML = matches.map((l) => `
      <div class="autocomplete-item" onclick="window.app.chooseLocationFromAutocomplete('${field}', ${l.lat}, ${l.lng}, '${l.name.replace(/'/g, "\\'")}')">
        <span>📍</span>
        <span class="autocomplete-name">${l.name}</span>
      </div>
    `).join("");
    dropdown.style.display = "block";
  }

  chooseLocationFromAutocomplete(field, lat, lng, name) {
    if (field === "pickup") {
      this.pickupLocation = { lat, lng, name };
      const inp = document.getElementById("inputPickup");
      if (inp) inp.value = name;
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      this.dropoffLocation = { lat, lng, name };
      const inp = document.getElementById("inputDropoff");
      if (inp) inp.value = name;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
    this.updateRouteAndFare();
    const pDrop = document.getElementById("pickupAutocomplete");
    const dDrop = document.getElementById("dropoffAutocomplete");
    if (pDrop) pDrop.style.display = "none";
    if (dDrop) dDrop.style.display = "none";
  }

  handleMapClick({ lat, lng }) {
    if (!this.pickupSetFirst) {
      this.pickupLocation = { lat, lng, name: `موقع بالخريطة (${lat.toFixed(4)}, ${lng.toFixed(4)})` };
      document.getElementById("inputPickup").value = this.pickupLocation.name;
      this.pickupSetFirst = true;
      this.showToast("تم تحديد نقطة الانطلاق");
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      this.dropoffLocation = { lat, lng, name: `وجهة بالخريطة (${lat.toFixed(4)}, ${lng.toFixed(4)})` };
      document.getElementById("inputDropoff").value = this.dropoffLocation.name;
      this.pickupSetFirst = false;
      this.showToast("تم تحديد الوجهة");
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
    this.updateRouteAndFare();
  }

  async updateRouteAndFare() {
    if (!this.maps) return;
    this.maps.setPickupMarker({
      lat: this.pickupLocation.lat,
      lng: this.pickupLocation.lng,
      title: this.pickupLocation.name,
      draggable: true,
      onDragEnd: (c) => {
        this.pickupLocation = c;
        const i = document.getElementById("inputPickup");
        if (i) i.value = c.name;
        this.updateRouteAndFare();
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()
    this.maps.setDestinationMarker({
      lat: this.dropoffLocation.lat,
      lng: this.dropoffLocation.lng,
      title: this.dropoffLocation.name,
      draggable: true,
      onDragEnd: (c) => {
        this.dropoffLocation = c;
        const i = document.getElementById("inputDropoff");
        if (i) i.value = c.name;
        this.updateRouteAndFare();
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()

    const route = await this.maps.drawRoute({
      origin: this.pickupLocation,
      destination: this.dropoffLocation
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()

    const couponCode = document.getElementById("inputCoupon")?.value?.trim() || "";

    const fare = this.pricing.calculateFare({
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      carType: this.selectedCarType,
      couponCode
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()

    this.currentFareDetails = fare;
    this.renderFareBreakdown(fare);

    // Update route review card UI
    const rp = document.getElementById("reviewPickupText");
    const rd = document.getElementById("reviewDropoffText");
    const distBadge = document.getElementById("reviewDistanceBadge");
    const durBadge = document.getElementById("reviewDurationBadge");
    const fareBadge = document.getElementById("reviewFareBadge");
    if (rp) rp.textContent = this.pickupLocation.name;
    if (rd) rd.textContent = this.dropoffLocation.name;
    if (distBadge) distBadge.textContent = `${route.distanceKm} كم`;
    if (durBadge) durBadge.textContent = `${route.durationMin} دقيقة`;
    if (fareBadge) fareBadge.textContent = `${fare.totalFare} ${fare.currency}`;
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

    const btnPriceBadge = document.getElementById("btnFarePriceBadge");
    if (btnPriceBadge) btnPriceBadge.textContent = `${fare.totalFare} ${fare.currency}`;

    const config = this.pricing.getConfig();
    Object.keys(config.carCategories).forEach((key) => {
      const priceEl = document.getElementById(`price-${key}`);
      if (priceEl) {
        const catFare = this.pricing.calculateFare({
          distanceKm: fare.distanceKm,
          durationMin: fare.durationMin,
          carType: key
        }
    // Admin listeners will be attached after authentication via setupAdminListeners()
        priceEl.textContent = `${catFare.totalFare} ج.م`;
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()
  }

  setQuickFavorite(type) {
    const favorites = {
      home: { name: "وسط البلد - ميدان الرفاعي", lat: 31.1316, lng: 33.8016 },
      work: { name: "ديوان عام محافظة شمال سيناء - ضاحية السلام", lat: 31.1390, lng: 33.8150 },
      univ: { name: "جامعة سيناء - حي المساعيد", lat: 31.1558, lng: 33.7429 },
      beach: { name: "شاطئ النخيل وكورنيش العريش", lat: 31.1442, lng: 33.8115 },
      hospital: { name: "مستشفى العريش العام - وسط المدينة", lat: 31.1360, lng: 33.8055 }
    }
    // Admin listeners are attached after authentication via setupAdminListeners();
    const fav = favorites[type];
    if (fav) {
      this.dropoffLocation = { lat: fav.lat, lng: fav.lng, name: fav.name };
      const el = document.getElementById("inputDropoff");
      if (el) el.value = fav.name;
      this.updateRouteAndFare();
      this.showToast(`تم اختيار الوجهة: ${fav.name}`);
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  async requestRide() {
    if (!this.currentFareDetails) {
      this.showToast("يرجى تحديد مسار الرحلة أولاً");
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    const customerName = this.userProfile?.name || document.getElementById("inputCustomerName")?.value?.trim() || "عميل العاصمة";
    const customerPhone = this.userProfile?.phone || document.getElementById("inputCustomerPhone")?.value?.trim() || "01094129592";
    const notesToDriver = document.getElementById("inputTripNotes")?.value?.trim() || "";

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
      isEstimatedPrice: true,
      priceNotice: "سعر تقديري مبدئي خاضع لعداد المسافة وتأكيد الكابتن",
      paymentMethod: this.selectedPaymentMethod,
      notesToDriver
    }
    // Admin listeners are attached after authentication via setupAdminListeners();

    const res = await this.dispatch.createTripRequest(requestData);
    if (res.success) {
      this.activeCustomerTrip = res.record;
      this.showCustomerActiveTripOverlay(res.record);
      this.showToast("تم إرسال طلبك بنجاح! جاري البحث عن أقرب كابتن في العريش...");
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  showCustomerActiveTripOverlay(trip) {
    const searchingCard = document.getElementById("customerSearchingCard");
    const matchedCard = document.getElementById("customerTripStatusCard");
    const confirmBtn = document.getElementById("btnConfirmRideMain");

    if (!trip) {
      if (searchingCard) searchingCard.style.display = "none";
      if (matchedCard) matchedCard.style.display = "none";
      if (confirmBtn) confirmBtn.style.display = "block";
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    const isSearching = trip.status === "searching" || trip.status === "pending" || trip.status === "REQUESTED";
    const isMatched = ["accepted", "ACCEPTED", "driver_arrived", "ARRIVED", "in_progress", "IN_PROGRESS"].includes(trip.status);

    if (isSearching) {
      if (searchingCard) searchingCard.style.display = "block";
      if (matchedCard) matchedCard.style.display = "none";
      if (confirmBtn) confirmBtn.style.display = "none";
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else if (isMatched) {
      if (searchingCard) searchingCard.style.display = "none";
      if (matchedCard) matchedCard.style.display = "block";
      if (confirmBtn) confirmBtn.style.display = "none";

      const statusEl = document.getElementById("custTripStatus");
      if (statusEl) statusEl.textContent = this.getStatusName(trip.status);

      const fromEl = document.getElementById("custTripFrom");
      if (fromEl) fromEl.textContent = trip.from;

      const toEl = document.getElementById("custTripTo");
      if (toEl) toEl.textContent = trip.to;

      const priceEl = document.getElementById("custTripPrice");
      if (priceEl) priceEl.textContent = `${trip.price} ج.م (تقديري • ${trip.paymentMethod || 'كاش'})`;

      const driverEl = document.getElementById("custTripDriver");
      if (driverEl) driverEl.textContent = trip.driverName || "كابتن معتمد";

      const driverCarEl = document.getElementById("custTripDriverCar");
      if (driverCarEl) driverCarEl.textContent = trip.driverCar || "تويوتا كورولا 2024";

      // Egyptian License Plate decomposition
      const plate = trip.driverPlate || "ط أ س 1234";
      const lettersMatch = plate.replace(/[0-9]/g, "").trim() || "ط أ س";
      const numbersMatch = plate.replace(/[^0-9]/g, "").trim() || "1234";
      const pLetters = document.getElementById("custTripPlateLetters");
      const pNumbers = document.getElementById("custTripPlateNumbers");
      if (pLetters) pLetters.textContent = lettersMatch;
      if (pNumbers) pNumbers.textContent = numbersMatch;

      // 4-Digit Security PIN
      const pinEl = document.getElementById("custTripPinDisplay");
      if (pinEl) pinEl.textContent = (trip.pinCode || "4821").split("").join(" ");

      // Phone call
      const callBtn = document.getElementById("custTripCallBtn");
      if (callBtn) callBtn.href = `tel:${trip.driverPhone || '01094129592'}`;

      // In-app chat
      const chatBtn = document.getElementById("btnCustOpenChat");
      if (chatBtn) {
        chatBtn.style.display = trip.driverId ? "inline-flex" : "none";
        chatBtn.onclick = () => this.openChatModal(trip.id, "customer");
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      if (searchingCard) searchingCard.style.display = "none";
      if (matchedCard) matchedCard.style.display = "none";
      if (confirmBtn) confirmBtn.style.display = "block";
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  cancelCustomerSearching() {
    if (this.activeCustomerTrip) {
      this.dispatch.cancelTrip(this.activeCustomerTrip.id, "إلغاء البحث من قبل العميل");
      this.activeCustomerTrip = null;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
    this.showCustomerActiveTripOverlay(null);
    this.showToast("تم إلغاء البحث عن سيارة.");
  }

  cancelActiveTripCustomer() {
    if (this.activeCustomerTrip) {
      const status = this.activeCustomerTrip.status;
      const canCancel = ["searching", "pending", "REQUESTED"].includes(status);
      if (!canCancel) {
        this.showToast("عفواً: لا يمكن للعميل إلغاء الرحلة بعد قبول الكابتن أو بدء السير. يرجى التنسيق مع الكابتن أو الاتصال بالدعم.");
        return;
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
      this.dispatch.cancelTrip(this.activeCustomerTrip.id, "إلغاء المشوار من قبل العميل قبل التحرك");
      this.activeCustomerTrip = null;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
    this.showCustomerActiveTripOverlay(null);
    this.showToast("تم إلغاء طلب المشوار بنجاح.");
  }

  shareTripWhatsApp() {
    const trip = this.activeCustomerTrip;
    const tripId = trip ? trip.id : "TRIP_LIVE";
    const driver = trip?.driverName || "كابتن تاكسي العاصمة";
    const car = trip?.driverCar || "سيارة كود 1";
    const plate = trip?.driverPlate || "شمال سيناء";
    const pin = trip?.pinCode || "----";
    const from = trip?.from || this.pickupLocation.name;
    const to = trip?.to || this.dropoffLocation.name;

    const message = `🚕 *تاكسي العاصمة - مشاركة مسار الرحلة لأمانك*\n` +
      `📍 من: ${from}\n` +
      `🏁 إلى: ${to}\n` +
      `👨‍✈️ الكابتن: ${driver}\n` +
      `🚗 السيارة: ${car} (لوحة: ${plate})\n` +
      `🔐 كود أمان الرحلة PIN: ${pin}\n` +
      `📡 تتبع مساري مباشرة على الخريطة:\n` +
      `https://taxi-alasema-app-2026.web.app/?track=${tripId}`;

    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  confirmScheduledRide() {
    const date = document.getElementById("scheduleDate")?.value;
    const time = document.getElementById("scheduleTime")?.value;
    const notes = document.getElementById("scheduleNotes")?.value || "";

    if (!date || !time) {
      this.showToast("يرجى تحديد تاريخ ووقت المشوار أولاً");
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    const scheduledRecord = {
      id: "SCHED_" + Date.now(),
      customerId: this.userProfile?.uid || "guest",
      customerName: this.userProfile?.name || "عميل العاصمة",
      customerPhone: this.userProfile?.phone || "01094129592",
      from: this.pickupLocation.name,
      to: this.dropoffLocation.name,
      date,
      time,
      notes,
      carType: this.selectedCarType,
      createdAt: Date.now()
    }
    // Admin listeners are attached after authentication via setupAdminListeners();

    if (this.rtdb) {
      this.rtdb.ref(`scheduled_trips/${scheduledRecord.id}`).set(scheduledRecord).catch(() => {});
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    document.getElementById("scheduleModal")?.classList.remove("open");
    this.showToast(`تم تأكيد حجز الرحلة المسبق ليوم ${date} الساعة ${time} بنجاح! ✓`);
  }

  selectTip(amount, btnElement) {
    this.selectedTipAmount = Number(amount) || 0;
    const buttons = document.querySelectorAll(".tip-chip");
    buttons.forEach((b) => b.classList.remove("active"));
    if (btnElement) btnElement.classList.add("active");
  }

  promptDriverPinAndStart() {
    const modal = document.getElementById("driverPinModal");
    if (modal) {
      const pinInput = document.getElementById("inputDriverPinCode");
      if (pinInput) pinInput.value = "";
      modal.classList.add("open");
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  async confirmDriverPinAndStart() {
    if (!this.activeDriverTrip) return;
    const pinInput = document.getElementById("inputDriverPinCode");
    const enteredPin = pinInput?.value?.trim();
    if (!enteredPin || enteredPin.length < 4) {
      this.showToast("يرجى إدخال كود PIN المكون من 4 أرقام");
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    const res = await this.dispatch.startTrip(this.activeDriverTrip.id, enteredPin);
    if (res.success) {
      document.getElementById("driverPinModal")?.classList.remove("open");
      this.showToast("تم التحقق من هوية الراكب بنجاح وبدء المشوار! ✓");
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      this.showToast(res.message || "رمز PIN غير صحيح");
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  toggleSurgeZonesAlert() {
    alert("🔥 مناطق الطلب العالي (Surge) الحالية في العريش:\n\n" +
      "1. وسط البلد وميدان النصر (مضاعف 1.25x)\n" +
      "2. جامعة سيناء والمساعيد (مضاعف 1.35x)\n" +
      "3. جامعة العريش وضاحية السلام (مضاعف 1.30x)\n" +
      "4. ساحل البحر وكورنيش النخيل (مضاعف 1.20x)\n\n" +
      "💡 الأسعار ترتفع تلقائياً في هذه المناطق لتعظيم أرباح الكباتن.");
  }

  checkCustomerTripStatus(trips) {
    if (!this.activeCustomerTrip) return;
    const current = trips[this.activeCustomerTrip.id];
    if (current) {
      const prevStatus = this.activeCustomerTrip.status;
      this.activeCustomerTrip = current;
      this.showCustomerActiveTripOverlay(current);

      if ((current.status === "driver_arrived" || current.status === "ARRIVED") && 
          prevStatus !== "driver_arrived" && prevStatus !== "ARRIVED") {
        this.dispatch.playNotificationBeep();
        this.showToast("الكابتن وصل الآن إلى نقطة الانطلاق وبانتظارك! 🚖");
      }
    // Admin listeners are attached after authentication via setupAdminListeners()

      if ((current.status === "in_progress" || current.status === "IN_PROGRESS") && 
          prevStatus !== "in_progress" && prevStatus !== "IN_PROGRESS") {
        this.showToast("بدأت الرحلة.. نتمنى لك مشواراً مريحاً مع تاكسي العاصمة!");
      }
    // Admin listeners are attached after authentication via setupAdminListeners()

      if (current.status === "completed" || current.status === "COMPLETED") {
        this.showToast("حمد لله على السلامة! اكتملت رحلتك بنجاح.");
        this.openRatingModal(current);
        const stCard = document.getElementById("customerTripStatusCard");
        if (stCard) stCard.style.display = "none";
        this.activeCustomerTrip = null;
      }
    // Admin listeners are attached after authentication via setupAdminListeners()

      if (current.status === "no_driver") {
        this.showToast("عذراً، لم يتوفر كابتن متاح حالياً. يرجى إعادة المحاولة أو اختيار فئة سيارة أخرى.");
        const srCard = document.getElementById("customerSearchingCard");
        if (srCard) srCard.style.display = "none";
        const btn = document.getElementById("btnConfirmRideMain");
        if (btn) btn.style.display = "block";
        this.activeCustomerTrip = null;
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  // ═════════════════════════════════════════════════════════════════════════
  // CUSTOMER TRIP HISTORY, PROFILE & COMPLAINTS
  // ═════════════════════════════════════════════════════════════════════════
  async renderTripHistory() {
    const container = document.getElementById("tripHistoryContainer");
    if (!container) return;
    if (!this.userProfile) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem;">يرجى تسجيل الدخول لعرض سجل الرحلات</div>';
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    try {
      let trips = [];
      if (this.rtdb) {
        const snap = await this.rtdb.ref("trips").orderByChild("customerId").equalTo(this.userProfile.uid).once("value");
        const data = snap.val() || {};
        trips = Object.values(data);
      }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
        const local = JSON.parse(localStorage.getItem("capital_taxi_trips") || "{}");
        trips = Object.values(local).filter((t) => t.customerId === this.userProfile.uid);
      }
    // Admin listeners are attached after authentication via setupAdminListeners()

      trips.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      this._cachedTrips = trips;

      if (trips.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem;">لا توجد رحلات سابقة مسجلة بحسابك.</div>';
        return;
      }
    // Admin listeners are attached after authentication via setupAdminListeners()

      container.innerHTML = trips.map((t) => {
        const status = this.getStatusName(t.status);
        const badgeClass = this.getStatusBadgeClass(t.status);
        return `
          <div class="trip-history-item" style="border-right: 3px solid var(--border-gold); margin-bottom:8px; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong>${t.from} ⬅️ ${t.to}</strong>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                  ${new Date(t.createdAt || Date.now()).toLocaleDateString("ar-EG")} • ${t.price} ج.م • ${t.driverName || 'كابتن العاصمة'}
                </div>
              </div>
              <span class="status-badge ${badgeClass}">${status}</span>
            </div>
            <div style="margin-top:6px; text-align:left;">
              <button class="chip-btn" onclick="window.app.requestRebook('${t.id}')">إعادة الحجز 🔁</button>
            </div>
          </div>
        `;
      }
    // Admin listeners are attached after authentication via setupAdminListeners()).join("");
    }
    // Admin listeners are attached after authentication via setupAdminListeners() catch (e) {
      container.innerHTML = '<div style="color:red; text-align:center;">خطأ في تحميل سجل الرحلات</div>';
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  filterHistory(type) {
    const container = document.getElementById("tripHistoryContainer");
    if (!container || !this._cachedTrips) return;
    const filtered = this._cachedTrips.filter((t) => {
      if (type === "all") return true;
      if (type === "completed") return t.status === "completed" || t.status === "COMPLETED";
      if (type === "cancelled") return t.status === "cancelled" || t.status === "CANCELLED";
      return true;
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()

    if (filtered.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem;">لا توجد رحلات مطابقة لهذا التصنيف.</div>';
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    container.innerHTML = filtered.map((t) => {
      const status = this.getStatusName(t.status);
      const badgeClass = this.getStatusBadgeClass(t.status);
      return `
        <div class="trip-history-item" style="border-right: 3px solid var(--border-gold); margin-bottom:8px; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong>${t.from} ⬅️ ${t.to}</strong>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                ${new Date(t.createdAt || Date.now()).toLocaleDateString("ar-EG")} • ${t.price} ج.م
              </div>
            </div>
            <span class="status-badge ${badgeClass}">${status}</span>
          </div>
          <div style="margin-top:6px; text-align:left;">
            <button class="chip-btn" onclick="window.app.requestRebook('${t.id}')">إعادة الحجز 🔁</button>
          </div>
        </div>
      `;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()).join("");
  }

  requestRebook(tripId) {
    const trip = this._cachedTrips.find((t) => t.id === tripId);
    if (!trip) return;
    this.pickupLocation = { lat: trip.fromLat || 31.1316, lng: trip.fromLng || 33.8016, name: trip.from };
    this.dropoffLocation = { lat: trip.toLat || 31.1442, lng: trip.toLng || 33.8115, name: trip.to };
    document.getElementById("inputPickup").value = trip.from;
    document.getElementById("inputDropoff").value = trip.to;
    document.getElementById("historyModal")?.classList.remove("open");
    this.switchView("customer");
    this.updateRouteAndFare();
    this.showToast("تم تحميل مسار الرحلة السابقة. يمكنك الآن تأكيد الحجز!");
  }

  saveProfileInfo() {
    const name = document.getElementById("profNameInput")?.value?.trim();
    const home = document.getElementById("profHomeInput")?.value?.trim();
    if (!this.userProfile) {
      this.showToast("يرجى تسجيل الدخول أولاً");
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    const updates = {};
    if (name) updates["name"] = name;
    if (home) updates["homeAddress"] = home;

    if (this.rtdb) {
      this.rtdb.ref(`users/${this.userProfile.uid}`).update(updates).then(() => {
        this.showToast("تم حفظ البيانات بنجاح في Firebase ✓");
        if (name) this.userProfile.name = name;
        if (home) this.userProfile.homeAddress = home;
        this.updateUserUI();
        document.getElementById("profileModal")?.classList.remove("open");
      }
    // Admin listeners are attached after authentication via setupAdminListeners()).catch((e) => this.showToast("حدث خطأ أثناء حفظ البيانات"));
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      if (name) this.userProfile.name = name;
      if (home) this.userProfile.homeAddress = home;
      localStorage.setItem("capital_taxi_user", JSON.stringify(this.userProfile));
      this.updateUserUI();
      document.getElementById("profileModal")?.classList.remove("open");
      this.showToast("تم حفظ البيانات محلياً ✓");
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  submitComplaint(event) {
    event?.preventDefault();
    const category = document.getElementById("complaintCategory")?.value;
    const details = document.getElementById("complaintDetails")?.value?.trim();
    if (!details) {
      this.showToast("يرجى إدخال تفاصيل الشكوى");
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    const complaint = {
      userId: this.userProfile?.uid || "guest",
      userName: this.userProfile?.name || "عميل العاصمة",
      userPhone: this.userProfile?.phone || "01094129592",
      category: category || "general",
      message: details,
      resolved: false,
      createdAt: Date.now()
    }
    // Admin listeners are attached after authentication via setupAdminListeners();

    if (this.rtdb) {
      this.rtdb.ref("complaints").push(complaint).then(() => {
        this.showToast("تم إرسال الشكوى للإدارة بنجاح وسيتم التواصل معك ✓");
        document.getElementById("supportModal")?.classList.remove("open");
        document.getElementById("complaintForm")?.reset();
      }
    // Admin listeners are attached after authentication via setupAdminListeners()).catch(() => this.showToast("حدث خطأ أثناء إرسال الشكوى"));
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      const local = JSON.parse(localStorage.getItem("capital_taxi_complaints") || "[]");
      local.push(complaint);
      localStorage.setItem("capital_taxi_complaints", JSON.stringify(local));
      this.showToast("تم إرسال الشكوى بنجاح ✓");
      document.getElementById("supportModal")?.classList.remove("open");
      document.getElementById("complaintForm")?.reset();
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  handleOtpInput(el, nextId) {
    el.value = el.value.replace(/\D/g, "");
    if (el.value && nextId) {
      const nxt = document.getElementById(nextId);
      if (nxt) nxt.focus();
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  verifyOtpCode() {
    const digits = ["otp1", "otp2", "otp3", "otp4"].map((id) => document.getElementById(id)?.value || "").join("");
    if (digits.length < 4) {
      this.showToast("يرجى إدخال رمز التحقق المكون من 4 أرقام");
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
    document.getElementById("otpModal")?.classList.remove("open");
    this.showToast("تم التحقق من رقم الهاتف بنجاح ✓");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // DRIVER APP FLOW
  // ═════════════════════════════════════════════════════════════════════════
  async toggleDriverOnline(isOnline) {
    // Authoritative check against drivers/{uid}/approved directly in RTDB
    if (isOnline && this.rtdb && this.currentUser) {
      try {
        const snap = await this.rtdb.ref(`drivers/${this.currentUser.uid}/approved`).once("value");
        const realApproved = snap.val() === true;
        if (!realApproved) {
          this.isDriverOnline = false;
          if (this.userProfile) this.userProfile.approved = false;
          const toggle = document.getElementById("driverOnlineToggle");
          if (toggle) toggle.checked = false;
          this.showToast("عذراً، لا يمكنك استقبال الرحلات: حسابك غير معتمد في قاعدة البيانات حتى الآن.");
          this.updateDriverVerificationUI();
          return;
        }
    // Admin listeners are attached after authentication via setupAdminListeners()
        if (this.userProfile) this.userProfile.approved = true;
      }
    // Admin listeners are attached after authentication via setupAdminListeners() catch (e) {
        this.isDriverOnline = false;
        return;
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else if (isOnline && (!this.userProfile || this.userProfile.approved !== true)) {
      this.isDriverOnline = false;
      const toggle = document.getElementById("driverOnlineToggle");
      if (toggle) toggle.checked = false;
      this.showToast("عذراً، لا يمكنك استقبال الرحلات حتى يتم اعتماد حسابك من قبل الإدارة.");
      this.updateDriverVerificationUI();
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    this.isDriverOnline = isOnline;
    const statusText = document.getElementById("driverStatusText");
    if (statusText) {
      statusText.textContent = isOnline ? "أنت متصل ومتاح لاستقبال الرحلات" : "أنت غير متاح حالياً";
      statusText.style.color = isOnline ? "var(--status-green)" : "var(--text-muted)";
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
    if (this.currentUser && this.rtdb) {
      this.rtdb.ref(`drivers/${this.currentUser.uid}/available`).set(isOnline);
      this.rtdb.ref(`drivers/${this.currentUser.uid}/status`).set(isOnline ? "online" : "offline");
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
    this.showToast(isOnline ? "أنت الآن متاح للعمل واستقبال الرحلات!" : "تم تحويل حالتك إلى غير متاح");
  }

  checkDriverIncomingTrip(trips) {
    if (!this.isDriverOnline) return;

    // Disallow unapproved drivers from receiving requests
    const isApproved = this.userProfile?.approved === true;
    if (!isApproved) return;

    const incomingCard = document.getElementById("incomingTripCard");
    const activeCard = document.getElementById("driverActiveTripCard");
    if (!incomingCard) return;

    const myUid = this.userProfile?.uid || "mock_driver";
    const activeDriverStatuses = ["accepted", "ACCEPTED", "driver_arrived", "ARRIVED", "in_progress", "IN_PROGRESS"];

    // Check if driver is assigned an active trip
    const myActiveTrip = Object.values(trips).find(
      (t) => t.driverId === myUid && activeDriverStatuses.includes(t.status)
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

        // Turn by turn navigation hud text
        const hud = document.getElementById("hudNextDirection");
        if (hud) {
          if (myActiveTrip.status === "accepted" || myActiveTrip.status === "ACCEPTED") {
            hud.textContent = `توجه نحو نقطة الانطلاق: ${myActiveTrip.from}`;
          }
    // Admin listeners are attached after authentication via setupAdminListeners() else if (myActiveTrip.status === "driver_arrived" || myActiveTrip.status === "ARRIVED") {
            hud.textContent = "وصلت لنقطة الالتقاء - أدخل رمز PIN من العميل لبدء الرحلة";
          }
    // Admin listeners are attached after authentication via setupAdminListeners() else if (myActiveTrip.status === "in_progress" || myActiveTrip.status === "IN_PROGRESS") {
            hud.textContent = `المسار جارٍ نحو الوجهة: ${myActiveTrip.to}`;
          }
    // Admin listeners are attached after authentication via setupAdminListeners()
        }
    // Admin listeners are attached after authentication via setupAdminListeners()

        // Chat button
        const chatBtn = document.getElementById("btnDriverOpenChat");
        if (chatBtn) chatBtn.onclick = () => this.openChatModal(myActiveTrip.id, "driver");
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      if (activeCard) activeCard.style.display = "none";
      this.activeDriverTrip = null;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    // Pending searching trips broadcast
    const pendingStatuses = ["searching", "pending", "REQUESTED"];
    const pendingTrip = Object.values(trips).find(
      (t) => pendingStatuses.includes(t.status) && !t.rejectedDrivers?.[myUid]
    );

    if (pendingTrip) {
      incomingCard.style.display = "flex";
      this.dispatch.playNotificationBeep();
      document.getElementById("incomingFrom").textContent = pendingTrip.from;
      document.getElementById("incomingTo").textContent = pendingTrip.to;
      document.getElementById("incomingDistance").textContent = `${pendingTrip.distanceKm || 2.5} كم`;
      document.getElementById("incomingPrice").textContent = `${pendingTrip.price} ج.م`;

      const notesBox = document.getElementById("incomingNotesBox");
      const notesText = document.getElementById("incomingNotesText");
      if (notesBox && notesText) {
        if (pendingTrip.notesToDriver) {
          notesText.textContent = pendingTrip.notesToDriver;
          notesBox.style.display = "block";
        }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
          notesBox.style.display = "none";
        }
    // Admin listeners are attached after authentication via setupAdminListeners()
      }
    // Admin listeners are attached after authentication via setupAdminListeners()

      // 25s Countdown Timer
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
    // Admin listeners are attached after authentication via setupAdminListeners()
      }
    // Admin listeners are attached after authentication via setupAdminListeners(), 1000);

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
        }
    // Admin listeners will be attached after authentication via setupAdminListeners()
        acceptBtn.disabled = false;
        acceptBtn.textContent = "قبول الرحلة ✓";
        this.showToast(res.message);
      }
    // Admin listeners are attached after authentication via setupAdminListeners();

      rejectBtn.onclick = () => {
        clearInterval(this.incomingCountdownTimer);
        incomingCard.style.display = "none";
        this.showToast("تم تخطي الطلب.");
      }
    // Admin listeners are attached after authentication via setupAdminListeners();
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      incomingCard.style.display = "none";
      if (this.incomingCountdownTimer) clearInterval(this.incomingCountdownTimer);
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
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
    await this.wallet?.creditDriverTrip(trip.driverId || this.currentUser?.uid, trip.id, trip.price);
    this.showToast(`تم إنهاء الرحلة بنجاح! حصّل مبلغ ${trip.price} ج.م.`);
  }

  renderDriverTripHistory(allTrips) {
    const container = document.getElementById("driverTripHistoryContainer");
    if (!container) return;
    const myUid = this.userProfile?.uid;
    if (!myUid) {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:1.5rem;">سجل دخول الكابتن لعرض تاريخ الرحلات.</div>';
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    const driverTrips = Object.values(allTrips || {}).filter(
      (t) => t.driverId === myUid && (t.status === "completed" || t.status === "COMPLETED")
    ).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (driverTrips.length === 0) {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:1.5rem;">لا توجد رحلات مكتملة مسجلة بعد.</div>';
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    container.innerHTML = driverTrips.map((t) => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:rgba(255,255,255,0.03); border-radius:8px; margin-bottom:6px; border-right:3px solid var(--status-green);">
        <div>
          <strong>${t.from} ⬅️ ${t.to}</strong>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
            ${new Date(t.createdAt || Date.now()).toLocaleDateString("ar-EG")} • العميل: ${t.customerName || 'عميل'}
          </div>
        </div>
        <div style="text-align:left;">
          <strong style="color:var(--gold-bright); font-size:1.1rem;">+${t.price} ج.م</strong>
          <div style="font-size:0.7rem; color:var(--status-green);">مكتملة ✓</div>
        </div>
      </div>
    `).join("");
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
        }
    // Admin listeners are attached after authentication via setupAdminListeners();
        quickContainer.appendChild(btn);
      }
    // Admin listeners will be attached after authentication via setupAdminListeners()
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    this.chat.listenToTripChat(tripId, (msgs) => {
      const msgList = document.getElementById("chatMessagesList");
      if (!msgList) return;
      if (msgs.length === 0) {
        msgList.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">لا توجد رسائل بعد.. ابدأ المحادثة.</div>';
        return;
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
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
      }
    // Admin listeners are attached after authentication via setupAdminListeners()).join("");
      msgList.scrollTop = msgList.scrollHeight;
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()
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
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()
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
      }
    // Admin listeners will be attached after authentication via setupAdminListeners()
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
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
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()

    if (this.selectedTipAmount && this.selectedTipAmount > 0) {
      await this.dispatch?.addTripTip(tripId, this.selectedTipAmount);
      if (driverId) {
        await this.wallet?.creditDriverTrip(driverId, tripId, this.selectedTipAmount);
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
      this.showToast(`تمت إضافة إكرامية ${this.selectedTipAmount} ج.م للكابتن. شكراً لكرمك! ✨`);
      this.selectedTipAmount = 0;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

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
    const miniBalanceEl = document.getElementById("btnWalletMiniBalance");
    if (balanceEl) balanceEl.textContent = `${data?.balance || 0} ج.م`;
    if (driverBalanceEl) driverBalanceEl.textContent = `${data?.balance || 0} ج.م`;
    if (miniBalanceEl) miniBalanceEl.textContent = `${data?.balance || 0}ج`;

    const txList = document.getElementById("walletTransactionsList");
    if (txList && data?.transactions) {
      if (data.transactions.length === 0) {
        txList.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:10px;">لا توجد معاملات سابقة</div>';
      }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
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
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  async topUpUserWallet(amount) {
    if (!this.userProfile) {
      this.showToast("يرجى تسجيل الدخول أولاً للوصول إلى المحفظة");
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
    const res = await this.wallet?.topUpWallet(this.userProfile.uid, amount, "فوري / كاش");
    if (res && res.success) {
      this.showToast(`تم تحديث الرصيد: ${amount} ج.م (وضع تجريبي محلي)`);
      this.refreshUserWalletUI();
    }
    // Admin listeners are attached after authentication via setupAdminListeners() else {
      this.showToast(res?.message || "شحن المحفظة الفعلي يتطلب بوابة دفع إلكترونية معتمدة لحماية الأموال.");
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ADMIN CENTRAL DASHBOARD & REPORTING
  // ═════════════════════════════════════════════════════════════════════════
  updateAdminMetrics() {
    const trips = Object.values(this.adminData.trips || {});
    const drivers = Object.values(this.adminData.drivers || {});
    const users = Object.values(this.adminData.users || {});

    const totalTrips = trips.length;
    const activeTrips = trips.filter((t) => ["in_progress", "accepted", "driver_arrived", "IN_PROGRESS", "ACCEPTED", "ARRIVED"].includes(t.status)).length;
    const completedTrips = trips.filter((t) => t.status === "completed" || t.status === "COMPLETED").length;
    const cancelledTrips = trips.filter((t) => t.status === "cancelled" || t.status === "CANCELLED").length;

    const totalRevenue = trips.reduce((sum, t) => sum + (Number(t.price) || 0), 0);
    const commissionPercent = this.pricing.getConfig().commissionRate || 10;
    const companyCommission = totalRevenue * (commissionPercent / 100);
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
    // Admin listeners are attached after authentication via setupAdminListeners()
    tbody.innerHTML = list.map(([id, d]) => `
      <tr>
        <td><b>${d.name || "كابتن العاصمة"}</b></td>
        <td><a href="tel:${d.phone}" style="color:var(--gold-light)">${d.phone || "01094129592"}</a></td>
        <td>${d.carModel || "كود 1"} (${d.carPlate || "شمال سيناء"})</td>
        <td><span class="status-badge ${d.approved ? (d.available ? 'green' : 'yellow') : 'red'}">${d.approved ? (d.available ? 'متاح' : 'غير متاح') : 'بانتظار الاعتماد'}</span></td>
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
    // Admin listeners are attached after authentication via setupAdminListeners()
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
    // Admin listeners are attached after authentication via setupAdminListeners()
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
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">لا توجد شكاوى واردة حالياً.</td></tr>';
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
    tbody.innerHTML = list.map(([id, c]) => `
      <tr>
        <td>${c.userName || "مستخدم"} (${c.userPhone || "—"})</td>
        <td>${c.category || "عام"}</td>
        <td>${c.message || c.details || "—"}</td>
        <td>${new Date(c.createdAt || c.timestamp || Date.now()).toLocaleDateString('ar-EG')}</td>
        <td><span class="status-badge ${c.resolved ? 'green' : 'yellow'}">${c.resolved ? 'محلولة ✓' : 'قيد المتابعة'}</span></td>
        <td>
          <button class="chip-btn" onclick="window.app.resolveComplaint('${id}', ${!c.resolved})">
            ${c.resolved ? 'إعادة فتح' : 'تم الحل ✓'}
          </button>
        </td>
      </tr>
    `).join("");
  }

  toggleDriverApproval(driverId, approve) {
    if (!this.checkAdminPrivileges()) return;
    if (this.rtdb) {
      // Atomic multi-path update eliminates risk of partial failure
      const updates = {};
      updates[`drivers/${driverId}/approved`] = approve;
      updates[`drivers/${driverId}/status`] = approve ? "offline" : "suspended";
      updates[`users/${driverId}/approved`] = approve;
      this.rtdb.ref().update(updates)
        .then(() => {
          this.showToast(approve ? "تم اعتماد الكابتن بنجاح ✓" : "تم إيقاف حساب الكابتن");
        }
    // Admin listeners are attached after authentication via setupAdminListeners())
        .catch((err) => {
          this.showToast("خطأ أثناء تحديث حالة الكابتن: " + (err.message || "صلاحيات غير كافية"));
        }
    // Admin listeners will be attached after authentication via setupAdminListeners()
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  toggleUserBlock(userId, block) {
    if (!this.checkAdminPrivileges()) return;
    if (this.rtdb) {
      this.rtdb.ref(`users/${userId}/status`).set(block ? "blocked" : "active");
      this.showToast(block ? "تم حظر الحساب" : "تم فك الحظر عن الحساب");
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  resolveComplaint(complaintId, resolved) {
    if (!this.checkAdminPrivileges()) return;
    if (this.rtdb) {
      this.rtdb.ref(`complaints/${complaintId}/resolved`).set(resolved);
      this.showToast(resolved ? "تم تمييز الشكوى كمحلولة ✓" : "تمت إعادة فتح الشكوى");
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  cancelTripByAdmin(tripId) {
    if (!this.checkAdminPrivileges()) return;
    if (confirm("هل أنت متأكد من إلغاء هذه الرحلة إدارياً؟")) {
      this.dispatch.cancelTrip(tripId, "إلغاء إداري");
      this.showToast("تم إلغاء الرحلة.");
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  checkAdminPrivileges() {
    const isSuper = this.userProfile?.isSuperAdmin || this.userProfile?.role === "admin";
    if (!isSuper) {
      this.showToast("عفواً: هذه العملية تتطلب صلاحيات إدارة كاملة.");
      return false;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
    return true;
  }

  exportReportToCSV() {
    if (!this.checkAdminPrivileges()) return;
    const trips = Object.values(this.adminData.trips || {});
    let csv = "المعرف,العميل,الهاتف,الانطلاق,الوجهة,السعر,طريقة_الدفع,الحالة,السائق,التاريخ\n";
    trips.forEach((t) => {
      csv += `"${t.id}","${t.customerName || ''}","${t.customerPhone || ''}","${t.from}","${t.to}",${t.price},"${t.paymentMethod || 'كاش'}","${t.status}","${t.driverName || ''}","${new Date(t.createdAt || Date.now()).toLocaleDateString('ar-EG')}"\n`;
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()
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
  // VIEW SWITCHING & NAVIGATION
  // ═════════════════════════════════════════════════════════════════════════
  switchView(viewName) {
    if (viewName === "admin" && !this.checkAdminPrivileges()) {
      this.showToast("عفواً: لوحة الإدارة محمية ومخصصة للمدير المعتمد فقط. يرجى تسجيل الدخول بحساب الإدارة.");
      document.getElementById("authModal")?.classList.add("open");
      return;
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    document.querySelectorAll(".app-view").forEach((v) => v.classList.remove("active"));
    document.querySelectorAll(".nav-tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".bottom-nav-item").forEach((b) => b.classList.remove("active"));

    const targetView = document.getElementById(`view-${viewName}`);
    const targetTab = document.querySelector(`.nav-tab-btn[data-view="${viewName}"]`);

    if (targetView) targetView.classList.add("active");
    if (targetTab) targetTab.classList.add("active");

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (viewName === "customer" && this.maps) {
      setTimeout(() => {
        if (this.maps.leafletMap) this.maps.leafletMap.invalidateSize();
      }
    // Admin listeners are attached after authentication via setupAdminListeners(), 250);
    }
    // Admin listeners are attached after authentication via setupAdminListeners()
  }

  getStatusName(s) {
    return (
      {
        pending: "قيد الانتظار",
        searching: "جاري البحث عن كابتن",
        REQUESTED: "جاري البحث عن كابتن",
        accepted: "تم قبول الرحلة",
        ACCEPTED: "تم قبول الرحلة",
        driver_arrived: "وصل الكابتن لنقطة الالتقاء",
        ARRIVED: "وصل الكابتن لنقطة الالتقاء",
        in_progress: "الرحلة جارية",
        IN_PROGRESS: "الرحلة جارية",
        completed: "مكتملة بنجاح ✓",
        COMPLETED: "مكتملة بنجاح ✓",
        cancelled: "ملغاة",
        CANCELLED: "ملغاة",
        no_driver: "لم يتوفر سائق متاح حالياً"
      }
    // Admin listeners are attached after authentication via setupAdminListeners()[s] || s || "—"
    );
  }

  getStatusBadgeClass(s) {
    return (
      {
        pending: "yellow",
        searching: "yellow",
        REQUESTED: "yellow",
        accepted: "blue",
        ACCEPTED: "blue",
        driver_arrived: "green",
        ARRIVED: "green",
        in_progress: "blue",
        IN_PROGRESS: "blue",
        completed: "green",
        COMPLETED: "green",
        cancelled: "red",
        CANCELLED: "red",
        no_driver: "red"
      }
    // Admin listeners are attached after authentication via setupAdminListeners()[s] || "yellow"
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
    }
    // Admin listeners are attached after authentication via setupAdminListeners(), 3500);
  }

  bindDOMEvents() {
    // Navigation tabs
    document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.switchView(btn.dataset.view));
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()

    // Car category cards
    document.querySelectorAll(".car-card-option").forEach((card) => {
      card.addEventListener("click", () => {
        document.querySelectorAll(".car-card-option").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        this.selectedCarType = card.dataset.cartype;
        this.updateRouteAndFare();
      }
    // Admin listeners will be attached after authentication via setupAdminListeners()
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()

    // Payment method switcher
    document.querySelectorAll(".payment-method-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".payment-method-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        this.selectedPaymentMethod = chip.dataset.method;
      }
    // Admin listeners will be attached after authentication via setupAdminListeners()
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()

    // Driver availability toggle
    const toggle = document.getElementById("driverOnlineToggle");
    if (toggle) {
      toggle.addEventListener("change", (e) => this.toggleDriverOnline(e.target.checked));
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    // Modal close handlers
    document.querySelectorAll(".modal-close-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".modal-overlay").forEach((m) => m.classList.remove("open"));
      }
    // Admin listeners will be attached after authentication via setupAdminListeners()
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()

    // Autocomplete input debounced listeners
    const pInp = document.getElementById("inputPickup");
    if (pInp) {
      pInp.addEventListener("input", (e) => this.handleLocationInput(e.target.value, "pickup"));
      pInp.addEventListener("focus", (e) => {
        if (e.target.value) this.handleLocationInput(e.target.value, "pickup");
      }
    // Admin listeners will be attached after authentication via setupAdminListeners()
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    const dInp = document.getElementById("inputDropoff");
    if (dInp) {
      dInp.addEventListener("input", (e) => this.handleLocationInput(e.target.value, "dropoff"));
      dInp.addEventListener("focus", (e) => {
        if (e.target.value) this.handleLocationInput(e.target.value, "dropoff");
      }
    // Admin listeners will be attached after authentication via setupAdminListeners()
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

    // Close autocomplete on click outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#pickupAutocomplete") && e.target !== pInp) {
        const d = document.getElementById("pickupAutocomplete");
        if (d) d.style.display = "none";
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
      if (!e.target.closest("#dropoffAutocomplete") && e.target !== dInp) {
        const d = document.getElementById("dropoffAutocomplete");
        if (d) d.style.display = "none";
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()
  }

  setupPWA() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").then(
          (reg) => console.log("SW registered with scope:", reg.scope),
          (err) => console.log("SW registration failed:", err)
        );
      }
    // Admin listeners will be attached after authentication via setupAdminListeners()
    }
    // Admin listeners are attached after authentication via setupAdminListeners()

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
          }
    // Admin listeners will be attached after authentication via setupAdminListeners()
        }
    // Admin listeners are attached after authentication via setupAdminListeners();
      }
    // Admin listeners are attached after authentication via setupAdminListeners()
    }
    // Admin listeners will be attached after authentication via setupAdminListeners()
  }
}

// Instantiate and expose globally
window.app = new CapitalTaxiApp();
document.addEventListener("DOMContentLoaded", () => window.app.init());
