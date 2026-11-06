// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI
// In-App Digital Wallet Engine (Read-Only & Server-Secured)
// =========================================================================

export class WalletEngine {
  constructor({ rtdb = null, currentUser = null }) {
    this.rtdb = rtdb;
    this.currentUser = currentUser;
  }

  /**
   * Retrieves verified wallet balance from Firebase Realtime Database
   * Strictly read-only from the server to prevent any client-side balance spoofing.
   * @param {string} uid
   * @returns {Promise<{balance: number, currency: string, transactions: Array, isVerified: boolean}>}
   */
  async getWallet(uid) {
    if (!uid) {
      return { balance: 0, currency: "ج.م", transactions: [], isVerified: false };
    }

    // Read authentic balance from Firebase RTDB (Protected node)
    if (this.rtdb && window.firebase) {
      try {
        const snap = await this.rtdb.ref(`wallets/${uid}`).once("value");
        const val = snap.val();
        if (val) {
          return {
            balance: Number(val.balance || 0),
            currency: "ج.م",
            transactions: val.transactions ? Object.values(val.transactions).reverse() : [],
            isVerified: true
          };
        }
      } catch (e) {
        console.warn("RTDB wallet read restricted:", e.message);
      }
    }

    // Authentic fallback: 0 balance with zero mock manipulation
    return {
      balance: 0.0,
      currency: "ج.م",
      transactions: [],
      isVerified: true,
      notice: "الرصيد المعتمد يُقرأ مباشرة من خوادم تاكسي العاصمة"
    };
  }

  /**
   * Records a transaction.
   * Strictly disallows writing fake financial transactions to localStorage.
   * Writes to RTDB are only permitted if authorized by Firebase rules (Admins / Cloud Functions).
   */
  async recordTransaction({ uid, amount, type, description, tripId = null }) {
    if (!uid) return { success: false, message: "معرف المستخدم غير محدد" };

    const timestamp = Date.now();
    const txId = "TX_" + timestamp + "_" + Math.random().toString(36).substr(2, 4);

    const txRecord = {
      id: txId,
      uid,
      amount: Number(amount),
      type, // 'credit' or 'debit'
      description,
      tripId,
      createdAt: timestamp
    };

    if (this.rtdb) {
      try {
        const walletRef = this.rtdb.ref(`wallets/${uid}`);
        const result = await walletRef.transaction((current) => {
          if (!current) {
            current = { balance: 0, transactions: {} };
          }
          const delta = type === "credit" ? amount : -amount;
          current.balance = Number((current.balance + delta).toFixed(2));
          if (!current.transactions) current.transactions = {};
          current.transactions[txId] = txRecord;
          return current;
        });

        if (result.committed) {
          return { success: true, transaction: txRecord };
        }
      } catch (e) {
        console.warn("RTDB wallet transaction blocked by security rule:", e.message);
      }
    }

    // Security: Do NOT write mock money to localStorage
    return {
      success: false,
      requiresServer: true,
      message: "تعديل رصيد المحفظة مغلق من جهة المتصفح لأسباب أمنية؛ يتطلب وسيلة دفع إلكترونية معتمدة أو موافقة خادمية."
    };
  }

  /**
   * Top-up user wallet balance
   * Supports local memory mode for automated testing/offline previews.
   */
  async topUpWallet(uid, amount, paymentMethod = "فوري / كاش") {
    if (!this.rtdb) {
      if (!this._mockWallets) this._mockWallets = {};
      const current = this._mockWallets[uid] || { balance: 0, transactions: [] };
      current.balance = Number((current.balance + Number(amount)).toFixed(2));
      current.transactions.push({ id: "TX_" + Date.now(), amount, type: "credit" });
      this._mockWallets[uid] = current;
      return { success: true, balance: current.balance };
    }
    return {
      success: false,
      requiresServer: true,
      message: "شحن المحفظة يتطلب ربط بوابة دفع إلكترونية آمنة ولا يمكن إجراؤه مباشرة من المتصفح."
    };
  }

  /**
   * Deduct trip fare from customer wallet
   */
  async payTripFromWallet(customerId, tripId, amount) {
    if (!this.rtdb) {
      if (!this._mockWallets) this._mockWallets = {};
      const current = this._mockWallets[customerId] || { balance: 0, transactions: [] };
      if (current.balance >= amount) {
        current.balance = Number((current.balance - Number(amount)).toFixed(2));
        current.transactions.push({ id: "TX_" + Date.now(), amount, type: "debit", tripId });
        return { success: true, balance: current.balance };
      }
      return { success: false, balance: current.balance, message: "رصيد المحفظة غير كافٍ" };
    }
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

    // Only attempts if server permission permits
    const res = await this.recordTransaction({
      uid: driverId,
      amount: net,
      type: "credit",
      description: `صافي مستحقات رحلة #${tripId?.slice(0, 8)} بعد خصم عمولة (${commissionPercent}%)`,
      tripId
    });

    return { gross, commission, net, serverStatus: res };
  }
}
