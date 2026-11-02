// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI
// Real-time In-App Trip Chat & Passenger-Driver Messaging
// =========================================================================

export class ChatEngine {
  constructor({ rtdb = null, currentUser = null }) {
    this.rtdb = rtdb;
    this.currentUser = currentUser;
    this.activeListener = null;
    this.currentTripId = null;
  }

  /**
   * Quick canned replies for fast tapping while driving or waiting
   */
  getQuickReplies(role = "driver") {
    if (role === "driver") {
      return [
        "أنا في الطريق إليك الآن 🚗",
        "وصلت لنقطة الالتقاء بالخارج 📍",
        "دقيقتان وأكون أمامك بإذن الله ⏱️",
        "سيارتي تاكسي العاصمة كود 1 🚖",
        "تمام، في انتظارك بكل سرور 👍"
      ];
    } else {
      return [
        "أنا في الانتظار بالخارج 📍",
        "ثوانٍ وأكون عندك 👍",
        "معي حقائب سفر 🧳",
        "أنا بجوار مدخل العمارة 🏢",
        "شكراً لك كابتن 🙏"
      ];
    }
  }

  /**
   * Listen for messages on an active trip
   */
  listenToTripChat(tripId, onMessagesReceived) {
    if (!tripId) return;
    this.currentTripId = tripId;

    if (this.rtdb) {
      if (this.activeListener) {
        this.rtdb.ref(`trips/${this.currentTripId}/chat`).off();
      }
      this.activeListener = this.rtdb.ref(`trips/${tripId}/chat`).on("value", (snap) => {
        const val = snap.val() || {};
        const messages = Object.values(val).sort((a, b) => a.timestamp - b.timestamp);
        if (typeof onMessagesReceived === "function") {
          onMessagesReceived(messages);
        }
      });
    } else {
      // Local fallback
      const chats = JSON.parse(localStorage.getItem(`capital_chat_${tripId}`) || "[]");
      if (typeof onMessagesReceived === "function") {
        onMessagesReceived(chats);
      }
    }
  }

  /**
   * Send a message
   */
  async sendMessage({ tripId, senderId, senderName, senderRole, text }) {
    if (!tripId || !text?.trim()) return false;
    const msgId = "MSG_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4);

    const message = {
      id: msgId,
      senderId: senderId || this.currentUser?.uid || "anon",
      senderName: senderName || (senderRole === "driver" ? "كابتن العاصمة" : "العميل"),
      senderRole, // "customer" or "driver"
      text: text.trim(),
      timestamp: Date.now()
    };

    if (this.rtdb) {
      try {
        await this.rtdb.ref(`trips/${tripId}/chat/${msgId}`).set(message);
        return { success: true, message };
      } catch (e) {
        console.warn("RTDB chat send warning:", e);
      }
    }

    // Local fallback
    try {
      const key = `capital_chat_${tripId}`;
      const chats = JSON.parse(localStorage.getItem(key) || "[]");
      chats.push(message);
      localStorage.setItem(key, JSON.stringify(chats));
      return { success: true, message };
    } catch (e) {
      return { success: false };
    }
  }

  stopListening() {
    if (this.rtdb && this.currentTripId) {
      this.rtdb.ref(`trips/${this.currentTripId}/chat`).off();
    }
    this.activeListener = null;
    this.currentTripId = null;
  }
}
