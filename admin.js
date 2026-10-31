import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getDatabase,ref,get,update,onValue} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import {firebaseConfig} from "./firebase-config.js";
const $=id=>document.getElementById(id),app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);let stops=[];
$("login").onclick=async()=>{try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);}catch(e){$("message").textContent="تعذر الدخول: "+e.message;}};
$("logout").onclick=()=>signOut(auth);
onAuthStateChanged(auth,async user=>{
  stops.forEach(f=>f());stops=[];
  if(!user){$("adminLogin").hidden=false;$("adminPanel").hidden=true;return;}
  const a=await get(ref(db,"admins/"+user.uid));
  if(!a.exists()||a.val().active!==true){$("message").textContent="هذا الحساب غير مفعّل كإدارة. يلزم تفعيل admins/"+user.uid+" من Firebase.";await signOut(auth);return;}
  $("adminLogin").hidden=true;$("adminPanel").hidden=false;
  stops.push(onValue(ref(db,"drivers"),s=>{
    const root=$("users");root.replaceChildren();
    s.forEach(child=>{const d=child.val(),row=document.createElement("div");row.className="panel";row.style.margin="10px 0";
      const p=document.createElement("p");p.textContent=(d.name||"سائق")+" — "+(d.phone||"")+" — "+(d.approved?"معتمد":"بانتظار الموافقة");
      const b=document.createElement("button");b.textContent=d.approved?"إلغاء الاعتماد":"اعتماد السائق";
      b.onclick=async()=>{b.disabled=true;try{await update(ref(db,"drivers/"+child.key),{approved:!d.approved,available:false});}catch(e){$("message").textContent=e.message;}finally{b.disabled=false;}};
      row.append(p,b);root.append(row);
    });
  },e=>$("message").textContent=e.message));
  stops.push(onValue(ref(db,"trips"),s=>{
    const root=$("rides");root.replaceChildren();const arr=[];s.forEach(c=>arr.push({id:c.key,...c.val()}));arr.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    if(!arr.length){root.textContent="لا توجد رحلات.";return;}
    arr.slice(0,100).forEach(t=>{const p=document.createElement("p");p.textContent=(t.fromName||t.from||"")+" ← "+(t.toName||t.to||"")+" | "+(t.status||"")+" | السائق: "+(t.driverName||"لم يُحدد");root.append(p);});
  },e=>$("message").textContent=e.message));
});