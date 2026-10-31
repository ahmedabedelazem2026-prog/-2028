import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase, ref, set, get, update, query, orderByChild, equalTo, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
const $=id=>document.getElementById(id), app=initializeApp(firebaseConfig), auth=getAuth(app), db=getDatabase(app);
let profile=null, stopFeed=null, creatingDriver=false;
function stop(){ if(stopFeed){stopFeed();stopFeed=null;} }
function feed(){
  stop();
  const q=query(ref(db,"trips"),orderByChild("status"),equalTo("PENDING"));
  stopFeed=onValue(q,s=>{
    const root=$("rides"); root.replaceChildren();
    if(!s.exists()){root.textContent="لا توجد طلبات جديدة حاليًا.";return;}
    s.forEach(child=>{
      const t=child.val(), card=document.createElement("article"); card.className="panel";
      const p=document.createElement("p"); p.textContent="من: "+(t.fromName||t.from||"غير محدد")+" — إلى: "+(t.toName||t.to||"غير محدد");
      const b=document.createElement("button"); b.textContent="قبول الرحلة"; b.onclick=()=>accept(child.key,b);
      card.append(p,b); root.append(card);
    });
  },e=>$("message").textContent="تعذر تحميل الطلبات: "+e.message);
}
$("signupDriver").onclick=async()=>{
  try{
    const name=$("driverName").value.trim(),phone=$("driverPhone").value.trim(),email=$("email").value.trim(),password=$("password").value;
    if(!name||!phone||!email||password.length<6) throw new Error("اكتب الاسم والهاتف والبريد وكلمة مرور من 6 أحرف على الأقل.");
    creatingDriver=true;
    const c=await createUserWithEmailAndPassword(auth,email,password);
    await set(ref(db,"drivers/"+c.user.uid),{name,phone,email:c.user.email,role:"driver",approved:false,available:false,createdAt:Date.now()});
    creatingDriver=false;
    $("message").textContent="تم تسجيل طلب السائق. انتظر موافقة الإدارة.";
    await signOut(auth);
  }catch(e){$("message").textContent=e.message;}
};
$("login").onclick=async()=>{try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);}catch(e){$("message").textContent="تعذر الدخول: "+e.message;}};
$("logout").onclick=()=>signOut(auth);
onAuthStateChanged(auth,async user=>{
  if(creatingDriver)return;
  stop();
  if(!user){$("driverLogin").hidden=false;$("driverPanel").hidden=true;return;}
  try{
    const snap=await get(ref(db,"drivers/"+user.uid)); profile=snap.val();
    if(!profile){$("message").textContent="لا يوجد ملف سائق لهذا الحساب. سجّل طلب سائق جديد.";await signOut(auth);return;}
    if(profile.approved!==true){$("message").textContent="حسابك قيد مراجعة الإدارة ولم تتم الموافقة عليه بعد."; $("driverLogin").hidden=false;$("driverPanel").hidden=true;await signOut(auth);return;}
    $("driverLogin").hidden=true;$("driverPanel").hidden=false;
    $("driverWelcome").textContent="أهلًا "+(profile.name||"بالسائق")+".";
    $("toggleAvailable").textContent=profile.available?"إيقاف استقبال الرحلات":"تفعيل استقبال الرحلات";
    if(profile.available)feed();else $("rides").textContent="فعّل استقبال الرحلات لعرض الطلبات.";
  }catch(e){$("message").textContent="تعذر قراءة ملف السائق: "+e.message;}
});
$("toggleAvailable").onclick=async()=>{
  try{const next=!profile.available;await update(ref(db,"drivers/"+auth.currentUser.uid),{available:next});profile.available=next;$("toggleAvailable").textContent=next?"إيقاف استقبال الرحلات":"تفعيل استقبال الرحلات";if(next)feed();else{stop();$("rides").textContent="تم إيقاف استقبال الرحلات.";} }
  catch(e){$("message").textContent="تعذر تحديث التوفر: "+e.message;}
};
async function accept(id,btn){
  btn.disabled=true;
  try{
    const result=await runTransaction(ref(db,"trips/"+id),current=>{
      if(!current||current.status!=="PENDING")return;
      return {...current,status:"ACCEPTED",driverId:auth.currentUser.uid,driverName:profile.name||"",acceptedAt:Date.now()};
    });
    if(!result.committed)throw new Error("سبق سائق آخر إلى قبول الرحلة.");
    await update(ref(db,"drivers/"+auth.currentUser.uid),{available:false});
    profile.available=false;stop();$("toggleAvailable").textContent="تفعيل استقبال الرحلات";
    $("rides").textContent="تم قبول الرحلة بنجاح.";
    $("message").textContent="تم قبول الرحلة.";
  }catch(e){$("message").textContent=e.message||"تعذر قبول الرحلة.";}
  finally{btn.disabled=false;}
}