import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase, ref, set, push, get, update, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
const $=id=>document.getElementById(id), app=initializeApp(firebaseConfig), auth=getAuth(app), db=getDatabase(app);
let stopTrips=null, sending=false;
const labels={PENDING:"نبحث عن سائق متاح لقبول طلبك",ACCEPTED:"تم قبول الرحلة — السائق في طريقه إليك",IN_PROGRESS:"رحلتك جارية",COMPLETED:"اكتملت الرحلة — شكرًا لاختيارك تاكسي العاصمة",CANCELLED:"تم إلغاء الرحلة"};
function listenTrips(uid){
 if(stopTrips)stopTrips();
 stopTrips=onValue(ref(db,"customer_trips/"+uid),snap=>{
  const root=$("rideStatus");root.replaceChildren();const list=[];
  snap.forEach(c=>list.push({id:c.key,...c.val()}));list.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  if(!list.length){root.textContent="لا توجد رحلات حتى الآن. ابدأ بطلب رحلتك الأولى.";return;}
  const t=list[0],title=document.createElement("strong"),detail=document.createElement("p"),state=document.createElement("span");
  title.textContent="آخر رحلة";detail.textContent=(t.fromName||t.from||"") +" ← "+(t.toName||t.to||"");
  state.className="state "+(t.status==="COMPLETED"?"done":t.status==="CANCELLED"?"muted":"");state.textContent=labels[t.status]||t.status||"حالة غير محددة";
  root.append(title,detail,state);
  if(t.driverName){const d=document.createElement("p");d.textContent="السائق: "+t.driverName;root.append(d);}
  if(t.status==="PENDING"){const b=document.createElement("button");b.className="secondary";b.textContent="إلغاء الطلب";b.onclick=()=>cancelTrip(t);root.append(b);}
 },e=>$("rideStatus").textContent="تعذر تحميل حالة الرحلة: "+e.message);
}
onAuthStateChanged(auth,async user=>{
 if(stopTrips){stopTrips();stopTrips=null;}
 $("authBox").hidden=!!user;$("bookingBox").hidden=!user;
 if(!user)return;
 try{const s=await get(ref(db,"customers/"+user.uid)),p=s.val()||{};$("welcome").textContent="أهلًا "+(p.name||user.email)+" — اكتب تفاصيل مشوارك.";listenTrips(user.uid);}
 catch(e){$("message").textContent="تعذر تحميل حسابك: "+e.message;}
});
$("signup").onclick=async()=>{
 try{const name=$("name").value.trim(),phone=$("phone").value.trim(),email=$("email").value.trim(),password=$("password").value;
 if(!name||!phone||!email||password.length<6)throw Error("أكمل الاسم والهاتف والبريد، واجعل كلمة المرور 6 أحرف على الأقل.");
 const c=await createUserWithEmailAndPassword(auth,email,password);
 await set(ref(db,"customers/"+c.user.uid),{name,phone,email:c.user.email,createdAt:Date.now()});
 $("message").textContent="تم إنشاء حسابك بنجاح.";
 }catch(e){$("message").textContent=e.message;}
};
$("login").onclick=async()=>{try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);$("message").textContent="تم تسجيل الدخول.";}catch(e){$("message").textContent="تعذر تسجيل الدخول: "+e.message;}};
$("logout").onclick=()=>signOut(auth);
$("requestRide").onclick=async()=>{
 const user=auth.currentUser,fromName=$("pickup").value.trim(),toName=$("destination").value.trim(),btn=$("requestRide");
 if(!user||!fromName||!toName){$("rideStatus").textContent="اكتب مكان الركوب والوجهة أولًا.";return;}
 if(sending)return;sending=true;btn.disabled=true;
 try{
  const profile=(await get(ref(db,"customers/"+user.uid))).val()||{},tripRef=push(ref(db,"trips")),id=tripRef.key,now=Date.now();
  const carType=$("carType").value,rideWhen=$("rideWhen").value,notes=$("notes").value.trim();
  const trip={clientId:user.uid,clientPhone:profile.phone||"",from:fromName,fromName,to:toName,toName,carType,rideWhen,notes,status:"PENDING",createdAt:now};
  const dispatch={tripId:id,clientId:user.uid,pickup:fromName,destination:toName,carType,createdAt:now,status:"PENDING"};
  // Create the main trip first so database rules can verify it before dispatch.
  await set(tripRef,trip);
  try {
   await set(ref(db,"customer_trips/"+user.uid+"/"+id),trip);
   await set(ref(db,"driver_requests/"+id),dispatch);
  } catch(dispatchError) {
   // If dispatch/history creation fails, mark the trip cancelled rather than leaving an undispatched pending request.
   await runTransaction(tripRef,cur=>cur&&cur.clientId===user.uid&&cur.status==="PENDING"?{...cur,status:"CANCELLED",cancelledAt:Date.now()}:cur);
   try { await set(ref(db,"customer_trips/"+user.uid+"/"+id+"/status"),"CANCELLED"); } catch (_) {}
   throw dispatchError;
  }
  $("pickup").value="";$("destination").value="";$("notes").value="";
  $("rideStatus").textContent="تم إرسال طلبك للسائقين المتاحين. سنعرض لك حالة القبول هنا.";
 }catch(e){$("rideStatus").textContent="لم يتم إرسال الطلب: "+e.message;}
 finally{sending=false;btn.disabled=false;}
};
async function cancelTrip(t){
 try{
  const result=await runTransaction(ref(db,"trips/"+t.id),cur=>{if(!cur||cur.clientId!==auth.currentUser?.uid||cur.status!=="PENDING")return;return {...cur,status:"CANCELLED",cancelledAt:Date.now()};});
  if(!result.committed)throw Error("لا يمكن إلغاء الرحلة بعد قبولها أو تغيير حالتها.");
  const updates={};updates["driver_requests/"+t.id]=null;updates["customer_trips/"+auth.currentUser.uid+"/"+t.id+"/status"]="CANCELLED";await update(ref(db),updates);
 }catch(e){$("message").textContent=e.message;}
}