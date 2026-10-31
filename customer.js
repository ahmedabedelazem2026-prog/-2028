import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, addDoc, collection, serverTimestamp,
  query, where, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const message = $("message");
const bookingBox = $("bookingBox");
const authBox = $("authBox");
const rideStatus = $("rideStatus");

const ready = firebaseConfig?.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_") &&
  firebaseConfig?.projectId && !firebaseConfig.projectId.startsWith("YOUR_");

if (!ready) {
  message.textContent = "أضف بيانات Firebase الصحيحة في firebase-config.js أولًا.";
  ["signup","login","requestRide"].forEach(id => { if ($(id)) $(id).disabled = true; });
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  let stopRideListener = null;

  $("signup").addEventListener("click", async () => {
    try {
      const name = $("name").value.trim();
      const phone = $("phone").value.trim();
      const email = $("email").value.trim();
      const password = $("password").value;
      if (!name || !phone || !email || password.length < 6) {
        message.textContent = "اكتب الاسم والهاتف والبريد وكلمة مرور من 6 أحرف على الأقل.";
        return;
      }
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", credential.user.uid), {
        name, phone, role: "customer", available: false, createdAt: serverTimestamp()
      });
      message.textContent = "تم إنشاء الحساب.";
      await loadCustomer(credential.user);
    } catch (error) { message.textContent = error.message; }
  });

  $("login").addEventListener("click", async () => {
    try {
      await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
      message.textContent = "تم تسجيل الدخول.";
    } catch (error) { message.textContent = "تعذر تسجيل الدخول: " + error.message; }
  });

  $("logout").addEventListener("click", () => signOut(auth));

  async function loadCustomer(user) {
    if (stopRideListener) { stopRideListener(); stopRideListener = null; }
    if (!user) { authBox.hidden = false; bookingBox.hidden = true; return; }
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    if (!profileSnap.exists()) { message.textContent = "جارٍ تجهيز بيانات الحساب..."; return; }
    const profile = profileSnap.data();
    if (profile.role !== "customer") {
      message.textContent = "هذا الحساب ليس حساب عميل.";
      await signOut(auth); return;
    }
    authBox.hidden = true; bookingBox.hidden = false;
    $("welcome").textContent = "أهلًا " + (profile.name || "بك") + " — يمكنك طلب رحلة الآن.";
    const q = query(collection(db, "rides"), where("customerId", "==", user.uid), orderBy("createdAt", "desc"), limit(5));
    stopRideListener = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) { rideStatus.textContent = "لا توجد طلبات سابقة."; return; }
      const latest = snapshot.docs[0].data();
      const labels = { pending: "بانتظار قبول سائق", accepted: "تم قبول الرحلة", in_progress: "الرحلة جارية", completed: "اكتملت الرحلة", cancelled: "أُلغيت الرحلة" };
      rideStatus.textContent = "حالة آخر طلب: " + (labels[latest.status] || latest.status);
    }, (error) => { rideStatus.textContent = "تعذر تحديث حالة الطلب: " + error.message; });
  }

  onAuthStateChanged(auth, (user) => { loadCustomer(user).catch(error => { message.textContent = error.message; }); });

  $("requestRide").addEventListener("click", async () => {
    const user = auth.currentUser;
    const pickup = $("pickup").value.trim();
    const destination = $("destination").value.trim();
    if (!user || !pickup || !destination) {
      rideStatus.textContent = "اكتب مكان الركوب والوجهة أولًا."; return;
    }
    $("requestRide").disabled = true;
    try {
      const profileSnap = await getDoc(doc(db, "users", user.uid));
      const profile = profileSnap.data() || {};
      await addDoc(collection(db, "rides"), {
        customerId: user.uid,
        customerName: profile.name || "",
        phone: profile.phone || "",
        pickup, destination,
        notes: $("notes").value.trim(),
        status: "pending",
        driverId: null,
        createdAt: serverTimestamp()
      });
      $("pickup").value = ""; $("destination").value = ""; $("notes").value = "";
      rideStatus.textContent = "تم إرسال طلبك بنجاح. انتظر قبول أحد السائقين.";
    } catch (error) {
      rideStatus.textContent = "لم يتم إرسال الطلب: " + error.message;
    } finally { $("requestRide").disabled = false; }
  });
}