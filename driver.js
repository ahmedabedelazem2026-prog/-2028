import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,createUserWithEmailAndPassword,signInWithEmailAndPassword,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getDatabase,ref,set,get,update,onValue,runTransaction,onDisconnect} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import {firebaseConfig} from "./firebase-config.js";
const $=id=>document.getElementById(id),app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
let profile=null,stopFeed=null,creatingDriver=false,gpsWatchId=null;
function stop(){if(stopFeed){stopFeed();stopFeed=null;}}
function stopGps(){if(gpsWatchId!==null){navigator.geolocation.clearWatch(gpsWatchId);gpsWatchId=null;}}
async function removeGps(){stopGps();if(auth.currentUser)await set(ref(db,"driver_locations/"+auth.currentUser.uid),null);}
function startGps(){
 if(!navigator.geolocation)throw Error("هذا الهاتف أو المتصفح لا يدعم تحديد الموقع.");
 if(!window.isSecureContext)throw Error("يجب فتح الموقع عبر HTTPS حتى يعمل GPS.");
 $("gpsStatus").textContent="جارٍ تحديد موقعك...";
 gpsWatchId=navigator.geolocation.watchPosition(async pos=>{
  try{const uid=auth.currentUser?.uid;if(!uid||!profile?.available||profile.approved!==true)return;
   const loc={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:Math.round(pos.coords.accuracy||0),updatedAt:Date.now()};
   await set(ref(db,"driver_locations/"+uid),loc);
   $("gpsStatus").textContent="● مشاركة الموقع مفعّلة — دقة تقريبية "+loc.accuracy+" متر";
  }catch(e){$("gpsStatus").textContent="تعذر إرسال الموقع: "+e.message;}
 },async err=>{$("gpsStatus").textContent=err.code===1?"لم تسمح بإذن الموقع. فعّله من إعدادات المتصفح.":"تعذر تحديد الموقع؛ تحقق من GPS وإعدادات الهاتف.";try{profile.available=false;await update(ref(db,"drivers/"+auth.currentUser.uid),{available:false});await set(ref(db,"driver_locations/"+auth.currentUser.uid),null);stopGps();showAvailability();}catch(_){}},
 {enableHighAccuracy:true,maximumAge:5000,timeout:20000});
 onDisconnect(ref(db,"driver_locations/"+auth.currentUser.uid)).remove();
}
function showAvailability(){ $("availabilityBadge").textContent=profile?.available?"● متاح لاستقبال الطلبات":"غير متاح";$("toggleAvailable").textContent=profile?.available?"إيقاف استقبال الرحلات":"تفعيل استقبال الرحلات";}
function feed(){
 stop();stopFeed=onValue(ref(db,"driver_requests"),snap=>{
  const root=$("rides");root.replaceChildren();
  if(!snap.exists()){root.textContent="لا توجد طلبات جديدة الآن.";return;}
  snap.forEach(c=>{const t=c.val(),card=document.createElement("article");card.className="ride-card";
   const p=document.createElement("p");p.textContent="من: "+(t.pickup||"")+" — إلى: "+(t.destination||"");
   const meta=document.createElement("small");meta.textContent="نوع السيارة: "+(t.carType||"اقتصادي");
   const b=document.createElement("button");b.textContent="قبول الرحلة";b.onclick=()=>accept(c.key,b);card.append(p,meta,b);root.append(card);
  });
 },e=>$("message").textContent="تعذر تحميل الطلبات: "+e.message);
}
$("signupDriver").onclick=async()=>{
 try{const name=$("driverName").value.trim(),phone=$("driverPhone").value.trim(),email=$("email").value.trim(),password=$("password").value;
 if(!name||!phone||!email||password.length<6)throw Error("أكمل الاسم والهاتف والبريد وكلمة المرور (6 أحرف على الأقل).");
 creatingDriver=true;const c=await createUserWithEmailAndPassword(auth,email,password);
 await set(ref(db,"drivers/"+c.user.uid),{name,phone,email:c.user.email,role:"driver",approved:false,available:false,createdAt:Date.now()});
 creatingDriver=false;$("message").textContent="وصل طلب انضمامك. انتظر اعتماد الإدارة قبل استقبال الرحلات.";await signOut(auth);
 }catch(e){creatingDriver=false;$("message").textContent=e.message;}
};
$("login").onclick=async()=>{try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);}catch(e){$("message").textContent="تعذر الدخول: "+e.message;}};
$("logout").onclick=async()=>{try{await update(ref(db,"drivers/"+auth.currentUser.uid),{available:false});profile.available=false;await removeGps();await signOut(auth);}catch(e){$("message").textContent=e.message;}};
onAuthStateChanged(auth,async user=>{
 if(creatingDriver)return;stop();if(!user){$("driverLogin").hidden=false;$("driverPanel").hidden=true;return;}
 try{
  const s=await get(ref(db,"drivers/"+user.uid));profile=s.val();
  if(!profile){$("message").textContent="لا يوجد ملف سائق لهذا الحساب.";await signOut(auth);return;}
  if(profile.approved!==true){$("message").textContent="طلبك قيد مراجعة الإدارة ولم تتم الموافقة عليه بعد.";await signOut(auth);return;}
  $("driverLogin").hidden=true;$("driverPanel").hidden=false;$("driverWelcome").textContent="مرحبًا "+(profile.name||"بالسائق")+" — بيانات العميل لا تظهر إلا بعد قبول الرحلة.";
  showAvailability();if(profile.available){feed();startGps();}else{$("rides").textContent="فعّل استقبال الرحلات لعرض الطلبات.";$("gpsStatus").textContent="الموقع غير مشارك.";}
  await loadActiveRide(user.uid);
 }catch(e){$("message").textContent="تعذر تحميل ملف السائق: "+e.message;}
});
async function loadActiveRide(uid){
 const s=await get(ref(db,"driver_active/"+uid));let active=null;
 if(s.exists()){const v=s.val();const key=Object.keys(v)[0];if(key)active={id:key,...v[key]};}
 const root=$("activeRide");root.replaceChildren();
 if(!active){root.textContent="لا توجد رحلة نشطة.";return;}
 const p=document.createElement("p");p.textContent=(active.fromName||active.from)+" ← "+(active.toName||active.to);
 const phone=document.createElement("p");phone.textContent="هاتف العميل: "+(active.clientPhone||"غير مسجل");
 const b=document.createElement("button");b.textContent=active.status==="ACCEPTED"?"بدء الرحلة":"إنهاء الرحلة";b.onclick=()=>advance(active,b);
 root.append(p,phone,b);
}
async function accept(id,btn){
 btn.disabled=true;
 try{
  const result=await runTransaction(ref(db,"trips/"+id),cur=>{
   if(cur===null)return {__transactionProbe:true};
   if(cur.status!=="PENDING")return;
   return {...cur,status:"ACCEPTED",driverId:auth.currentUser.uid,driverName:profile.name||"",acceptedAt:Date.now()};
  });
  if(!result.committed)throw Error("سبق سائق آخر إلى قبول هذه الرحلة.");
  const t=result.snapshot.val(),updates={};updates["customer_trips/"+t.clientId+"/"+id+"/status"]="ACCEPTED";updates["customer_trips/"+t.clientId+"/"+id+"/driverName"]=profile.name||"";updates["customer_trips/"+t.clientId+"/"+id+"/driverId"]=auth.currentUser.uid;updates["customer_trips/"+t.clientId+"/"+id+"/acceptedAt"]=Date.now();updates["driver_requests/"+id]=null;updates["driver_active/"+auth.currentUser.uid+"/"+id]={fromName:t.fromName||t.from,toName:t.toName||t.to,clientPhone:t.clientPhone||"",clientId:t.clientId,status:"ACCEPTED",createdAt:t.createdAt||Date.now(),acceptedAt:Date.now()};updates["drivers/"+auth.currentUser.uid+"/available"]=false;updates["driver_locations/"+auth.currentUser.uid]=null;
  await update(ref(db),updates);profile.available=false;showAvailability();stop();$("rides").textContent="تم قبول الرحلة. راجع تفاصيلها في قسم رحلتي الحالية.";await loadActiveRide(auth.currentUser.uid);
 }catch(e){$("message").textContent=e.message||"تعذر قبول الرحلة.";}finally{btn.disabled=false;}
}
async function advance(t,btn){
 btn.disabled=true;const next=t.status==="ACCEPTED"?"IN_PROGRESS":"COMPLETED";
 try{
  const r=await runTransaction(ref(db,"trips/"+t.id),cur=>{if(cur===null)return {__transactionProbe:true};if(cur.driverId!==auth.currentUser.uid||cur.status!==t.status)return;return {...cur,status:next,[next.toLowerCase()+"At"]:Date.now()};});
  if(!r.committed)throw Error("تغيرت حالة الرحلة. حدّث الصفحة.");
  const changes={["customer_trips/"+t.clientId+"/"+t.id+"/status"]:next,["customer_trips/"+t.clientId+"/"+t.id+"/updatedAt"]:Date.now(),["driver_active/"+auth.currentUser.uid+"/"+t.id+"/status"]:next};
  if(next==="COMPLETED"){changes["driver_active/"+auth.currentUser.uid+"/"+t.id]=null;changes["drivers/"+auth.currentUser.uid+"/available"]=false;changes["driver_locations/"+auth.currentUser.uid]=null;profile.available=false;stopGps();showAvailability();$("gpsStatus").textContent="توقف التتبع بانتهاء الرحلة.";}
  await update(ref(db),changes);
  await loadActiveRide(auth.currentUser.uid);$("message").textContent=next==="COMPLETED"?"تم إنهاء الرحلة بنجاح.":"تم بدء الرحلة.";
 }catch(e){$("message").textContent=e.message;}finally{btn.disabled=false;}
}
$("toggleAvailable").onclick=async()=>{
 try{if(!profile.available){const s=await get(ref(db,"driver_active/"+auth.currentUser.uid));let busy=false;s.forEach(c=>{if(["ACCEPTED","IN_PROGRESS"].includes(c.val()?.status))busy=true;});if(busy)throw Error("لديك رحلة نشطة؛ أنهها أولًا.");}
 const next=!profile.available;if(next&&!navigator.geolocation)throw Error("GPS غير مدعوم في هذا المتصفح.");await update(ref(db,"drivers/"+auth.currentUser.uid),{available:next});profile.available=next;showAvailability();if(next){feed();try{startGps();}catch(gpsError){profile.available=false;await update(ref(db,"drivers/"+auth.currentUser.uid),{available:false});showAvailability();throw gpsError;}}else{stop();await removeGps();$("rides").textContent="تم إيقاف استقبال الرحلات.";$("gpsStatus").textContent="تم إيقاف مشاركة الموقع.";}
 }catch(e){$("message").textContent=e.message;}
};