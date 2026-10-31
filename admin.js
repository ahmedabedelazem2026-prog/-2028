import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getFirestore,doc,getDoc,collection,query,orderBy,limit,onSnapshot,updateDoc} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {firebaseConfig} from "./firebase-config.js";
const $=id=>document.getElementById(id),ready=firebaseConfig?.apiKey&&!firebaseConfig.apiKey.startsWith("YOUR_")&&firebaseConfig?.projectId&&!firebaseConfig.projectId.startsWith("YOUR_");
if(!ready){$("message").textContent="أضف إعدادات Firebase أولًا.";$("login").disabled=true;}
else{
 const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);let stops=[];
 $("login").onclick=async()=>{try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);}catch(e){$("message").textContent="تعذر الدخول: "+e.message;}};
 $("logout").onclick=()=>signOut(auth);
 onAuthStateChanged(auth,async user=>{
  stops.forEach(fn=>fn());stops=[];
  if(!user){$("adminLogin").hidden=false;$("adminPanel").hidden=true;return;}
  const me=await getDoc(doc(db,"users",user.uid));
  if(!me.exists()||me.data().role!=="admin"){$("message").textContent="هذا الحساب ليس حساب إدارة.";await signOut(auth);return;}
  $("adminLogin").hidden=true;$("adminPanel").hidden=false;
  stops.push(onSnapshot(query(collection(db,"users"),limit(100)),snap=>{const root=$("users");root.replaceChildren();snap.forEach(d=>{const u=d.data(),row=document.createElement("div");row.className="panel";row.style.margin="10px 0";const label=document.createElement("p");label.textContent=(u.name||"بدون اسم")+" — "+(u.phone||"بدون هاتف")+" — "+(u.role||"بدون صلاحية");const select=document.createElement("select");["customer","driver","admin"].forEach(role=>{const o=document.createElement("option");o.value=role;o.textContent=role==="customer"?"عميل":role==="driver"?"سائق":"إدارة";if(role===(u.role||"customer"))o.selected=true;select.append(o);});const save=document.createElement("button");save.textContent="حفظ الصلاحية";save.onclick=async()=>{save.disabled=true;try{await updateDoc(doc(db,"users",d.id),{role:select.value,available:false});$("message").textContent="تم تحديث الصلاحية.";}catch(e){$("message").textContent="تعذر التحديث: "+e.message;}finally{save.disabled=false;}};row.append(label,select,save);root.append(row);});}));
  stops.push(onSnapshot(query(collection(db,"rides"),orderBy("createdAt","desc"),limit(100)),snap=>{const root=$("rides");root.replaceChildren();if(snap.empty){root.textContent="لا توجد رحلات.";return;}snap.forEach(d=>{const r=d.data(),p=document.createElement("p");p.textContent=(r.pickup||"")+" ← "+(r.destination||"")+" | الحالة: "+(r.status||"")+" | السائق: "+(r.driverName||"لم يُحدد");root.append(p);});}));
 });
}