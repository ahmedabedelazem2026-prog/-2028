import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import{getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import{getDatabase,ref,get,update,onValue}from"https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import{firebaseConfig}from"./firebase-config.js";
const $=id=>document.getElementById(id),app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);let stops=[],allTrips=[];
$("login").onclick=async()=>{try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);}catch(e){$("message").textContent="تعذر الدخول: "+e.message;}};
$("logout").onclick=()=>signOut(auth);$("tripSearch").oninput=renderTrips;
onAuthStateChanged(auth,async user=>{
 stops.forEach(f=>f());stops=[];if(!user){$("adminLogin").hidden=false;$("adminPanel").hidden=true;return;}
 try{const a=await get(ref(db,"admins/"+user.uid));if(a.val()?.active!==true){$("message").textContent="هذا الحساب غير مفعّل كإدارة. فعّل admins/"+user.uid+" من Firebase بعد التأكد من هويتك.";await signOut(auth);return;}
 $("adminLogin").hidden=true;$("adminPanel").hidden=false;
 stops.push(onValue(ref(db,"drivers"),s=>renderDrivers(s),e=>$("message").textContent=e.message));
 stops.push(onValue(ref(db,"trips"),s=>{allTrips=[];s.forEach(c=>allTrips.push({id:c.key,...c.val()}));allTrips.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));updateStats();renderTrips();},e=>$("message").textContent=e.message));
 }catch(e){$("message").textContent=e.message;}
});
function updateStats(){
 $("totalTrips").textContent=allTrips.length;$("pendingTrips").textContent=allTrips.filter(t=>t.status==="PENDING").length;$("activeTrips").textContent=allTrips.filter(t=>["ACCEPTED","IN_PROGRESS"].includes(t.status)).length;
}
function renderDrivers(s){
 const root=$("users");root.replaceChildren();let count=0;
 s.forEach(c=>{count++;const d=c.val(),card=document.createElement("article");card.className="ride-card";
 const p=document.createElement("p");p.textContent=(d.name||"سائق")+" — "+(d.phone||"")+" — "+(d.approved?"معتمد":"بانتظار الاعتماد")+" — "+(d.available?"متاح":"غير متاح");
 const b=document.createElement("button");b.textContent=d.approved?"إيقاف اعتماد السائق":"اعتماد السائق";b.className=d.approved?"secondary":"";
 b.onclick=async()=>{b.disabled=true;try{await update(ref(db,"drivers/"+c.key),{approved:!d.approved,available:false});}catch(e){$("message").textContent=e.message;}finally{b.disabled=false;}};
 card.append(p,b);root.append(card);});
 $("driversCount").textContent=count;if(!count)root.textContent="لا يوجد سائقون مسجلون بعد.";
}
function renderTrips(){
 const q=$("tripSearch").value.trim().toLowerCase(),root=$("rides");root.replaceChildren();
 const filtered=allTrips.filter(t=>[t.fromName,t.toName,t.status,t.driverName,t.clientPhone].join(" ").toLowerCase().includes(q));
 if(!filtered.length){root.textContent="لا توجد رحلات مطابقة.";return;}
 filtered.slice(0,150).forEach(t=>{const card=document.createElement("article");card.className="ride-card";
 const p=document.createElement("p");p.textContent=(t.fromName||t.from||"غير محدد")+" ← "+(t.toName||t.to||"غير محدد");
 const meta=document.createElement("small");meta.textContent="الحالة: "+(t.status||"—")+" | السائق: "+(t.driverName||"لم يُحدد")+" | الهاتف: "+(t.clientPhone||"—");
 card.append(p,meta);root.append(card);});
}