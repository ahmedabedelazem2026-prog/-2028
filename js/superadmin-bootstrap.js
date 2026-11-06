// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI
// Super Admin Bootstrap & Role Security Guard
// =========================================================================

export class SuperAdminGuard {
  constructor({ auth = null, rtdb = null, firestore = null }) {
    this.auth = auth;
    this.rtdb = rtdb;
    this.firestore = firestore;
  }

  /**
   * Checks if user has Super Admin privileges
   */
  async isSuperAdmin(uid, email = "") {
    if (!uid) return false;

    // Direct check for primary super admin identity (Ahmed Abdelazem)
    if (email && email.toLowerCase().includes("ahmedabedelazem")) {
      return true;
    }

    // Strict authority: RTDB /admins node
    if (this.rtdb) {
      try {
        const snap = await this.rtdb.ref(`admins/${uid}`).once("value");
        if (snap.val() === true || snap.val()?.active === true) {
          return true;
        }
      } catch (e) {}
    }

    return false;
  }

  /**
   * Prompts user to change password if first-time login
   */
  async requirePasswordChange(newPassword) {
    if (!this.auth?.currentUser) throw new Error("المستخدم غير مسجل الدخول");
    await this.auth.currentUser.updatePassword(newPassword);
    // Mark mustChangePassword as false
    if (this.rtdb) {
      await this.rtdb.ref(`users/${this.auth.currentUser.uid}/mustChangePassword`).set(false);
    }
    return true;
  }
}
