import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase, ref, set, push, get, query, orderByChild, equalTo, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const msg = $("message"), statusBox = $("rideStatus");
const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getDatabase(app);
let stopTrips = null;

function showTrips(uid) {
  if (stopTrips) stopTrips();
  const q = query(ref(db, "trips"), orderByChild("clientId"), equalTo(uid));
  stopTrips = onValue(q, snap => {
    const trips = [];
    snap.forEach(child => trips.push({ id: child.key, ...child.val() }));
    trips.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
    const latest = trips[0];
    if (!latest) { statusBox.textContent = "لا توجد رحلات سابقة."; return; }
    const labels = { PENDING:"بانتظار قبول سائق", ACCEPTED:"تم قبول الرحلة", IN_PROGRESS:"الرحلة جارية", COMPLETED:"اكتملت الرحلة", CANCELLED:"أُلغيت الرحلة" };
    statusBox.textContent = "حالة آخر طلب: " + (labels[latest.status] || latest.status || "غير محددة");
  }, e => statusBox.textContent = "تعذر تحميل الرحلات: " + e.message);
}
onAuthStateChanged(auth, async user => {
  if (stopTrips) { stopTrips(); stopTrips = null; }
  $("authBox").hidden = !user; $("bookingBox").hidden = !user;
  if (!user) return;
  const profileRef = ref(db, "customers/" + user.uid);
  const profileSnap = await get(profileRef);
  const p = profileSnap.val() || {};
  $("welcome").textContent = "أهلًا " + (p.name || user.email || "بك") + " — يمكنك طلب رحلة الآن.";
  showTrips(user.uid);
});
$("signup").onclick = async () => {
  try {
    const name=$("name").value.trim(), phone=$("phone").value.trim(), email=$("email").value.trim(), password=$("password").value;
    if (!name || !phone || !email || password.length < 6) throw new Error("اكتب الاسم ورقم الهاتف والبريد وكلمة مرور من 6 أحرف على الأقل.");
    const c=await createUserWithEmailAndPassword(auth,email,password);
    await set(ref(db,"customers/"+c.user.uid),{name,phone,email:c.user.email,createdAt:Date.now()});
    msg.textContent="تم إنشاء حساب العميل.";
  } catch(e) { msg.textContent=e.message; }
};
$("login").onclick = async () => {
  try { await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value); msg.textContent="تم تسجيل الدخول."; }
  catch(e) { msg.textContent="تعذر تسجيل الدخول: "+e.message; }
};
$("logout").onclick = () => signOut(auth);
$("requestRide").onclick = async () => {
  const user=auth.currentUser, fromName=$("pickup").value.trim(), toName=$("destination").value.trim();
  if (!user || !fromName || !toName) { statusBox.textContent="اكتب مكان الركوب والوجهة أولًا."; return; }
  const btn=$("requestRide"); btn.disabled=true;
  try {
    const pSnap=await get(ref(db,"customers/"+user.uid));
    const profile=pSnap.val() || {};
    const tripRef=push(ref(db,"trips"));
    // Legacy-compatible names and status. Coordinates and fare are intentionally not fabricated.
    await set(tripRef,{
      clientId:user.uid, clientPhone:profile.phone || "",
      from:fromName, fromName, to:toName, toName,
      carType:"economy", status:"PENDING", createdAt:Date.now()
    });
    $("pickup").value=""; $("destination").value=""; $("notes").value="";
    statusBox.textContent="تم إرسال الطلب للسائقين. انتظر قبول أحدهم.";
  } catch(e) { statusBox.textContent="لم يتم إرسال الطلب: "+e.message; }
  finally { btn.disabled=false; }
};