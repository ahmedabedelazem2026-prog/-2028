// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI
// Dynamic & Configurable Pricing Engine
// =========================================================================

export const DEFAULT_PRICING_CONFIG = {
  // Base rates inside Al-Arish (Egyptian Pounds - EGP)
  baseFare: 15.0,             // فتح العداد
  perKmRate: 6.5,             // سعر الكيلومتر
  minFare: 25.0,              // الحد الأدنى للرحلة
  waitingRatePerMin: 1.5,      // رسوم الانتظار بالدقيقة
  nightSurchargeMultiplier: 1.15, // زيادة الفترة الليلية (12 ص حتى 6 ص)

  // Al-Arish High Demand / Surge Pricing Zones (Uber-Grade Dynamic Multiplier)
  surgeZones: {
    "downtown": { name: "وسط البلد وميدان النصر", multiplier: 1.25, active: true },
    "sinai_univ": { name: "جامعة سيناء والمساعيد", multiplier: 1.35, active: true },
    "arish_univ": { name: "جامعة العريش وضاحية السلام", multiplier: 1.30, active: true },
    "corniche": { name: "ساحل البحر والكورنيش", multiplier: 1.20, active: true }
  },

  // Out of Arish / Highway surcharge
  outOfCityFlatFee: 40.0,     // رسوم إضافية للرحلات خارج نطاق المدينة
  commissionRate: 10.0,       // نسبة عمولة المنصة (10%)

  // Car categories multiplier
  carCategories: {
    economy: {
      id: "economy",
      nameAr: "تاكسي اقتصادي",
      nameEn: "Economy",
      descAr: "سيارة سيدان مريحة ومكيفة لمشاوير المدينة السريعة",
      capacity: 4,
      multiplier: 1.0,
      icon: "🚕"
    },
    comfort: {
      id: "comfort",
      nameAr: "تاكسي كمفورت (مريح)",
      nameEn: "Comfort",
      descAr: "سيارات أحدث بمساحة أوسع لراحة مضاعفة",
      capacity: 4,
      multiplier: 1.25,
      icon: "🚗"
    },
    vip: {
      id: "vip",
      nameAr: "تاكسي العاصمة VIP",
      nameEn: "VIP Luxury",
      descAr: "سيارات فارهة مجهزة لرجال الأعمال والرحلات الخاصة",
      capacity: 4,
      multiplier: 1.6,
      icon: "✨"
    },
    family: {
      id: "family",
      nameAr: "عائلي (7 ركاب)",
      nameEn: "Family Van",
      descAr: "سيارات فان عائلية تتسع لـ 6-7 ركاب مع حقائب السفر",
      capacity: 7,
      multiplier: 1.5,
      icon: "🚐"
    }
  },

  // Fixed/Intercity trip presets between Al-Arish and other destinations
  intercityPresets: {
    "sheikh_zuwayed": { name: "الشيخ زويد", basePrice: 200, estKm: 35 },
    "rafah": { name: "رفح المصرية", basePrice: 300, estKm: 50 },
    "bir_al_abd": { name: "بئر العبد", basePrice: 450, estKm: 90 },
    "qantara": { name: "القنطرة شرق", basePrice: 750, estKm: 160 },
    "ismailia": { name: "مدينة الإسماعيلية", basePrice: 900, estKm: 190 },
    "cairo": { name: "القاهرة (موقف رمسيس / المطار)", basePrice: 1800, estKm: 320 }
  },

  // Active coupon discount codes
  coupons: {
    "CAPITAL10": { discountPercent: 10, maxDiscount: 30, active: true },
    "ARISH2026": { discountPercent: 15, maxDiscount: 40, active: true },
    "SINAI20": { discountPercent: 20, maxDiscount: 50, active: true },
    "STUDENT": { discountPercent: 15, maxDiscount: 25, active: true }
  }
};

export class PricingEngine {
  constructor(customConfig = null) {
    this.config = customConfig || JSON.parse(JSON.stringify(DEFAULT_PRICING_CONFIG));
    this.loadFromStorage();
  }

