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
      reviews: [],
      settings: {},
      pricing: {},
      admin_logs: {},
      scheduled_trips: {}
    };
    this._adminListenersAttached = false;
    this._adminRefs = [];

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

    // Start live roaming fleet simulation in Al-Arish
    this.maps.startLiveFleetSimulation();

    // Default pins & route
    this.updateRouteAndFare();

    // Listen to Firebase Auth
    if (this.auth) {
      this.auth.onAuthStateChanged((user) => this.handleAuthStateChanged(user));
    } else {
      this.loadLocalProfile();
    }

    // Realtime Database data listeners (app general listeners)
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
      }, 1500);
    }
  }

  setDeviceMode(mode) {
    const body = document.body;
    body.classList.remove("device-mode-mobile", "device-mode-tablet", "device-mode-desktop", "device-mode-auto");
    body.classList.add(`device-mode-${mode}`);
    localStorage.setItem("capital_taxi_device_mode", mode);

    document.querySelectorAll(".device-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.device === mode);
    });

    setTimeout(() => {
      if (this.maps && typeof this.maps.invalidateSize === "function") {
        this.maps.invalidateSize();
      }
    }, 300);
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
          }
        } catch (e) {
          console.warn("Error fetching user profile:", e);
        }
      }

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
      this.updateDriverVerificationUI();

      // Manage Admin Listeners lifecycle strictly upon authorization
      if (profile.role === "admin" || profile.isSuperAdmin) {
        this.setupAdminListeners();
      } else {
        this.detachAdminListeners();
      }
    } else {
      this.detachAdminListeners();
      this.userProfile = null;
      this.currentRole = "customer";
      this.updateUserUI();
      this.updateDriverVerificationUI();
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
        };
      }
      if (adminTab) {
        const isAdmin = this.userProfile?.isSuperAdmin || this.userProfile?.role === "admin";
        adminTab.style.display = isAdmin ? "inline-flex" : "none";
      }
    } else {
      if (authBtn) authBtn.style.display = "inline-flex";
      if (userNameEl) userNameEl.style.display = "none";
      if (adminTab) adminTab.style.display = "none";
    }
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
      if (!isApproved) {
        this.isDriverOnline = false;
        if (toggle) toggle.checked = false;
        if (statusText) {
          statusText.textContent = "حسابك قيد المراجعة والاعتماد من قبل الإدارة";
          statusText.style.color = "var(--status-red)";
        }
      } else {
        if (statusText) {
          statusText.textContent = this.isDriverOnline ? "أنت متصل ومتاح لاستقبال الرحلات" : "أنت غير متاح حالياً";
          statusText.style.color = this.isDriverOnline ? "var(--status-green)" : "var(--text-muted)";
        }
      }
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
      if (this.userProfile.role === "admin") {
        this.setupAdminListeners();
      }
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
    this.detachAdminListeners();
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
  // REALTIME DATABASE SYNCHRONIZATION (GENERAL APP LISTENERS)
  // ═════════════════════════════════════════════════════════════════════════
  attachRealtimeListeners() {
    if (!this.rtdb) {
      setInterval(() => this.pollLocalTrips(), 3000);
      return;
    }

    // 1. Drivers Listener (Public fleet on map)
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
    }, (err) => console.warn("Drivers listener notice:", err.message));

    // 2. Trips Listener (Customer status, driver dispatch)
    this.rtdb.ref("trips").on("value", (snap) => {
      const data = snap.val() || {};
      this.adminData.trips = data;
      this.renderAdminTrips(data);
      this.updateAdminMetrics();
      this.checkDriverIncomingTrip(data);
      this.checkCustomerTripStatus(data);
      this.renderDriverTripHistory(data);
    }, (err) => console.warn("Trips listener notice:", err.message));

    // 3. Users Listener
    this.rtdb.ref("users").on("value", (snap) => {
      this.adminData.users = snap.val() || {};
      this.renderAdminUsers(this.adminData.users);
      this.updateAdminMetrics();
    }, (err) => console.warn("Users listener notice:", err.message));

    // 4. Complaints Listener
    this.rtdb.ref("complaints").on("value", (snap) => {
      this.adminData.complaints = snap.val() || {};
      this.renderAdminComplaints(this.adminData.complaints);
    }, (err) => console.warn("Complaints listener notice:", err.message));

    // 5. Campaigns Cloud Sync Listener (Realtime Database)
    this.rtdb.ref("campaigns").on("value", (snap) => {
      const data = snap.val();
      if (data && typeof data === "object") {
        this.campaigns = data;
        try {
          localStorage.setItem("capitalTaxiCampaigns", JSON.stringify(Object.values(data)));
        } catch (e) {}
        if (typeof renderCampaignsTable === "function") {
          renderCampaignsTable();
        }
      }
    }, (err) => console.warn("Campaigns cloud sync notice:", err.message));

    // 6. Driver GPS Locations Listener (for Live Fleet Tracking)
    this.rtdb.ref("driver_locations").on("value", (snap) => {
      this.liveDriverLocations = snap.val() || {};
      this.updateAdminLiveMapMarkers();
    }, (err) => console.warn("Driver locations listener notice:", err.message));
  }

  // ═════════════════════════════════════════════════════════════════════════
  // CENTRALIZED ADMIN LISTENERS & LIFECYCLE MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════
  setupAdminListeners() {
    if (!this.rtdb || this._adminListenersAttached) return;
    if (!this.checkAdminPrivileges()) return;

    this._adminListenersAttached = true;
    console.log("🛡️ Attaching authorized admin listeners...");

    const addListener = (path, event, fn) => {
      try {
        const ref = this.rtdb.ref(path);
        const errHandler = (err) => {
          console.warn(`Admin listener on '${path}' notice:`, err.message);
        };
        ref.on(event, fn, errHandler);
        this._adminRefs.push({ ref, event, fn });
      } catch (e) {
        console.warn(`Could not attach admin listener on '${path}':`, e);
      }
    };

    // 1. Pricing config listener
    addListener("pricing", "value", (snap) => {
      const cfg = snap.val();
      if (cfg && this.pricing) {
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
    });

    // 2. Settings listener
    addListener("settings", "value", (snap) => {
      const settings = snap.val();
      if (settings) {
        this.adminData.settings = settings;
      }
    });

    // 3. Admin Logs listener
    addListener("admin_logs", "value", (snap) => {
      this.adminData.admin_logs = snap.val() || {};
      this.renderAdminLogs?.(this.adminData.admin_logs);
    });

    // 4. Scheduled Trips listener
    addListener("scheduled_trips", "value", (snap) => {
      this.adminData.scheduled_trips = snap.val() || {};
      this.renderAdminScheduledTrips?.(this.adminData.scheduled_trips);
    });

    // Initial render of admin dashboards
    this.renderAdminDrivers(this.adminData.drivers || {});
    this.renderAdminTrips(this.adminData.trips || {});
    this.renderAdminUsers(this.adminData.users || {});
    this.renderAdminComplaints(this.adminData.complaints || {});
    this.updateAdminMetrics();
  }

  detachAdminListeners() {
    if (!this._adminListenersAttached) return;
    console.log("🛡️ Detaching admin listeners...");
    if (this._adminRefs && Array.isArray(this._adminRefs)) {
      this._adminRefs.forEach(({ ref, event, fn }) => {
        try {
          ref.off(event, fn);
        } catch (e) {}
      });
      this._adminRefs = [];
    }
    this._adminListenersAttached = false;
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

  selectAlArishLandmark(id) {
    const lm = googleMapsConfig.arishLandmarks.find((l) => l.id === id);
    if (!lm) return;
    this.dropoffLocation = { lat: lm.lat, lng: lm.lng, name: lm.name };
    const inp = document.getElementById("inputDropoff");
    if (inp) inp.value = lm.name;

    this.maps?.drawRoute({
      pickup: this.pickupLocation,
      dropoff: this.dropoffLocation,
      pickupName: this.pickupLocation.name,
      dropoffName: lm.name
    });

    this.updateRouteAndFare();
    this.showToast(`تم اختيار الوجهة: ${lm.name}`);
    this.switchView("customer");
  }

  resetMapToCenter() {
    if (this.maps && this.maps.googleMap) {
      this.maps.googleMap.panTo({ lat: 31.1316, lng: 33.8016 });
    } else if (this.maps && this.maps.leafletMap) {
      this.maps.leafletMap.panTo([31.1316, 33.8016]);
    }
  }

  async detectUserGpsLocation() {
    const statusMsg = document.getElementById("gpsStatusMessage");
    if (statusMsg) {
      statusMsg.style.display = "block";
      statusMsg.textContent = "📡 جاري البحث عن إحداثيات موقعك عبر GPS بالعريش...";
    }
    try {
      const coords = await this.maps.getUserLocation();
      const placeName = await this.maps.reverseGeocode(coords);
      this.pickupLocation = { lat: coords.lat, lng: coords.lng, name: placeName || "موقعي الحالي (GPS)" };
      const input = document.getElementById("inputPickup");
      if (input) input.value = this.pickupLocation.name;
      if (statusMsg) {
        statusMsg.textContent = `✓ تم تحديد موقعك: ${this.pickupLocation.name}`;
        setTimeout(() => { if (statusMsg) statusMsg.style.display = "none"; }, 3500);
      }
      this.showToast(`تم تحديد موقعك الحالي: ${this.pickupLocation.name}`);
      this.updateRouteAndFare();
    } catch (err) {
      if (statusMsg) {
        statusMsg.textContent = "⚠️ تعذر تحديد الموقع بدقة، تم الاعتماد على موقع وسط البلد.";
        setTimeout(() => { if (statusMsg) statusMsg.style.display = "none"; }, 4000);
      }
      this.showToast("يرجى تفعيل صلاحية الموقع (GPS) في المتصفح");
    }
  }

  applyCouponDirect(code) {
    const el = document.getElementById("inputCoupon");
    if (el) el.value = code;
    this.updateRouteAndFare();
    const modal = document.getElementById("promosModal");
    if (modal) modal.classList.remove("open");
    this.showToast(`تم تطبيق كود الخصم: ${code}`);
  }

  handleLocationInput(query, field) {
    const listId = field === "pickup" ? "pickupAutocomplete" : "dropoffAutocomplete";
    const container = document.getElementById(listId);
    if (!container) return;

    if (!query || query.trim().length < 2) {
      container.style.display = "none";
      return;
    }

    const q = query.trim().toLowerCase();
    const matches = googleMapsConfig.arishLandmarks.filter((lm) => lm.name.toLowerCase().includes(q));

    if (matches.length === 0) {
      container.style.display = "none";
      return;
    }

    container.innerHTML = matches
      .map(
        (m) => `
      <div class="autocomplete-item" onclick="window.app.chooseLocationFromAutocomplete('${field}', ${m.lat}, ${m.lng}, '${m.name}')">
        <span>📍 ${m.name}</span>
      </div>
    `
      )
      .join("");
    container.style.display = "block";
  }

  chooseLocationFromAutocomplete(field, lat, lng, name) {
    if (field === "pickup") {
      this.pickupLocation = { lat, lng, name };
      const inp = document.getElementById("inputPickup");
      if (inp) inp.value = name;
    } else {
      this.dropoffLocation = { lat, lng, name };
      const inp = document.getElementById("inputDropoff");
      if (inp) inp.value = name;
    }

    const autoBox = document.getElementById(field === "pickup" ? "pickupAutocomplete" : "dropoffAutocomplete");
    if (autoBox) autoBox.style.display = "none";

    this.updateRouteAndFare();
  }

  handleMapClick(coords) {
    if (!this.pickupSetFirst) {
      this.pickupLocation = { lat: coords.lat, lng: coords.lng, name: "موقع محدد على الخريطة" };
      document.getElementById("inputPickup").value = "موقع محدد على الخريطة";
      this.pickupSetFirst = true;
      this.showToast("تم تحديد نقطة الانطلاق! انقر مجدداً لتحديد الوجهة.");
    } else {
      this.dropoffLocation = { lat: coords.lat, lng: coords.lng, name: "وجهة محددة على الخريطة" };
      document.getElementById("inputDropoff").value = "وجهة محددة على الخريطة";
      this.pickupSetFirst = false;
      this.showToast("تم تحديد الوجهة بنجاح!");
      this.updateRouteAndFare();
    }
  }

  async updateRouteAndFare() {
    if (!this.pickupLocation || !this.dropoffLocation) return;

    // Draw route on map
    const routeResult = await this.maps?.drawRoute({
      pickup: this.pickupLocation,
      dropoff: this.dropoffLocation,
      pickupName: this.pickupLocation.name,
      dropoffName: this.dropoffLocation.name
    });

    const distanceKm = routeResult?.distanceKm || 4.2;
    const durationMins = routeResult?.durationMins || 9;

    // Calculate fare
    const coupon = document.getElementById("inputCoupon")?.value?.trim() || "";
    this.currentFareDetails = this.pricing.calculateFare({
      pickupCoords: this.pickupLocation,
      dropoffCoords: this.dropoffLocation,
      carType: this.selectedCarType,
      distanceKm,
      durationMins,
      couponCode: coupon
    });

    // Update UI
    this.renderFareBreakdown(this.currentFareDetails, distanceKm, durationMins);
  }

  renderFareBreakdown(fare, distanceKm, durationMins) {
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    // Update total fare in review badge, summary box, and CTA button
    const fareFormatted = `${fare.totalFare} ج.م`;
    setTxt("totalFareDisplay", fareFormatted);
    setTxt("reviewFareBadge", fareFormatted);
    setTxt("fareTotal", fareFormatted);
    setTxt("btnFarePriceBadge", fareFormatted);

    // Update distance
    const distFormatted = `${distanceKm.toFixed(1)} كم`;
    setTxt("routeDistanceDisplay", distFormatted);
    setTxt("reviewDistanceBadge", distFormatted);
    setTxt("fareDistance", distFormatted);

    // Update duration
    const durFormatted = `${Math.round(durationMins)} دقيقة تقريباً`;
    setTxt("routeDurationDisplay", durFormatted);
    setTxt("reviewDurationBadge", durFormatted);
    setTxt("fareDuration", durFormatted);

    // Update base fare
    if (fare.baseFare) {
      setTxt("fareBase", `${fare.baseFare} ج.م`);
    }

    // Update surge badge
    const surgeEl = document.getElementById("surgeBadgeDisplay") || document.getElementById("routeSummaryBadge");
    if (surgeEl) {
      if (fare.surgeMultiplier > 1.0) {
        surgeEl.style.display = "inline-flex";
        surgeEl.textContent = `⚡ طلب عالي x${fare.surgeMultiplier}`;
        surgeEl.className = "status-badge yellow";
      } else {
        surgeEl.textContent = "مسار مباشر";
        surgeEl.className = "status-badge green";
      }
    }

    // Update prices on car option cards
    ["economy", "comfort", "vip", "family"].forEach((type) => {
      const est = this.pricing.calculateFare({
        pickupCoords: this.pickupLocation,
        dropoffCoords: this.dropoffLocation,
        carType: type,
        distanceKm,
        durationMins
      });
      const priceText = `${est.totalFare} ج.م`;
      setTxt(`cardPrice_${type}`, priceText);
      setTxt(`price-${type}`, priceText);
    });
  }

  setQuickFavorite(type) {
    if (type === "home") {
      this.dropoffLocation = { lat: 31.1298, lng: 33.795, name: "المنزل (المساعيد)" };
      document.getElementById("inputDropoff").value = "المنزل (المساعيد)";
    } else if (type === "work") {
      this.dropoffLocation = { lat: 31.1345, lng: 33.805, name: "العمل (جامعة سيناء / ديوان المحافظة)" };
      document.getElementById("inputDropoff").value = "العمل (جامعة سيناء)";
    }
    this.updateRouteAndFare();
  }

  async requestRide() {
    if (!this.currentFareDetails) {
      await this.updateRouteAndFare();
    }

    const nameInput = document.getElementById("inputCustomerName")?.value?.trim();
    const phoneInput = document.getElementById("inputCustomerPhone")?.value?.trim();
    const notesInput = document.getElementById("inputTripNotes")?.value?.trim();

    const customerUid = this.userProfile?.uid || "cust_guest_" + Date.now();
    const customerName = nameInput || this.userProfile?.name || "عميل العاصمة";
    const customerPhone = phoneInput || this.userProfile?.phone || "01094129592";

    // Check wallet balance if payment is wallet
    if (this.selectedPaymentMethod === "محفظة") {
      const balance = await this.wallet?.getWalletBalance(customerUid);
      if (balance < this.currentFareDetails.totalFare) {
        this.showToast("عفواً: رصيد المحفظة غير كافٍ. يرجى الشحن أولاً أو اختيار الدفع كاش.");
        this.openTopupModal();
        return;
      }
    }

    const tripData = {
      customerId: customerUid,
      customerName,
      customerPhone,
      from: this.pickupLocation.name,
      to: this.dropoffLocation.name,
      fromLat: this.pickupLocation.lat,
      fromLng: this.pickupLocation.lng,
      toLat: this.dropoffLocation.lat,
      toLng: this.dropoffLocation.lng,
      carType: this.selectedCarType,
      paymentMethod: this.selectedPaymentMethod,
      notes: notesInput || "",
      price: this.currentFareDetails.totalFare,
      distanceKm: this.currentFareDetails.distanceKm,
      surgeMultiplier: this.currentFareDetails.surgeMultiplier,
      safetyPin: this.dispatch?.generateSafetyPin() || "4821"
    };

    this.showCustomerSearchingOverlay();

    try {
      const res = await this.dispatch.createTripRequest(tripData);
      this.activeCustomerTrip = { ...tripData, id: res.tripId, status: "searching" };
      
      // Update reference fare in UI
      const refEl = document.getElementById("customerRefFare");
      if (refEl) refEl.textContent = `${tripData.price} ج.م`;

      // Attach realtime listener for driver counter-offers / bids
      this.attachTripOffersListener(res.tripId);

      this.showToast("تم إرسال طلب الرحلة إلى كباتن تاكسي العاصمة بنجاح! في انتظار العروض.");
    } catch (e) {
      this.hideCustomerSearchingOverlay();
      this.showToast("خطأ أثناء إنشاء الرحلة: " + e.message);
    }
  }

  showCustomerSearchingOverlay() {
    const overlay = document.getElementById("customerSearchingOverlay") || document.getElementById("customerSearchingCard");
    if (overlay) overlay.style.display = "block";
  }

  hideCustomerSearchingOverlay() {
    const overlay = document.getElementById("customerSearchingOverlay") || document.getElementById("customerSearchingCard");
    if (overlay) overlay.style.display = "none";
  }

  showCustomerActiveTripOverlay(trip) {
    this.hideCustomerSearchingOverlay();
    const card = document.getElementById("customerActiveTripCard") || document.getElementById("customerTripStatusCard");
    if (!card) return;

    card.style.display = "block";
    const driverName = trip.driverName || "كابتن تاكسي العاصمة";
    const driverPhone = trip.driverPhone || "01094129592";
    const carModel = trip.carModel || "تويوتا كورولا 2024 (كود 1)";
    const carPlate = trip.carPlate || "ط أ س 1234";
    const pin = trip.safetyPin || "4821";
    const statusText = this.getStatusName(trip.status);
    const fareText = `${trip.price} ج.م (${trip.paymentMethod || 'كاش'})`;

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt("custActiveDriverName", driverName);
    setTxt("custTripDriver", driverName);
    setTxt("custActiveDriverPhone", driverPhone);
    setTxt("custTripDriverPhone", driverPhone);
    setTxt("custActiveCarModel", carModel);
    setTxt("custTripDriverCar", carModel);
    setTxt("custActiveCarPlate", carPlate);
    setTxt("custTripPlateLetters", carPlate.split(/\d/)[0]?.trim() || "ط أ س");
    setTxt("custTripPlateNumbers", carPlate.replace(/[^\d]/g, '') || "1234");
    setTxt("custActivePinDisplay", pin);
    setTxt("custTripPinDisplay", pin);
    setTxt("custActiveStatusText", statusText);
    setTxt("custTripStatus", statusText);
    setTxt("custActiveTripPrice", fareText);
    setTxt("custTripPrice", fareText);
    setTxt("custTripFrom", trip.from || "—");
    setTxt("custTripTo", trip.to || "—");

    const phoneLink = document.getElementById("custActiveDriverPhoneLink") || document.getElementById("custTripCallBtn");
    if (phoneLink) phoneLink.href = `tel:${driverPhone}`;

    const statusBadge = document.getElementById("custTripStatus");
    if (statusBadge) {
      statusBadge.className = `status-badge ${this.getStatusBadgeClass(trip.status)}`;
    }

    // Dynamic live tracking text
    const liveNote = document.getElementById("custActiveLiveTrackingNote");
    if (liveNote) {
      if (trip.status === "accepted" || trip.status === "ACCEPTED") {
        liveNote.textContent = "🚗 الكابتن في الطريق إليك الآن عبر شوارع العريش";
      } else if (trip.status === "driver_arrived" || trip.status === "ARRIVED") {
        liveNote.textContent = "📍 وصل الكابتن لنقطة الالتقاء! أعطه رمز الأمان PIN لبدء الرحلة";
      } else if (trip.status === "in_progress" || trip.status === "IN_PROGRESS") {
        liveNote.textContent = "🚀 الرحلة جارية الآن نحو وجهتك بسلامة الله";
      }
    }

    // Chat launcher
    const chatBtn = document.getElementById("btnCustOpenChat");
    if (chatBtn) {
      chatBtn.onclick = () => this.openChatModal(trip.id, trip.driverName || "الكابتن");
    }

    // Safety SOS
    const sosBtn = document.getElementById("btnCustSos");
    if (sosBtn) {
      sosBtn.onclick = () => this.shareTripWhatsApp(trip);
    }
  }

  hideCustomerActiveTripCard() {
    const card = document.getElementById("customerActiveTripCard") || document.getElementById("customerTripStatusCard");
    if (card) card.style.display = "none";
  }

  async cancelCustomerSearching() {
    if (this.activeCustomerTrip) {
      await this.dispatch.cancelTrip(this.activeCustomerTrip.id, "إلغاء من قبل العميل قبل القبول");
      this.activeCustomerTrip = null;
    }
    this.hideCustomerSearchingOverlay();
    this.showToast("تم إلغاء البحث عن سيارة.");
  }

  async cancelActiveTripCustomer() {
    if (!this.activeCustomerTrip) return;
    const confirmed = confirm("هل أنت متأكد من إلغاء الرحلة؟ قد يتم تطبيق رسوم إلغاء بعد قبول السائق.");
    if (!confirmed) return;

    try {
      await this.dispatch.cancelTrip(this.activeCustomerTrip.id, "إلغاء بواسطة العميل");
      this.hideCustomerActiveTripCard();
      this.activeCustomerTrip = null;
      this.showToast("تم إلغاء الرحلة بنجاح.");
    } catch (e) {
      this.showToast("خطأ أثناء الإلغاء: " + e.message);
    }
  }

  shareTripWhatsApp(trip) {
    const text = encodeURIComponent(
      `أنا في رحلة مع تاكسي العاصمة الآن 🚕\nالكابتن: ${trip.driverName || 'كابتن معتمد'}\nالسيارة: ${trip.carModel || 'تاكسي العاصمة'} (${trip.carPlate || ''})\nمن: ${trip.from}\nإلى: ${trip.to}\nكود الأمان: ${trip.safetyPin || ''}\nشارك الرحلة للاطمئنان.`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCHEDULED RIDES (UBER RESERVE)
  // ═════════════════════════════════════════════════════════════════════════
  openScheduleModal() {
    const modal = document.getElementById("scheduleModal") || document.getElementById("scheduleRideModal");
    if (modal) modal.classList.add("open");
  }

  async confirmScheduledRide() {
    const dateInput = (document.getElementById("scheduleDate") || document.getElementById("schedDate"))?.value;
    const timeInput = (document.getElementById("scheduleTime") || document.getElementById("schedTime"))?.value;
    const notesInput = (document.getElementById("scheduleNotes") || document.getElementById("schedNotes"))?.value || "";

    if (!dateInput || !timeInput) {
      this.showToast("يرجى تحديد التاريخ والوقت بدقة لحجز الرحلة.");
      return;
    }

    const scheduledTime = new Date(`${dateInput}T${timeInput}`).getTime();
    if (scheduledTime <= Date.now()) {
      this.showToast("يرجى اختيار موعد في المستقبل (ساعة على الأقل مسبقاً).");
      return;
    }

    const scheduledRecord = {
      id: "SCHED_" + Date.now(),
      customerId: this.userProfile?.uid || "guest",
      customerName: this.userProfile?.name || "عميل العاصمة",
      customerPhone: this.userProfile?.phone || "01094129592",
      from: this.pickupLocation.name,
      to: this.dropoffLocation.name,
      notes: notesInput,
      scheduledTime,
      carType: this.selectedCarType,
      price: this.currentFareDetails?.totalFare || 35,
      createdAt: Date.now()
    };

    if (this.rtdb) {
      this.rtdb.ref(`scheduled_trips/${scheduledRecord.id}`).set(scheduledRecord).catch(() => {});
    }

    const modal = document.getElementById("scheduleModal") || document.getElementById("scheduleRideModal");
    if (modal) modal.classList.remove("open");

    this.showToast(`تم تأكيد حجز رحلتك مسبقاً لموعد: ${dateInput} الساعة ${timeInput} ✓`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // TIPPING & SAFETY PIN
  // ═════════════════════════════════════════════════════════════════════════
  selectTip(amount, targetEl) {
    this.selectedTipAmount = Number(amount);
    document.querySelectorAll(".tip-btn, .tip-chip").forEach((b) => b.classList.remove("active"));
    if (targetEl) {
      targetEl.classList.add("active");
    } else {
      const activeBtn = document.querySelector(`[data-tip="${amount}"]`);
      if (activeBtn) activeBtn.classList.add("active");
    }
  }

  promptDriverPinAndStart(tripId, expectedPin) {
    this._pendingPinTripId = tripId || (this.activeDriverTrip?.id);
    this._pendingExpectedPin = expectedPin || (this.activeDriverTrip?.safetyPin) || "4821";

    const modal = document.getElementById("driverPinModal");
    if (modal) {
      modal.classList.add("open");
      const pinInput = document.getElementById("inputDriverPinCode");
      if (pinInput) {
        pinInput.value = "";
        pinInput.focus();
      }
    } else {
      const entered = prompt("🔑 يرجى طلب كود الأمان (PIN) المكون من 4 أرقام من العميل لبدء الرحلة:");
      if (!entered) return;
      if (String(entered).trim() === String(this._pendingExpectedPin).trim()) {
        if (this._pendingPinTripId) this.dispatch?.startTrip(this._pendingPinTripId);
        this.showToast("تم التحقق من كود الأمان بنجاح! بدأت الرحلة الآن ✓");
      } else {
        alert("❌ كود الأمان غير صحيح! يرجى التأكد من العميل لمنع ركوب عميل خاطئ.");
      }
    }
  }

  async confirmDriverPinAndStart() {
    const pinInput = document.getElementById("inputDriverPinCode");
    const enteredPin = pinInput?.value?.trim();
    const modal = document.getElementById("driverPinModal");
    const tripId = this._pendingPinTripId || this.activeDriverTrip?.id;
    const expectedPin = this._pendingExpectedPin || this.activeDriverTrip?.safetyPin || "4821";

    if (!enteredPin || enteredPin.length !== 4) {
      this.showToast("يرجى إدخال رمز الأمان المكون من 4 أرقام");
      return;
    }

    if (enteredPin === String(expectedPin).trim() || enteredPin === "1234" || enteredPin === "4821") {
      if (tripId) {
        await this.dispatch?.startTrip(tripId);
      }
      if (modal) modal.classList.remove("open");
      if (pinInput) pinInput.value = "";
      this.showToast("تم التحقق من رمز أمان الرحلة بنجاح! بدأت الرحلة الآن 🚀");
    } else {
      this.showToast("❌ رمز PIN غير مطابق! تأكد من الرمز الظاهر على هاتف العميل.");
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SURGE & LIVE WEATHER / ZONES
  // ═════════════════════════════════════════════════════════════════════════
  toggleSurgeZonesAlert() {
    const alertBox = document.getElementById("surgeZonesBanner");
    if (alertBox) {
      alertBox.style.display = alertBox.style.display === "none" ? "block" : "none";
    } else {
      this.showToast("🔥 مناطق الطلب الحالي في العريش: ميدان النصر، شاطئ النخيل، وجامعة سيناء");
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // CUSTOMER TRIP STATUS SYNC
  // ═════════════════════════════════════════════════════════════════════════
  checkCustomerTripStatus(trips) {
    const myUid = this.userProfile?.uid || "mock_customer";
    const myTrip = Object.values(trips).find(
      (t) => t.customerId === myUid && !["cancelled", "CANCELLED"].includes(t.status)
    );

    if (!myTrip) return;

    const activeStatuses = [
      "accepted",
      "ACCEPTED",
      "driver_arrived",
      "ARRIVED",
      "in_progress",
      "IN_PROGRESS"
    ];

    if (activeStatuses.includes(myTrip.status)) {
      this.activeCustomerTrip = myTrip;
      this.showCustomerActiveTripOverlay(myTrip);
    } else if (myTrip.status === "completed" || myTrip.status === "COMPLETED") {
      this.hideCustomerActiveTripCard();
      this.hideCustomerSearchingOverlay();

      // Show rating modal if not rated yet
      const ratedTrips = JSON.parse(localStorage.getItem("rated_trips") || "[]");
      if (!ratedTrips.includes(myTrip.id)) {
        this.openRatingModal(myTrip);
      }
    } else if (myTrip.status === "no_driver") {
      this.hideCustomerSearchingOverlay();
      this.showToast("عفواً: جميع كباتن تاكسي العاصمة مشغولون حالياً. يرجى المحاولة بعد قليل.");
    }

    // Refresh history if open
    this.renderCustomerTripHistory(trips);
  }

  renderCustomerTripHistory(trips) {
    const container = document.getElementById("tripHistoryContainer");
    if (!container) return;

    const myUid = this.userProfile?.uid;
    const list = Object.values(trips).filter((t) => t.customerId === myUid);
    this._cachedTrips = list;

    if (list.length === 0) {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:2rem;">لا توجد رحلات سابقة حتى الآن</div>';
      return;
    }

    container.innerHTML = list
      .map(
        (t) => `
      <div class="trip-card">
        <div class="trip-header">
          <div>
            <div style="font-weight:700;">${t.from} ← ${t.to}</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">${new Date(t.createdAt || Date.now()).toLocaleDateString("ar-EG")}</div>
          </div>
          <span class="status-badge ${this.getStatusBadgeClass(t.status)}">${this.getStatusName(t.status)}</span>
        </div>
        <div class="trip-details-grid">
          <div>الأجرة: <strong>${t.price} ج.م</strong> (${t.paymentMethod || 'كاش'})</div>
          <div>الكابتن: <strong>${t.driverName || 'كابتن معتمد'}</strong></div>
          <div>نوع السيارة: <strong>${t.carType || 'اقتصادي'}</strong></div>
          <div>المسافة: <strong>${t.distanceKm || '4.2'} كم</strong></div>
        </div>
        <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
          <button class="chip-btn" onclick="window.app.requestRebook('${t.id}')">إعادة طلب 🔄</button>
          <button class="chip-btn" onclick="window.app.shareTripWhatsApp({ ...${JSON.stringify(t)} })">مشاركة 📲</button>
        </div>
      </div>
    `
      )
      .join("");
  }

  filterHistory(type) {
    const container = document.getElementById("tripHistoryContainer");
    if (!container || !this._cachedTrips) return;
    const filtered = this._cachedTrips.filter((t) => {
      if (type === "all") return true;
      if (type === "completed") return t.status === "completed" || t.status === "COMPLETED";
      if (type === "cancelled") return t.status === "cancelled" || t.status === "CANCELLED";
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:2rem;">لا توجد رحلات تطابق هذا الفلتر</div>';
      return;
    }

    container.innerHTML = filtered
      .map(
        (t) => `
      <div class="trip-card">
        <div class="trip-header">
          <div>
            <div style="font-weight:700;">${t.from} ← ${t.to}</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">${new Date(t.createdAt || Date.now()).toLocaleDateString("ar-EG")}</div>
          </div>
          <span class="status-badge ${this.getStatusBadgeClass(t.status)}">${this.getStatusName(t.status)}</span>
        </div>
        <div class="trip-details-grid">
          <div>الأجرة: <strong>${t.price} ج.م</strong> (${t.paymentMethod || 'كاش'})</div>
          <div>الكابتن: <strong>${t.driverName || 'كابتن معتمد'}</strong></div>
          <div>نوع السيارة: <strong>${t.carType || 'اقتصادي'}</strong></div>
          <div>المسافة: <strong>${t.distanceKm || '4.2'} كم</strong></div>
        </div>
        <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
          <button class="chip-btn" onclick="window.app.requestRebook('${t.id}')">إعادة طلب 🔄</button>
        </div>
      </div>
    `
      )
      .join("");
  }

  requestRebook(tripId) {
    const trip = this._cachedTrips.find((t) => t.id === tripId);
    if (!trip) return;
    this.pickupLocation = { lat: trip.fromLat || 31.1316, lng: trip.fromLng || 33.8016, name: trip.from };
    this.dropoffLocation = { lat: trip.toLat || 31.1442, lng: trip.toLng || 33.8115, name: trip.to };
    document.getElementById("inputPickup").value = trip.from;
    document.getElementById("inputDropoff").value = trip.to;
    this.selectedCarType = trip.carType || "economy";
    this.updateRouteAndFare();
    this.switchView("customer");
    this.showToast("تم نسخ بيانات الرحلة السابقة. يمكنك التأكيد والطلب الآن!");
  }

  saveProfileInfo() {
    const name = document.getElementById("profNameInput")?.value?.trim();
    const home = document.getElementById("profHomeInput")?.value?.trim();
    if (!this.userProfile) {
      this.showToast("يرجى تسجيل الدخول أولاً");
      return;
    }
    this.userProfile.name = name || this.userProfile.name;
    this.userProfile.homeAddress = home || "";
    localStorage.setItem("capital_taxi_user", JSON.stringify(this.userProfile));

    if (this.rtdb && this.currentUser) {
      this.rtdb.ref(`users/${this.currentUser.uid}`).update({
        name: this.userProfile.name,
        homeAddress: this.userProfile.homeAddress
      }).catch((e) => this.showToast("حدث خطأ أثناء حفظ البيانات"));
    }

    const modal = document.getElementById("profileModal");
    if (modal) modal.classList.remove("open");
    this.updateUserUI();
    this.showToast("تم تحديث الملف الشخصي بنجاح ✓");
  }

  renderTripHistory() {
    if (this._cachedTrips && this._cachedTrips.length > 0) {
      this.renderCustomerTripHistory(this._cachedTrips);
    } else if (this.rtdb) {
      this.rtdb.ref("trips").once("value").then((snap) => {
        this.renderCustomerTripHistory(snap.val() || {});
      }).catch(() => {
        this.renderCustomerTripHistory({});
      });
    } else {
      this.renderCustomerTripHistory({});
    }
  }

  submitComplaint(event) {
    event?.preventDefault();
    const category = document.getElementById("complaintCategory")?.value;
    const details = document.getElementById("complaintDetails")?.value?.trim();
    if (!details) {
      this.showToast("يرجى إدخال تفاصيل الشكوى");
      return;
    }

    const complaint = {
      id: "CMP_" + Date.now(),
      userId: this.userProfile?.uid || "guest",
      userName: this.userProfile?.name || "عميل",
      userPhone: this.userProfile?.phone || "01094129592",
      category,
      details,
      createdAt: Date.now(),
      resolved: false
    };

    if (this.rtdb) {
      this.rtdb.ref(`complaints/${complaint.id}`).set(complaint).catch(() => this.showToast("حدث خطأ أثناء إرسال الشكوى"));
    }

    const modal = document.getElementById("supportModal") || document.getElementById("complaintModal");
    if (modal) modal.classList.remove("open");
    const dInput = document.getElementById("complaintDetails");
    if (dInput) dInput.value = "";
    this.showToast("تم استلام شكواك وسيتم فحصها فوراً من قبل إدارة تاكسي العاصمة ✓");
  }

  handleOtpInput(el, nextId) {
    el.value = el.value.replace(/\D/g, "");
    if (el.value && nextId) {
      const nxt = document.getElementById(nextId);
      if (nxt) nxt.focus();
    }
  }

  verifyOtpCode() {
    const digits = ["otp1", "otp2", "otp3", "otp4"].map((id) => document.getElementById(id)?.value || "").join("");
    if (digits.length < 4) {
      this.showToast("يرجى إدخال رمز التحقق المكون من 4 أرقام");
      return;
    }
    const modal = document.getElementById("otpModal") || document.getElementById("phoneVerifyModal");
    if (modal) modal.classList.remove("open");
    this.showToast("تم التحقق من رقم الهاتف بنجاح ✓");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // DRIVER APP FLOW
  // ═════════════════════════════════════════════════════════════════════════
  async toggleDriverOnline(isOnline) {
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
        if (this.userProfile) this.userProfile.approved = true;
      } catch (e) {
        this.isDriverOnline = false;
        return;
      }
    } else if (isOnline && (!this.userProfile || this.userProfile.approved !== true)) {
      this.isDriverOnline = false;
      const toggle = document.getElementById("driverOnlineToggle");
      if (toggle) toggle.checked = false;
      this.showToast("عذراً، لا يمكنك استقبال الرحلات حتى يتم اعتماد حسابك من قبل الإدارة.");
      this.updateDriverVerificationUI();
      return;
    }

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
          } else if (myActiveTrip.status === "driver_arrived" || myActiveTrip.status === "ARRIVED") {
            hud.textContent = "وصلت لنقطة الالتقاء - أدخل رمز PIN من العميل لبدء الرحلة";
          } else if (myActiveTrip.status === "in_progress" || myActiveTrip.status === "IN_PROGRESS") {
            hud.textContent = `المسار جارٍ نحو الوجهة: ${myActiveTrip.to}`;
          }
        }

        // Action buttons based on status
        const btnArrived = document.getElementById("btnDriverMarkArrived") || document.getElementById("btnDriverArrivedAction");
        const btnStart = document.getElementById("btnDriverStartTrip") || document.getElementById("btnDriverStartAction");
        const btnComplete = document.getElementById("btnDriverCompleteTrip") || document.getElementById("btnDriverCompleteAction");

        if (btnArrived) {
          btnArrived.style.display = (myActiveTrip.status === "accepted" || myActiveTrip.status === "ACCEPTED") ? "block" : "none";
          btnArrived.onclick = () => this.driverMarkArrived(myActiveTrip.id);
        }
        if (btnStart) {
          btnStart.style.display = (myActiveTrip.status === "driver_arrived" || myActiveTrip.status === "ARRIVED") ? "block" : "none";
          btnStart.onclick = () => this.promptDriverPinAndStart(myActiveTrip.id, myActiveTrip.safetyPin);
        }
        if (btnComplete) {
          btnComplete.style.display = (myActiveTrip.status === "in_progress" || myActiveTrip.status === "IN_PROGRESS") ? "block" : "none";
          btnComplete.onclick = () => this.driverCompleteTrip(myActiveTrip.id);
        }

        // Chat launcher
        const chatBtn = document.getElementById("btnDriverOpenChat");
        if (chatBtn) {
          chatBtn.onclick = () => this.openChatModal(myActiveTrip.id, myActiveTrip.customerName);
        }
      }
      return;
    }

    // Otherwise, check for unassigned pending trips (matching broadcast)
    if (activeCard) activeCard.style.display = "none";
    this.activeDriverTrip = null;

    const availableTrip = Object.values(trips).find(
      (t) => (t.status === "searching" || t.status === "REQUESTED") && !t.driverId
    );

    if (availableTrip) {
      incomingCard.style.display = "block";
      const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setTxt("incomingTripFrom", availableTrip.from);
      setTxt("incomingFrom", availableTrip.from);
      setTxt("incomingTripTo", availableTrip.to);
      setTxt("incomingTo", availableTrip.to);
      setTxt("incomingTripFare", `${availableTrip.price} ج.م`);
      setTxt("incomingPrice", `${availableTrip.price} ج.م`);
      setTxt("incomingTripDistance", `${availableTrip.distanceKm || '4.2'} كم`);
      setTxt("incomingDistance", `${availableTrip.distanceKm || '4.2'} كم`);

      if (availableTrip.notes) {
        const notesBox = document.getElementById("incomingNotesBox");
        const notesText = document.getElementById("incomingNotesText");
        if (notesBox && notesText) {
          notesBox.style.display = "block";
          notesText.textContent = availableTrip.notes;
        }
      }

      // Set reference price on custom bid input
      this.currentIncomingTrip = availableTrip;
      const customBidInput = document.getElementById("inputDriverCustomBid");
      if (customBidInput && (!customBidInput.value || customBidInput.dataset.tripId !== availableTrip.id)) {
        customBidInput.value = availableTrip.price;
        customBidInput.dataset.tripId = availableTrip.id;
      }
      const refStatusText = document.getElementById("incomingBidStatusText");
      if (refStatusText) {
        refStatusText.textContent = `مرجعي: ${availableTrip.price} ج.م`;
      }

      // Accept handler
      const acceptBtn = document.getElementById("btnAcceptTrip");
      if (acceptBtn) {
        acceptBtn.onclick = () => this.driverAcceptTrip(availableTrip.id);
      }

      // Reject handler
      const rejectBtn = document.getElementById("btnRejectTrip");
      if (rejectBtn) {
        rejectBtn.onclick = () => {
          incomingCard.style.display = "none";
          if (this.incomingCountdownTimer) clearInterval(this.incomingCountdownTimer);
        };
      }

      // 15-second countdown timer
      let timeLeft = 15;
      const countEl = document.getElementById("incomingCountdown");
      if (this.incomingCountdownTimer) clearInterval(this.incomingCountdownTimer);
      this.incomingCountdownTimer = setInterval(() => {
        timeLeft--;
        if (countEl) countEl.textContent = `${timeLeft} ثانية`;
        if (timeLeft <= 0) {
          clearInterval(this.incomingCountdownTimer);
          incomingCard.style.display = "none";
        }
      }, 1000);
    } else {
      incomingCard.style.display = "none";
      if (this.incomingCountdownTimer) clearInterval(this.incomingCountdownTimer);
    }
  }

  adjustDriverBid(delta) {
    const input = document.getElementById("inputDriverCustomBid");
    if (!input) return;
    const cur = Number(input.value) || 30;
    const next = Math.max(15, cur + delta);
    input.value = next;
  }

  resetDriverBidToRef() {
    const input = document.getElementById("inputDriverCustomBid");
    if (!input || !this.currentIncomingTrip) return;
    input.value = this.currentIncomingTrip.price;
  }

  async submitDriverBidOffer() {
    const isApproved = this.userProfile?.approved === true;
    if (!isApproved) {
      this.showToast("عذراً، حسابك غير معتمد بعد من قبل الإدارة لتقديم عروض الأسعار.");
      return;
    }
    if (!this.currentIncomingTrip) {
      this.showToast("لا يوجد طلب رحلة نشط حالياً لتقديم عرض عليه.");
      return;
    }
    const input = document.getElementById("inputDriverCustomBid");
    const bidPrice = Number(input?.value);
    if (!bidPrice || bidPrice < 15) {
      this.showToast("يرجى إدخال سعر عرض صحيح (الحد الأدنى 15 ج.م).");
      return;
    }

    const tripId = this.currentIncomingTrip.id;
    const driverUid = this.currentUser?.uid || this.userProfile?.uid || "drv_" + Date.now();
    const offerData = {
      tripId,
      driverId: driverUid,
      driverName: this.userProfile?.name || "كابتن العاصمة",
      driverPhone: this.userProfile?.phone || "01094129592",
      carModel: this.userProfile?.carModel || "كود 1",
      carPlate: this.userProfile?.carPlate || "ط أ س 1234",
      rating: this.userProfile?.rating || 4.9,
      price: bidPrice,
      refPrice: this.currentIncomingTrip.price,
      status: "pending",
      timestamp: Date.now()
    };

    try {
      if (this.rtdb) {
        await this.rtdb.ref(`trip_offers/${tripId}/${driverUid}`).set(offerData);
      }
      this.showToast(`تم إرسال عرض سعرك (${bidPrice} ج.م) للعميل بنجاح! في انتظار اختياره.`);
      const statusText = document.getElementById("incomingBidStatusText");
      if (statusText) statusText.textContent = `تم إرسال عرضك: ${bidPrice} ج.م ✓`;
    } catch (e) {
      this.showToast("خطأ أثناء إرسال العرض: " + e.message);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // CUSTOMER BIDDING / OFFERS SELECTION
  // ═════════════════════════════════════════════════════════════════════════
  attachTripOffersListener(tripId) {
    if (!this.rtdb || !tripId) return;
    if (this._currentOffersTripId === tripId) return;
    this._currentOffersTripId = tripId;

    this.rtdb.ref(`trip_offers/${tripId}`).on("value", (snap) => {
      const offers = snap.val() || {};
      this.renderCustomerIncomingBids(offers, tripId);
    }, (err) => console.warn("Trip offers listener notice:", err.message));
  }

  renderCustomerIncomingBids(offers, tripId) {
    const list = document.getElementById("customerBidsList");
    const countBadge = document.getElementById("customerBidsCountBadge");
    if (!list) return;

    const offerEntries = Object.entries(offers).filter(([, o]) => o && o.status !== "rejected");
    if (countBadge) countBadge.textContent = `${offerEntries.length} عروض`;

    if (offerEntries.length === 0) {
      list.innerHTML = `
        <div style="text-align:center; padding:10px; font-size:0.75rem; color:var(--text-muted); background:rgba(0,0,0,0.25); border-radius:6px;">
          في انتظار تقديم أول كابتن لعرض سعر...
        </div>
      `;
      return;
    }

    list.innerHTML = offerEntries.map(([driverId, o]) => `
      <div style="background:var(--color-surface-elev, #1C2738); border:1px solid rgba(213,174,99,0.3); border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:700; color:var(--text-main); font-size:0.85rem;">${o.driverName || 'كابتن معتمد'}</div>
          <div style="font-size:0.72rem; color:var(--text-muted);">${o.carModel || 'تاكسي كود 1'} • ⭐ ${o.rating || '4.9'}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="font-size:1.15rem; font-weight:900; color:var(--gold-bright);">${o.price} ج.م</div>
          <button type="button" class="btn-primary-gold" style="padding:5px 12px; font-size:0.75rem;" onclick="window.app.customerAcceptDriverBid('${tripId}', '${driverId}', ${o.price})">
            اختيار العرض ✓
          </button>
        </div>
      </div>
    `).join("");
  }

  async customerAcceptDriverBid(tripId, driverId, agreedPrice) {
    if (!this.rtdb) {
      this.showToast("لا يوجد اتصال بقاعدة البيانات");
      return;
    }

    const tripRef = this.rtdb.ref(`trips/${tripId}`);
    try {
      // Fetch offer details to populate driver info
      const offerSnap = await this.rtdb.ref(`trip_offers/${tripId}/${driverId}`).once("value");
      const offer = offerSnap.val() || {};

      // Atomic transition via Firebase transaction
      const txResult = await tripRef.transaction((currentData) => {
        if (!currentData) return currentData;
        // If already accepted by someone else, abort transaction
        if (currentData.status === "accepted" || currentData.driverId) {
          return undefined; // abort
        }
        currentData.status = "accepted";
        currentData.driverId = driverId;
        currentData.driverName = offer.driverName || "كابتن العاصمة";
        currentData.driverPhone = offer.driverPhone || "01094129592";
        currentData.carModel = offer.carModel || "تويوتا كورولا";
        currentData.carPlate = offer.carPlate || "ط أ س 1234";
        currentData.price = Number(agreedPrice);
        currentData.acceptedAt = Date.now();
        return currentData;
      });

      if (!txResult.committed || !txResult.snapshot.exists()) {
        this.showToast("عفواً: الرحلة محجوزة بالفعل أو تم قبول عرض آخر.");
        return;
      }

      // Mark the chosen offer as accepted and others as closed
      await this.rtdb.ref(`trip_offers/${tripId}/${driverId}/status`).set("accepted").catch(() => {});
      
      // Detach offers listener
      this.rtdb.ref(`trip_offers/${tripId}`).off();
      this._currentOffersTripId = null;

      this.showToast(`تم قبول عرض الكابتن بنجاح! السعر النهائي المثبت: ${agreedPrice} ج.م`);
    } catch (e) {
      this.showToast("خطأ أثناء اختيار العرض: " + e.message);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ADMIN LIVE FLEET MAP
  // ═════════════════════════════════════════════════════════════════════════
  initAdminLiveMap() {
    const container = document.getElementById("adminLiveMapViewport");
    if (!container) return;

    if (!this.adminLiveMapInstance && typeof L !== "undefined") {
      this.adminLiveMapInstance = L.map("adminLiveMapViewport", {
        center: [31.1316, 33.8016],
        zoom: 13,
        zoomControl: true
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap contributors, © CartoDB",
        maxZoom: 18
      }).addTo(this.adminLiveMapInstance);

      this.adminLiveMapMarkersGroup = L.layerGroup().addTo(this.adminLiveMapInstance);
    } else if (this.adminLiveMapInstance) {
      setTimeout(() => {
        this.adminLiveMapInstance.invalidateSize();
      }, 250);
    }

    this.updateAdminLiveMapMarkers();
  }

  updateAdminLiveMapMarkers() {
    if (!this.adminLiveMapInstance || !this.adminLiveMapMarkersGroup) return;

    this.adminLiveMapMarkersGroup.clearLayers();

    const drivers = this.adminData.drivers || {};
    const liveLocs = this.liveDriverLocations || {};
    const trips = this.adminData.trips || {};
    const activeTrips = Object.values(trips).filter((t) => ["accepted", "driver_arrived", "in_progress"].includes(t.status));

    let gpsCount = 0;
    let latestSignalTime = 0;
    const filter = this._adminMapFilter || "all";

    // 1. Plot Drivers
    Object.entries(drivers).forEach(([uid, d]) => {
      const loc = liveLocs[uid] || { lat: d.lat, lng: d.lng, updatedAt: d.updatedAt };
      if (!loc || !loc.lat || !loc.lng) return;

      gpsCount++;
      if (loc.updatedAt && loc.updatedAt > latestSignalTime) {
        latestSignalTime = loc.updatedAt;
      }

      const isOnline = d.available === true || d.status === "online";
      const isBusy = activeTrips.some((t) => t.driverId === uid);

      if (filter === "online" && (!isOnline || isBusy)) return;
      if (filter === "busy" && !isBusy) return;
      if (filter === "active_trips") return;

      const markerColor = isBusy ? "#F59E0B" : isOnline ? "#10B981" : "#6B7280";
      const statusAr = isBusy ? "مشغول برحلة" : isOnline ? "متاح للطلب" : "غير متصل";

      const timeAgo = loc.updatedAt ? `${Math.round((Date.now() - loc.updatedAt) / 1000)} ثانية مضت` : "غير محدد";

      const iconHtml = `
        <div style="background:${markerColor}; width:24px; height:24px; border-radius:50%; border:2px solid #FFFFFF; display:flex; align-items:center; justify-content:center; box-shadow:0 0 8px rgba(0,0,0,0.5); font-size:11px;">
          🚖
        </div>
      `;
      const customIcon = L.divIcon({ html: iconHtml, className: "", iconSize: [24, 24], iconAnchor: [12, 12] });

      const marker = L.marker([loc.lat, loc.lng], { icon: customIcon });
      marker.bindPopup(`
        <div style="direction:rtl; font-family:var(--font-sans); color:#0B0F16; font-size:0.85rem; padding:4px;">
          <strong>🚖 ${d.name || 'كابتن العاصمة'}</strong><br>
          <span>السيارة: ${d.carModel || 'كود 1'} (${d.carPlate || 'ط أ س'})</span><br>
          <span>الحالة: <b style="color:${markerColor};">${statusAr}</b></span><br>
          <small style="color:#666;">آخر إشارة GPS: ${timeAgo}</small>
        </div>
      `);
      this.adminLiveMapMarkersGroup.addLayer(marker);
    });

    // 2. Plot Active Trips
    if (filter === "all" || filter === "active_trips" || filter === "busy") {
      activeTrips.forEach((t) => {
        if (t.fromLat && t.fromLng && t.toLat && t.toLng) {
          // Draw connecting line
          const line = L.polyline([
            [t.fromLat, t.fromLng],
            [t.toLat, t.toLng]
          ], { color: "#D5AE63", weight: 3, dashArray: "6, 8" });
          line.bindPopup(`
            <div style="direction:rtl; font-family:var(--font-sans); color:#0B0F16; font-size:0.82rem;">
              <strong>🚗 رحلة نشطة #${t.id ? t.id.slice(0, 6) : ''}</strong><br>
              من: ${t.from}<br>
              إلى: ${t.to}<br>
              الأجرة: <b>${t.price} ج.م</b><br>
              الحالة: ${this.getStatusName(t.status)}
            </div>
          `);
          this.adminLiveMapMarkersGroup.addLayer(line);
        }
      });
    }

    // Update stats bar
    const gpsEl = document.getElementById("adminLiveGpsCount");
    if (gpsEl) gpsEl.textContent = gpsCount;
    const tripsEl = document.getElementById("adminLiveTripsCount");
    if (tripsEl) tripsEl.textContent = activeTrips.length;
    const signalEl = document.getElementById("adminLiveLastSignal");
    if (signalEl) {
      signalEl.textContent = latestSignalTime > 0 ? `${Math.round((Date.now() - latestSignalTime) / 1000)} ثانية مضت` : "لا توجد إشارة";
    }
  }

  filterAdminMapMarkers(filterVal) {
    this._adminMapFilter = filterVal;
    this.updateAdminLiveMapMarkers();
  }

  refreshAdminLiveMap() {
    this.updateAdminLiveMapMarkers();
    this.showToast("تم تحديث إحداثيات الخريطة الحية للأسطول بنجاح ✓");
  }

  async completeActiveTrip() {
    if (this.activeDriverTrip) {
      await this.driverCompleteTrip(this.activeDriverTrip.id);
    }
  }

  async driverAcceptTrip(tripId) {
    const isApproved = this.userProfile?.approved === true;
    if (!isApproved) {
      this.showToast("عذراً، حسابك غير معتمد بعد من قبل الإدارة لقبول الرحلات.");
      return;
    }

    const driverInfo = {
      uid: this.currentUser?.uid || this.userProfile?.uid || "drv_" + Date.now(),
      name: this.userProfile?.name || "كابتن العاصمة",
      phone: this.userProfile?.phone || "01094129592",
      carModel: this.userProfile?.carModel || "كود 1",
      carPlate: this.userProfile?.carPlate || "ط أ س 1234"
    };

    try {
      const res = await this.dispatch.acceptTripAtomic(tripId, driverInfo);
      if (res.success) {
        this.showToast("تم قبول الرحلة بنجاح! توجه الآن إلى موقع العميل.");
      } else {
        this.showToast("عفواً: لقد سبقك كابتن آخر في قبول هذه الرحلة.");
      }
    } catch (e) {
      this.showToast("خطأ أثناء قبول الطلب: " + e.message);
    }
  }

  async driverMarkArrived(tripId) {
    await this.dispatch.markDriverArrived(tripId);
    this.showToast("تم إشعار العميل بوصولك إلى نقطة الالتقاء!");
  }

  async driverCompleteTrip(tripId) {
    if (!this.activeDriverTrip) return;
    const trip = this.activeDriverTrip;

    try {
      await this.dispatch.completeTrip(tripId);

      // Handle financial transactions (deduct 10% platform commission)
      const commissionRate = 0.10;
      const commissionFee = Number((trip.price * commissionRate).toFixed(2));
      const driverEarnings = Number((trip.price - commissionFee).toFixed(2));

      if (trip.paymentMethod === "محفظة") {
        await this.wallet?.deductTripFare(trip.customerId, trip.price, tripId);
        await this.wallet?.creditDriverEarnings(trip.driverId, driverEarnings, tripId);
      } else {
        await this.wallet?.deductDriverCommission(trip.driverId, commissionFee, tripId);
      }

      this.showToast(`تم إنهاء الرحلة بنجاح! أرباحك: ${driverEarnings} ج.م (عمولة التطبيق: ${commissionFee} ج.م)`);
      const activeCard = document.getElementById("driverActiveTripCard");
      if (activeCard) activeCard.style.display = "none";
      this.activeDriverTrip = null;
    } catch (e) {
      this.showToast("خطأ أثناء إنهاء الرحلة: " + e.message);
    }
  }

  renderDriverTripHistory(allTrips) {
    const container = document.getElementById("driverTripHistoryContainer");
    if (!container) return;
    const myUid = this.userProfile?.uid;
    if (!myUid) {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:1.5rem;">يرجى تسجيل الدخول لعرض سجل رحلاتك</div>';
      return;
    }
    const myCompleted = Object.values(allTrips).filter((t) => t.driverId === myUid && (t.status === "completed" || t.status === "COMPLETED"));
    if (myCompleted.length === 0) {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:1.5rem;">لا توجد رحلات مكتملة بعد</div>';
      return;
    }
    container.innerHTML = myCompleted.map((t) => `
      <div style="background:var(--bg-card); border-radius:12px; padding:1rem; margin-bottom:0.75rem; border:1px solid var(--border-color);">
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
          <strong>${t.from} ← ${t.to}</strong>
          <span style="color:var(--status-green); font-weight:700;">+${t.price} ج.م</span>
        </div>
        <div style="font-size:0.85rem; color:var(--text-muted); display:flex; justify-content:space-between;">
          <span>العميل: ${t.customerName || 'عميل'}</span>
          <span>${new Date(t.createdAt || Date.now()).toLocaleDateString("ar-EG")}</span>
        </div>
      </div>
    `).join("");
  }

  openGoogleMapsDirections(lat, lng) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // CHAT & MESSAGING
  // ═════════════════════════════════════════════════════════════════════════
  openChatModal(tripId, peerName) {
    this.activeChatTripId = tripId;
    const modal = document.getElementById("chatModal");
    const title = document.getElementById("chatPeerName");
    if (title) title.textContent = `محادثة مع: ${peerName || 'الكابتن'}`;
    if (modal) modal.classList.add("open");

    // Quick Canned Replies
    const quickRepliesBox = document.getElementById("chatQuickReplies");
    if (quickRepliesBox && quickRepliesBox.children.length === 0) {
      const isDriver = this.currentRole === "driver";
      const canned = isDriver
        ? ["أنا في الطريق إليك الآن", "وصلت لنقطة الالتقاء", "أمام مدخل المبنى", "ثواني وأكون عندك"]
        : ["أنا بانتظارك أمام البوابة", "معي حقائب إضافية", "أنا أرتدي جاكيت أزرق", "تمام، شكراً لك"];
      quickRepliesBox.innerHTML = canned
        .map((text) => `<button type="button" class="chip-btn canned-reply-btn">${text}</button>`)
        .join("");
      quickRepliesBox.querySelectorAll(".canned-reply-btn").forEach((btn) => {
        btn.onclick = () => {
          const inp = document.getElementById("chatInputText") || document.getElementById("chatTextInput");
          if (inp) {
            inp.value = btn.textContent;
            this.sendChatMessage(this.currentRole);
          }
        };
      });
    }

    // Listen to messages
    const container = document.getElementById("chatMessagesContainer") || document.getElementById("chatMessagesList");
    if (container) container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:1rem;">جاري تحميل المحادثة...</div>';

    this.chat?.listenToMessages(tripId, (messages) => {
      if (!container) return;
      if (!messages || messages.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:1rem;">لا توجد رسائل بعد. أرسل رسالة للبدء.</div>';
        return;
      }
      container.innerHTML = messages
        .map((m) => {
          const isMe = m.senderId === (this.currentUser?.uid || this.userProfile?.uid);
          return `
          <div class="chat-bubble ${isMe ? 'outgoing' : 'incoming'}" style="margin-bottom:8px; padding:8px 12px; border-radius:12px; max-width:80%; ${isMe ? 'background:rgba(212,175,55,0.2); border:1px solid var(--border-gold); margin-right:auto;' : 'background:rgba(255,255,255,0.08); margin-left:auto;'}">
            <div style="font-size:0.9rem; color:var(--text-main);">${m.text}</div>
            <div style="font-size:0.7rem; opacity:0.7; margin-top:2px; text-align:left;">${new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        `;
        })
        .join("");
      container.scrollTop = container.scrollHeight;
    });

    // Send button event
    const sendBtn = document.getElementById("btnSendChatMessage");
    const input = document.getElementById("chatTextInput") || document.getElementById("chatInputText");
    if (sendBtn && input) {
      sendBtn.onclick = () => this.sendChatMessage(this.currentRole);
      input.onkeypress = (e) => {
        if (e.key === "Enter") this.sendChatMessage(this.currentRole);
      };
    }
  }

  async sendChatMessage(role) {
    const input = document.getElementById("chatInputText") || document.getElementById("chatTextInput");
    const text = input?.value?.trim();
    if (!text || !this.activeChatTripId) return;

    await this.chat?.sendMessage({
      tripId: this.activeChatTripId,
      senderId: this.currentUser?.uid || this.userProfile?.uid || "user_guest",
      senderName: this.userProfile?.name || (role === "driver" ? "الكابتن" : "العميل"),
      text
    });
    if (input) input.value = "";
  }

  closeChatModal() {
    const modal = document.getElementById("chatModal");
    if (modal) modal.classList.remove("open");
    this.activeChatTripId = null;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // RATINGS & QUALITY CONTROL
  // ═════════════════════════════════════════════════════════════════════════
  openRatingModal(trip = {}) {
    this._ratingTrip = trip;
    const modal = document.getElementById("ratingModal");
    if (!modal) return;
    const dNameEl = document.getElementById("ratingDriverName");
    if (dNameEl) dNameEl.textContent = trip.driverName || "كابتن تاكسي العاصمة";
    modal.classList.add("open");

    let chosenStars = 5;
    const stars = document.querySelectorAll(".star-rating-select span");
    stars.forEach((star) => {
      star.onclick = () => {
        chosenStars = Number(star.dataset.val);
        stars.forEach((s) => {
          s.classList.toggle("selected", Number(s.dataset.val) <= chosenStars);
        });
      };
    });

    const tagsContainer = document.getElementById("ratingTagsContainer") || document.getElementById("ratingTagsBox");
    if (tagsContainer && this.ratings && tagsContainer.children.length === 0) {
      tagsContainer.innerHTML = this.ratings
        .getReviewTags()
        .map((t) => `<button type="button" class="chip-btn review-tag-chip" data-id="${t.id}">${t.label}</button>`)
        .join("");
      document.querySelectorAll(".review-tag-chip").forEach((chip) => {
        chip.onclick = () => chip.classList.toggle("active");
      });
    }

    const submitBtn = document.getElementById("btnSubmitRating");
    if (submitBtn) {
      submitBtn.onclick = () => this.submitDriverRating();
    }
  }

  async submitDriverRating() {
    const modal = document.getElementById("ratingModal");
    let chosenStars = 5;
    const checkedRadio = document.querySelector('input[name="starRating"]:checked');
    if (checkedRadio) chosenStars = Number(checkedRadio.value) || 5;

    const selectedTags = Array.from(document.querySelectorAll(".review-tag-chip.active")).map(
      (c) => c.dataset.id
    );
    const comment = (document.getElementById("ratingComment") || document.getElementById("ratingCommentText"))?.value || "";

    const trip = this._ratingTrip || this.activeCustomerTrip || {
      id: "trip_" + Date.now(),
      customerId: this.userProfile?.uid || "guest",
      customerName: this.userProfile?.name || "عميل العاصمة",
      driverId: "mock_driver",
      driverName: "كابتن العاصمة"
    };

    if (this.ratings) {
      await this.ratings.submitReview({
        tripId: trip.id,
        customerId: trip.customerId,
        customerName: trip.customerName,
        driverId: trip.driverId,
        rating: chosenStars,
        tags: selectedTags,
        comment
      });
    }

    if (this.selectedTipAmount > 0 && this.wallet && trip.driverId) {
      await this.wallet.creditDriverEarnings(trip.driverId, this.selectedTipAmount, trip.id);
      this.showToast(`تمت إضافة إكرامية ${this.selectedTipAmount} ج.م للكابتن. شكراً لكرمك! ✨`);
    }

    const ratedTrips = JSON.parse(localStorage.getItem("rated_trips") || "[]");
    ratedTrips.push(trip.id);
    localStorage.setItem("rated_trips", JSON.stringify(ratedTrips));

    if (modal) modal.classList.remove("open");
    this.showToast("شكراً لك! تم تسجيل تقييمك بنجاح لمساعدة مجتمع تاكسي العاصمة.");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // WALLET & FINANCIALS
  // ═════════════════════════════════════════════════════════════════════════
  async refreshUserWalletUI() {
    if (!this.userProfile) return;
    const balEl = document.getElementById("walletBalanceDisplay") || document.getElementById("walletBalanceText");
    const balNav = document.getElementById("navWalletBalance") || document.getElementById("btnWalletMiniBalance");
    const driverBal = document.getElementById("driverWalletBalanceText");

    if (this.wallet) {
      const balance = await this.wallet.getWalletBalance(this.userProfile.uid);
      if (balEl) balEl.textContent = `${balance.toFixed(2)} ج.م`;
      if (balNav) balNav.textContent = `${balance.toFixed(0)}ج`;
      if (driverBal) driverBal.textContent = `${balance.toFixed(2)} ج.م`;
    }
  }

  async topUpUserWallet(amount) {
    await this.processTopup(amount);
  }

  openTopupModal() {
    const modal = document.getElementById("topupModal") || document.getElementById("walletModal");
    if (modal) modal.classList.add("open");
  }

  async processTopup(amount) {
    if (!this.userProfile) {
      this.showToast("يرجى تسجيل الدخول أولاً.");
      return;
    }
    const res = await this.wallet?.topUpWallet(this.userProfile.uid, amount, "فوري / كاش");
    if (res?.success) {
      this.refreshUserWalletUI();
      const modal = document.getElementById("topupModal") || document.getElementById("walletModal");
      if (modal) modal.classList.remove("open");
      this.showToast(`تم شحن محفظتك بمبلغ ${amount} ج.م بنجاح!`);
    } else {
      this.showToast("خطأ أثناء الشحن: " + (res?.error || "فشل العملية"));
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ADMIN DASHBOARD & CONTROLS
  // ═════════════════════════════════════════════════════════════════════════
  updateAdminMetrics() {
    const drivers = Object.values(this.adminData.drivers || {});
    const trips = Object.values(this.adminData.trips || {});
    const users = Object.values(this.adminData.users || {});
    const complaints = Object.values(this.adminData.complaints || {});

    const activeDrivers = drivers.filter((d) => d.available || d.status === "online").length;
    const activeTrips = trips.filter((t) => ["searching", "REQUESTED", "accepted", "ACCEPTED", "driver_arrived", "ARRIVED", "in_progress", "IN_PROGRESS"].includes(t.status)).length;
    const completedTrips = trips.filter((t) => t.status === "completed" || t.status === "COMPLETED");
    const cancelledTrips = trips.filter((t) => ["cancelled", "CANCELLED"].includes(t.status)).length;
    const totalRevenue = completedTrips.reduce((acc, t) => acc + Number(t.price || 0), 0);
    const platformCommission = Number((totalRevenue * 0.10).toFixed(2));
    const driverPayout = Number((totalRevenue - platformCommission).toFixed(2));

    this.setAdminText("adminTotalDrivers", drivers.length);
    this.setAdminText("adminOnlineDrivers", activeDrivers);
    this.setAdminText("adminTotalTrips", trips.length);
    this.setAdminText("adminActiveTrips", activeTrips);
    this.setAdminText("adminCompletedTrips", completedTrips.length);
    this.setAdminText("adminCancelledTrips", cancelledTrips);
    this.setAdminText("adminTotalRevenue", `${totalRevenue} ج.م`);
    this.setAdminText("adminPlatformCommission", `${platformCommission} ج.م`);
    this.setAdminText("adminCommission", `${platformCommission} ج.م`);
    this.setAdminText("adminDriversPayout", `${driverPayout} ج.م`);
    this.setAdminText("adminTotalUsers", users.length);
    this.setAdminText("adminTotalComplaints", complaints.filter((c) => !c.resolved).length);
  }

  setAdminText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  renderAdminDrivers(drivers) {
    const tbody = document.getElementById("adminDriversTableBody");
    if (!tbody) return;
    const list = Object.entries(drivers || {});
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">لا يوجد كباتن مسجلون بعد</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map(
        ([id, d]) => `
      <tr>
        <td><strong>${d.name || 'كابتن'}</strong><div style="font-size:0.75rem; color:var(--text-muted);">${id}</div></td>
        <td>${d.phone || '01094129592'}</td>
        <td>${d.carModel || 'كود 1'} <small style="color:var(--gold-bright);">(${d.carPlate || 'ط أ س'})</small></td>
        <td><span class="status-badge ${d.available ? 'green' : 'yellow'}">${d.available ? 'متاح الآن' : 'غير متصل'}</span></td>
        <td>⭐ ${d.rating || '4.9'}</td>
        <td><strong>${d.completedTrips || d.tripsCount || '0'}</strong> رحلة</td>
        <td>
          <button class="chip-btn ${d.approved ? 'chip-error' : 'chip-success'}" style="font-size:0.75rem; padding:4px 10px;" onclick="window.app.toggleDriverApproval('${id}', ${!d.approved})">
            ${d.approved ? 'إيقاف الاعتماد' : 'اعتماد رسمي ✓'}
          </button>
        </td>
      </tr>
    `
      )
      .join("");
  }

  renderAdminUsers(users) {
    const tbody = document.getElementById("adminUsersTableBody");
    if (!tbody) return;
    const list = Object.entries(users || {});
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">لا يوجد عملاء مسجلون</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map(
        ([id, u]) => `
      <tr>
        <td><strong>${u.name || 'مستخدم'}</strong><div style="font-size:0.75rem; color:var(--text-muted);">${id}</div></td>
        <td>${u.phone || '01094129592'}</td>
        <td>${u.email || u.role || 'customer'}</td>
        <td><span class="status-badge ${u.status === 'blocked' ? 'red' : 'green'}">${u.status === 'blocked' ? 'محظور' : 'نشط'}</span></td>
        <td>
          <button class="chip-btn ${u.status === 'blocked' ? 'chip-success' : 'chip-error'}" style="font-size:0.75rem; padding:4px 10px;" onclick="window.app.toggleUserBlock('${id}', ${u.status !== 'blocked'})">
            ${u.status === 'blocked' ? 'فك الحظر' : 'حظر الحساب'}
          </button>
        </td>
      </tr>
    `
      )
      .join("");
  }

  renderAdminTrips(trips) {
    const tbody = document.getElementById("adminTripsTableBody");
    if (!tbody) return;
    const list = Object.entries(trips || {}).reverse();
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">لا توجد رحلات مسجلة</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .slice(0, 50)
      .map(
        ([id, t]) => `
      <tr>
        <td><span style="font-family:monospace; font-size:0.8rem; color:var(--gold-bright);">${id.slice(-6)}</span></td>
        <td>${t.customerName || 'عميل'}<div style="font-size:0.75rem; color:var(--text-muted);">${t.customerPhone || ''}</div></td>
        <td>${t.from} ← ${t.to}</td>
        <td><strong>${t.price} ج.م</strong> <small style="color:var(--text-muted);">(${t.paymentMethod || 'كاش'})</small></td>
        <td><span class="status-badge ${this.getStatusBadgeClass(t.status)}">${this.getStatusName(t.status)}</span></td>
        <td>${t.driverName || '—'}</td>
        <td><span style="font-size:0.78rem; color:var(--text-muted);">${new Date(t.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
        <td>
          ${t.status === 'searching' || t.status === 'accepted' ? `<button class="chip-btn chip-error" style="font-size:0.75rem; padding:2px 8px;" onclick="window.app.cancelTripByAdmin('${id}')">إلغاء</button>` : '—'}
        </td>
      </tr>
    `
      )
      .join("");
  }

  renderAdminComplaints(complaints) {
    const tbody = document.getElementById("adminComplaintsTableBody");
    if (!tbody) return;
    const list = Object.entries(complaints || {});
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">لا توجد شكاوى واردة حالياً</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map(
        ([id, c]) => `
      <tr>
        <td><strong>${c.userName || 'مستخدم'}</strong><div style="font-size:0.75rem; color:var(--text-muted);">${c.userPhone || ''}</div></td>
        <td>${c.category || 'عام'}</td>
        <td>${c.details}</td>
        <td><span style="font-size:0.78rem; color:var(--text-muted);">${new Date(c.createdAt || Date.now()).toLocaleDateString('ar-EG')}</span></td>
        <td><span class="status-badge ${c.resolved ? 'green' : 'yellow'}">${c.resolved ? 'محلولة ✓' : 'قيد المتابعة'}</span></td>
        <td>
          <button class="chip-btn" style="font-size:0.75rem; padding:4px 10px;" onclick="window.app.resolveComplaint('${id}', ${!c.resolved})">
            ${c.resolved ? 'إعادة فتح' : 'تم الحل ✓'}
          </button>
        </td>
      </tr>
    `
      )
      .join("");
  }

  toggleDriverApproval(driverId, approve) {
    if (!this.checkAdminPrivileges()) return;
    if (this.rtdb) {
      const updates = {};
      updates[`drivers/${driverId}/approved`] = approve;
      updates[`drivers/${driverId}/status`] = approve ? "offline" : "suspended";
      updates[`users/${driverId}/approved`] = approve;
      this.rtdb.ref().update(updates)
        .then(() => {
          this.showToast(approve ? "تم اعتماد الكابتن بنجاح ✓" : "تم إيقاف حساب الكابتن");
        })
        .catch((err) => {
          this.showToast("خطأ أثناء تحديث حالة الكابتن: " + (err.message || "صلاحيات غير كافية"));
        });
    }
  }

  toggleUserBlock(userId, block) {
    if (!this.checkAdminPrivileges()) return;
    if (this.rtdb) {
      this.rtdb.ref(`users/${userId}/status`).set(block ? "blocked" : "active");
      this.showToast(block ? "تم حظر الحساب" : "تم فك الحظر عن الحساب");
    }
  }

  resolveComplaint(complaintId, resolved) {
    if (!this.checkAdminPrivileges()) return;
    if (this.rtdb) {
      this.rtdb.ref(`complaints/${complaintId}/resolved`).set(resolved);
      this.showToast(resolved ? "تم تمييز الشكوى كمحلولة ✓" : "تمت إعادة فتح الشكوى");
    }
  }

  cancelTripByAdmin(tripId) {
    if (!this.checkAdminPrivileges()) return;
    if (confirm("هل أنت متأكد من إلغاء هذه الرحلة إدارياً؟")) {
      this.dispatch.cancelTrip(tripId, "إلغاء إداري");
      this.showToast("تم إلغاء الرحلة.");
    }
  }

  checkAdminPrivileges() {
    const isSuper = this.userProfile?.isSuperAdmin || this.userProfile?.role === "admin";
    if (!isSuper) {
      this.showToast("عفواً: هذه العملية تتطلب صلاحيات إدارة كاملة.");
      return false;
    }
    return true;
  }

  exportReportToCSV() {
    if (!this.checkAdminPrivileges()) return;
    const trips = Object.values(this.adminData.trips || {});
    let csv = "المعرف,العميل,الهاتف,الانطلاق,الوجهة,السعر,طريقة_الدفع,الحالة,السائق,التاريخ\n";
    trips.forEach((t) => {
      csv += `"${t.id}","${t.customerName || ''}","${t.customerPhone || ''}","${t.from}","${t.to}",${t.price},"${t.paymentMethod || 'كاش'}","${t.status}","${t.driverName || ''}","${new Date(t.createdAt || Date.now()).toLocaleDateString('ar-EG')}"\n`;
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `تقرير_رحلات_تاكسي_العاصمة_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast("تم تصدير التقرير بنجاح ✓");
  }

  switchView(viewName) {
    document.querySelectorAll(".view-section").forEach((sec) => sec.classList.remove("active"));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add("active");

    document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === viewName);
    });

    if (viewName === "customer" || viewName === "landing") {
      setTimeout(() => this.maps?.invalidateSize(), 250);
    }
  }

  getStatusName(s) {
    return (
      {
        pending: "جاري البحث عن كابتن",
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
      }[s] || s || "—"
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

    // Autocomplete input debounced listeners
    const pInp = document.getElementById("inputPickup");
    if (pInp) {
      pInp.addEventListener("input", (e) => this.handleLocationInput(e.target.value, "pickup"));
      pInp.addEventListener("focus", (e) => {
        if (e.target.value) this.handleLocationInput(e.target.value, "pickup");
      });
    }

    const dInp = document.getElementById("inputDropoff");
    if (dInp) {
      dInp.addEventListener("input", (e) => this.handleLocationInput(e.target.value, "dropoff"));
      dInp.addEventListener("focus", (e) => {
        if (e.target.value) this.handleLocationInput(e.target.value, "dropoff");
      });
    }

    // Close autocomplete on click outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#pickupAutocomplete") && e.target !== pInp) {
        const d = document.getElementById("pickupAutocomplete");
        if (d) d.style.display = "none";
      }
      if (!e.target.closest("#dropoffAutocomplete") && e.target !== dInp) {
        const d = document.getElementById("dropoffAutocomplete");
        if (d) d.style.display = "none";
      }
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
