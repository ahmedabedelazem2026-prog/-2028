import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, query, where, orderBy, onSnapshot, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
const $=id=>document.getElementById(id), ready=firebaseConfig?.apiKey&&!firebaseConfig.apiKey.startsWith("YOUR_")&&firebaseConfig?.projectId&&!firebaseConfig.projectId.startsWith("YOUR_");
if(!ready){$("message").textContent="أضف إعدادات Firebase أولًا في firebase-config.js.";$("login").disabled=true;}
else{
 const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);let profile=null,stop=null;
 $("login").onclick=async()=>{try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);}catch(e){$("message").textContent="تعذر الدخول: "+e.message;}};
 $("logout").onclick=()=>signOut(auth);
 onAuthStateChanged(auth,async user=>{
  if(stop){stop();stop=null;}
  if(!user){$("driverLogin").hidden=false;$("driverPanel").hidden=true;return;}
  const snap=await getDoc(doc(db,"users",user.uid));profile=snap.data();
  if(!profile||profile.role!=="driver"){$("message").textContent="هذا الحساب غير مفعّل كسائق. راجع الإدارة." ;await signOut(auth);return;}
  $("driverLogin").hidden=true;$("driverPanel").hidden=false;
  $("driverWelcome").textContent="أهلًا "+(profile.name||"بالسائق")+".";
  $("toggleAvailable").textContent=profile.available?"إيقاف استقبال الرحلات":"تفعيل استقبال الرحلات";
  const q=query(collection(db,"rides"),where("status","==","pending"),orderBy("createdAt","desc"));
  stop=onSnapshot(q,s=>{const root=$("rides");root.replaceChildren();if(s.empty){root.textContent="لا توجد طلبات جديدة حاليًا.";return;}
   s.forEach(d=>{const v=d.data(),card=document.createElement("article");card.className="panel";card.style.margin="12px 0";const info=document.createElement("p");info.textContent="من: "+v.pickup+" — إلى: "+v.destination+" — العميل: "+(v.customerName||"");const btn=document.createElement("button");btn.textContent="قبول الرحلة";btn.onclick=()=>acceptRide(d.id,btn);card.append(info,btn);root.append(card);});
  },e=>$("message").textContent="خطأ في تحميل الطلبات: "+e.message);
 });
 $("toggleAvailable").onclick=async()=>{try{const next=!profile.available;await updateDoc(doc(db,"users",auth.currentUser.uid),{available:next});profile.available=next;$("toggleAvailable").textContent=next?"إيقاف استقبال الرحلات":"تفعيل استقبال الرحلات";$("message").textContent=next?"أصبحت متاحًا لاستقبال الرحلات.":"تم إيقاف استقبال الرحلات.";}catch(e){$("message").textContent="تعذر تحديث الحالة: "+e.message;}};
 async function acceptRide(id,btn){btn.disabled=true;try{await runTransaction(db,async tx=>{const rideRef=doc(db,"rides",id),driverRef=doc(db,"users",auth.currentUser.uid);const [r,d]=await Promise.all([tx.get(rideRef),tx.get(driverRef)]);if(!r.exists()||r.data().status!=="pending")throw new Error("سبق سائق آخر إلى قبول الرحلة.");if(!d.exists()||d.data().role!=="driver"||d.data().available!==true)throw new Error("يجب تفعيل التوفر أولًا.");tx.update(rideRef,{status:"accepted",driverId:auth.currentUser.uid,driverName:d.data().name||"",acceptedAt:serverTimestamp()});tx.update(driverRef,{available:false});});$("message").textContent="تم قبول الرحلة بنجاح.";}catch(e){$("message").textContent=e.message||"تعذر قبول الرحلة.";}finally{btn.disabled=false;}}
}