  loadFromStorage() {
    try {
      const saved = localStorage.getItem("capital_taxi_pricing_config");
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn("Could not load pricing config from localStorage", e);
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem("capital_taxi_pricing_config", JSON.stringify(this.config));
    } catch (e) {
      console.warn("Could not save pricing config to localStorage", e);
    }
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.saveToStorage();
  }

  getConfig() {
    return this.config;
  }

  /**
   * Calculates trip fare dynamically based on distance, duration, car type, and coupon
   * @param {number} distanceKm - Estimated distance in kilometers
   * @param {number} durationMin - Estimated duration in minutes
   * @param {string} carType - Category key (economy, comfort, vip, family)
   * @param {string} couponCode - Optional coupon code
   * @param {boolean} isOutOfCity - Flag if trip extends out of Al-Arish
   * @param {number} waitingMinutes - Waiting time in minutes
   * @returns {object} Detailed breakdown and total price
   */
  calculateFare({
    distanceKm = 1.0,
    durationMin = 5.0,
    carType = "economy",
    couponCode = "",
    isOutOfCity = false,
    waitingMinutes = 0,
    surgeMultiplier = 1.0,
    tipAmount = 0
  }) {
    const dKm = Math.max(0.2, Number(distanceKm) || 1.0);
    const dMin = Math.max(1, Number(durationMin) || 5.0);
    const waitMin = Math.max(0, Number(waitingMinutes) || 0);
    const tip = Math.max(0, Number(tipAmount) || 0);
    const surge = Math.max(1.0, Number(surgeMultiplier) || 1.0);

    const category = this.config.carCategories[carType] || this.config.carCategories.economy;
    const multiplier = (category.multiplier || 1.0) * surge;

    // Base fare + distance cost
    let distanceCost = dKm * this.config.perKmRate;
    let baseSum = this.config.baseFare + distanceCost;

    // Apply minimum fare before car multiplier
    if (baseSum < this.config.minFare) {
      baseSum = this.config.minFare;
    }

    // Apply car category multiplier
    let subtotal = baseSum * multiplier;

    // Waiting fees
    const waitingFee = waitMin * this.config.waitingRatePerMin;
    subtotal += waitingFee;

    // Out of city extra fee
    const outOfCityFee = isOutOfCity ? this.config.outOfCityFlatFee : 0;
    subtotal += outOfCityFee;

    // Check night surcharge (between 12:00 AM and 05:59 AM)
    const currentHour = new Date().getHours();
    const isNight = currentHour >= 0 && currentHour < 6;
    let nightExtra = 0;
    if (isNight && this.config.nightSurchargeMultiplier > 1.0) {
      nightExtra = subtotal * (this.config.nightSurchargeMultiplier - 1.0);
      subtotal += nightExtra;
    }

    // Apply coupon discount
    let discountAmount = 0;
    let couponApplied = null;
    if (couponCode && typeof couponCode === "string") {
      const codeClean = couponCode.trim().toUpperCase();
      const coupon = this.config.coupons[codeClean];
      if (coupon && coupon.active) {
        discountAmount = (subtotal * coupon.discountPercent) / 100;
        if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
          discountAmount = coupon.maxDiscount;
        }
        couponApplied = {
          code: codeClean,
          percent: coupon.discountPercent,
          amount: Math.round(discountAmount)
        };
      }
    }

    const finalRideFare = Math.max(this.config.minFare, Math.round(subtotal - discountAmount));
    const totalWithTip = finalRideFare + tip;

    return {
      distanceKm: Number(dKm.toFixed(2)),
      durationMin: Math.round(dMin),
      carType,
      carTypeName: category.nameAr,
      baseFare: this.config.baseFare,
      distanceCost: Math.round(distanceCost),
      waitingFee: Math.round(waitingFee),
      outOfCityFee: Math.round(outOfCityFee),
      nightExtra: Math.round(nightExtra),
      surgeMultiplier: surge,
      isNight,
      discountAmount: Math.round(discountAmount),
      couponApplied,
      subtotal: Math.round(subtotal),
      rideFare: finalRideFare,
      tipAmount: tip,
      totalFare: totalWithTip,
      currency: "ج.م"
    };
  }

  /**
   * Helper to get intercity preset if chosen
   */
  getIntercityPreset(destinationId) {
    return this.config.intercityPresets[destinationId] || null;
  }
}
