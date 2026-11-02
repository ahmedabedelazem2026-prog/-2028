// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI (Al-Arish, North Sinai, Egypt)
// Official Firebase & Google Maps Configuration
// =========================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyCfcmi-Atjlay550alHXslmmxfm9hFuNgM",
  authDomain: "taxi-alasema-app-2026.firebaseapp.com",
  databaseURL: "https://taxi-alasema-app-2026-default-rtdb.firebaseio.com",
  projectId: "taxi-alasema-app-2026",
  storageBucket: "taxi-alasema-app-2026.firebasestorage.app",
  messagingSenderId: "343674981534",
  appId: "1:343674981534:web:3e4b8974e18d294407bf8f"
};

export const googleMapsConfig = {
  // Official Browser key with Maps JavaScript, Places, and Routes API targets
  browserKey: "AIzaSyCdUh2kAkcyeRzDTqKT_nd_TgjC5-Ky1MA",
  // REST Key with Geocoding, Places and Routes services enabled
  restKey: "AIzaSyAXH12UHVdE0S4rk9Om1M8NzHzGEKcfn8k",
  // City center coordinates for Al-Arish (Al-Bahr & 23rd of July St intersection)
  defaultCenter: {
    lat: 31.1316,
    lng: 33.8016
  },
  defaultZoom: 14,
  // Key landmarks of Al-Arish with verified accurate geographical coordinates
  arishLandmarks: [
    { id: "beach", name: "شاطئ العريش (الكورنيش والساحل)", lat: 31.1442, lng: 33.8115, category: "leisure" },
    { id: "castle", name: "قلعة العريش التاريخية", lat: 31.1278, lng: 33.7994, category: "history" },
    { id: "nasr_mosque", name: "مسجد النصر (ميدان النصر)", lat: 31.1316, lng: 33.8016, category: "center" },
    { id: "univ_arish", name: "جامعة العريش (ضاحية السلام)", lat: 31.1192, lng: 33.8322, category: "education" },
    { id: "univ_sinai", name: "جامعة سيناء (المساعيد)", lat: 31.1558, lng: 33.7429, category: "education" },
    { id: "masaed", name: "حي المساعيد السكني والجامعي", lat: 31.1485, lng: 33.7550, category: "residential" },
    { id: "downtown", name: "وسط البلد (السوق التجاري وشارع 23 يوليو)", lat: 31.1290, lng: 33.8030, category: "commercial" },
    { id: "fawakheria", name: "حي الفواخرية القديم", lat: 31.1250, lng: 33.8080, category: "residential" },
    { id: "reisa", name: "حي الريسة (المدخل الشرقي)", lat: 31.1410, lng: 33.8550, category: "transit" },
    { id: "salam", name: "ضاحية السلام ومجمع المصالح الحكومية", lat: 31.1220, lng: 33.8290, category: "government" },
    { id: "hospital_general", name: "مستشفى العريش العام", lat: 31.1360, lng: 33.8055, category: "medical" },
    { id: "suez_canal_club", name: "نادي وفندق القوات المسلحة (الساحل)", lat: 31.1465, lng: 33.8180, category: "leisure" },
    // Intercity travel points
    { id: "sheikh_zuwayed", name: "الشيخ زويد", lat: 31.2139, lng: 34.1114, category: "intercity" },
    { id: "rafah", name: "رفح المصرية", lat: 31.2828, lng: 34.2444, category: "intercity" },
    { id: "bir_al_abd", name: "بئر العبد", lat: 31.0260, lng: 33.0125, category: "intercity" },
    { id: "ismailia", name: "مدينة الإسماعيلية", lat: 30.5965, lng: 32.2715, category: "intercity" },
    { id: "cairo", name: "موقف رمسيس / مطار القاهرة الدولي", lat: 30.0444, lng: 31.2357, category: "intercity" }
  ]
};
