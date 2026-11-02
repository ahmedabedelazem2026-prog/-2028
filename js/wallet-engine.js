// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI
// In-App Digital Wallet & Transaction Engine
// =========================================================================

export class WalletEngine {
  constructor({ rtdb = null, currentUser = null }) {
    this.rtdb = rtdb;
    this.currentUser = currentUser;
  }

  /**
   * Retrieves or initializes wallet balance for a user
   * @param {string} uid
   * @returns {Promise<{balance: number, currency: string, transactions: Array}>}
   */
  async getWallet(uid) {
    if (!uid) return { balance: 0, currency: "ج.م", transactions: [] };

    // Try RTDB
    if (this.rtdb && window.firebase) {
      try {
        const snap = await this.rtdb.ref(`wallets/${uid}`).once("value");
        const val = snap.val();
        if (val) {
          return {
            balance: Number(val.balance || 0),
            currency: "ج.م",
            transactions: val.transactions ? Object.values(val.transactions) : []
          };
        }
      } catch (e) {
        console.warn("RTDB wallet read error:", e);
      }
    }

    // Local fallback
    try {
      const wallets = JSON.parse(localStorage.getItem("capital_taxi_wallets") || "{}");
      return wallets[uid] || { balance: 150.0, currency: "ج.م", transactions: [] };
    } catch (e) {
      return { balance: 0, currency: "ج.م", transactions: [] };
    }
  }

  /**
   * Records a transaction (deposit, trip_payment, driver_earnings, commission_deduction)
   */
  async recordTransaction({ uid, amount, type, description, tripId = null }) {
    if (!uid) return false;
    const timestamp = Date.now();
    const txId = "TX_" + timestamp + "_" + Math.random().toString(36).substr(2, 4);

    const txRecord = {
      id: txId,
      uid,
      amount: Number(amount),
      type, // 'credit' (add) or 'debit' (subtract)
      description,
      tripId,
      createdAt: timestamp
    };

    if (this.rtdb) {
      try {
        const walletRef = this.rtdb.ref(`wallets/${uid}`);
        await walletRef.transaction((current) => {
          if (!current) {
            current = { balance: 0, transactions: {} };
          }
          const delta = type === "credit" ? amount : -amount;
          current.balance = Number((current.balance + delta).toFixed(2));
          if (!current.transactions) current.transactions = {};
          current.transactions[txId] = txRecord;
          return current;
        });
        return { success: true, transaction: txRecord };
      } catch (e) {
        console.warn("RTDB wallet transaction error:", e);
      }
    }

    // Local storage fallback
    try {
      const wallets = JSON.parse(localStorage.getItem("capital_taxi_wallets") || "{}");
      if (!wallets[uid]) wallets[uid] = { balance: 0, transactions: [] };
      const delta = type === "credit" ? amount : -amount;
      wallets[uid].balance = Math.max(0, Number((wallets[uid].balance + delta).toFixed(2)));
      wallets[uid].transactions.unshift(txRecord);
      localStorage.setItem("capital_taxi_wallets", JSON.stringify(wallets));
      return { success: true, transaction: txRecord, balance: wallets[uid].balance };
    } catch (e) {
      return { success: false };
    }
  }

  /**
   * Top-up user wallet balance
   */
  async topUpWallet(uid, amount, paymentMethod = "فوري / كاش") {
    return this.recordTransaction({
      uid,
      amount: Number(amount),
      type: "credit",
      description: `شحن رصيد محفظة عبر ${paymentMethod}`
    });
  }

  /**
   * Deduct trip fare from customer wallet
   */
  async payTripFromWallet(customerId, tripId, amount) {
    return this.recordTransaction({
      uid: customerId,
      amount: Number(amount),
      type: "debit",
      description: `سداد تكلفة رحلة #${tripId?.slice(0, 8)}`,
      tripId
    });
  }

  /**
   * Credit driver for completed trip (and deduct 10% platform commission)
   */
  async creditDriverTrip(driverId, tripId, grossFare, commissionPercent = 10) {
    const gross = Number(grossFare);
    const commission = (gross * commissionPercent) / 100;
    const net = gross - commission;

    // Credit full fare
    await this.recordTransaction({
      uid: driverId,
      amount: gross,
      type: "credit",
      description: `مستحقات رحلة #${tripId?.slice(0, 8)}`,
      tripId
    });

    // Deduct platform commission
    await this.recordTransaction({
      uid: driverId,
      amount: commission,
      type: "debit",
      description: `عمولة المنصة (${commissionPercent}%) عن رحلة #${tripId?.slice(0, 8)}`,
      tripId
    });

    return { gross, commission, net };
  }
}
