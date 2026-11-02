// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI
// Star Rating, Reviews, and Driver Quality Assurance Engine
// =========================================================================

export class RatingsEngine {
  constructor({ rtdb = null, firestore = null }) {
    this.rtdb = rtdb;
    this.firestore = firestore;
  }

  getReviewTags() {
    return [
      { id: "clean_car", label: "سيارة نظيفة ومعطرة ✨" },
      { id: "punctual", label: "التزام تام بالموعد ⏱️" },
      { id: "polite", label: "أخلاق عالية واحترام 🤝" },
      { id: "safe_driving", label: "قيادة هادئة وآمنة 🛡️" },
      { id: "great_route", label: "معرفة ممتازة بطرق العريش 🗺️" },
      { id: "air_conditioned", label: "تكييف ممتاز ومريح ❄️" }
    ];
  }

  /**
   * Submits a customer review for a driver
   */
  async submitReview({ tripId, customerId, customerName, driverId, rating, tags = [], comment = "" }) {
    if (!driverId || !rating) return false;
    const reviewId = "REV_" + Date.now();
    const reviewData = {
      id: reviewId,
      tripId,
      customerId: customerId || "guest",
      customerName: customerName || "عميل العاصمة",
      driverId,
      rating: Math.max(1, Math.min(5, Number(rating))),
      tags,
      comment: comment.trim(),
      createdAt: Date.now()
    };

    // 1. Record review in RTDB
    if (this.rtdb) {
      try {
        await this.rtdb.ref(`reviews/${reviewId}`).set(reviewData);

        // Recalculate Driver average rating
        const driverRef = this.rtdb.ref(`drivers/${driverId}`);
        await driverRef.transaction((driver) => {
          if (!driver) return driver;
          const currentRating = Number(driver.rating || 5.0);
          const totalTrips = Number(driver.totalTrips || 1);
          // Moving average formula
          const newRating = Number(((currentRating * totalTrips + reviewData.rating) / (totalTrips + 1)).toFixed(2));
          driver.rating = newRating;
          driver.totalTrips = totalTrips + 1;
          return driver;
        });
      } catch (e) {
        console.warn("RTDB rating update notice:", e);
      }
    }

    // 2. Mark trip as rated
    if (this.rtdb && tripId) {
      this.rtdb.ref(`trips/${tripId}/rating`).set(reviewData.rating).catch(() => {});
    }

    // 3. Local fallback
    try {
      const reviews = JSON.parse(localStorage.getItem("capital_taxi_reviews") || "[]");
      reviews.unshift(reviewData);
      localStorage.setItem("capital_taxi_reviews", JSON.stringify(reviews));
    } catch (e) {}

    return { success: true, review: reviewData };
  }
}
