/* ---------- ứng dụng độc lập: Supabase ---------- */
window.__APP=true;
const SB_URL="https://pkckduidwfcncipwzdxa.supabase.co", SB_KEY="sb_publishable_ZHvz0flMvyIsxmT-tKS_Hw_q_Vz_7RF";
const COLS=["zones","people","tasks","contracts","daily","units","events","leaves","faqs","supports","contacts"];
let SB=null, PROFILE=null, FIN={}, RAW={};
const ROLE_L={owner:"Owner",manager:"Quản lý",staff:"Nhân viên",viewer:"Chỉ xem",ctv:"Cộng tác viên"};
function canFin(){ return !!PROFILE&&(PROFILE.role==="owner"||PROFILE.can_finance); }
function isOwner(){ return PROFILE?.role==="owner"; }
function canLeaveOk(){ return isOwner()||!!(typeof me!=="undefined"&&me&&S.people[me]?.canLeave===true); }
function finSplit(d){ // tách số tiền khỏi hợp đồng
  const items=(d.items||[]).map(it=>{ const {price,...r}=it; return r; });
  const payments=(d.payments||[]).map(p=>{ const {paid,paidDate,...r}=p; return r; });
  const fin={prices:(d.items||[]).map(it=>+it.price||0),paid:(d.payments||[]).map(p=>!!p.paid),paidDate:(d.payments||[]).map(p=>p.paidDate||null)};
  return {pub:{...d,items,payments},fin}; }
function finJoin(id){ const d=RAW.contracts?.[id]; if(!d) return null; const f=FIN[id]||{}; const o={...d};
  o.items=(d.items||[]).map((it,i)=>({...it,price:f.prices?f.prices[i]:undefined}));
  o.payments=(d.payments||[]).map((p,i)=>({...p,paid:f.paid?!!f.paid[i]:false,paidDate:f.paidDate?f.paidDate[i]:null}));
  return o; }
function rebuild(col){ if(col==="contracts"){ const o={}; Object.keys(RAW.contracts||{}).forEach(k=>o[k]=finJoin(k)); S.contracts=o; } else if(col==="tasks"){ const R=RAW.tasks||{}; const gone=(t,n)=>!!t.parent&&(!R[t.parent]||(n<5&&gone(R[t.parent],n+1))); const o={}; Object.entries(R).forEach(([k,t])=>{ if(!gone(t,0)) o[k]=t; }); S.tasks=o; } else S[col]=RAW[col]||{}; }
let rT=null; function softRender(){ clearTimeout(rT); rT=setTimeout(()=>{ if(ready) render(); },120); }
function errMsg(e){ const m=(e?.message||e?.code||"")+""; if(/row-level security|permission|not allowed|42501/i.test(m)) return "Bạn không có quyền thao tác này"; return "Chưa lưu được: "+m; }
async function put(col,id,data){
  try{ if(col==="contracts"){ const {pub,fin}=finSplit(data); const {error}=await SB.from("docs").upsert({col,id,data:pub}); if(error) throw error; RAW.contracts={...RAW.contracts,[id]:pub};
      if(canFin()&&["owner","manager"].includes(PROFILE.role)){ const {error:e2}=await SB.from("contract_fin").upsert({id,data:fin}); if(e2) throw e2; FIN[id]=fin; } rebuild("contracts"); softRender(); return true; }
    const {error}=await SB.from("docs").upsert({col,id,data}); if(error) throw error; RAW[col]={...RAW[col],[id]:data}; rebuild(col); softRender(); if(col==="tasks"&&typeof evSyncSoon==="function") evSyncSoon(); return true;
  }catch(e){ toast(errMsg(e)); return false; } }
async function upd(col,id,patch){
  try{ if(col==="contracts"&&(patch.items||patch.payments)){ const cur=S.contracts[id]||{}; return await put(col,id,{...cur,...patch}); }
    const {error}=await SB.rpc("doc_merge",{p_col:col,p_id:id,p_patch:patch}); if(error) throw error;
    RAW[col]={...RAW[col],[id]:{...(RAW[col]?.[id]||{}),...patch}}; rebuild(col); softRender(); if(col==="tasks"&&typeof evSyncSoon==="function") evSyncSoon(); return true;
  }catch(e){ toast(errMsg(e)); return false; } }
async function del(col,id){
  try{ const {error}=await SB.from("docs").delete().eq("col",col).eq("id",id); if(error) throw error; if(col==="contracts"&&canFin()) await SB.from("contract_fin").delete().eq("id",id);
    const o={...RAW[col]}; delete o[id]; RAW[col]=o; rebuild(col); softRender(); return true; }catch(e){ toast("Chưa xóa được: "+errMsg(e)); return false; } }
async function loadAll(){
  RAW={}; COLS.forEach(c=>RAW[c]={});
  for(let from=0;;from+=1000){ const {data,error}=await SB.from("docs").select("col,id,data").range(from,from+999); if(error) throw error; data.forEach(r=>{ (RAW[r.col]||(RAW[r.col]={}))[r.id]=r.data; }); if(data.length<1000) break; }
  FIN={}; if(canFin()){ const {data}=await SB.from("contract_fin").select("id,data"); (data||[]).forEach(r=>FIN[r.id]=r.data); }
  COLS.forEach(rebuild);
}
function subscribe(){
  const ch=SB.channel("bvi-live").on("postgres_changes",{event:"*",schema:"public",table:"docs"},p=>{
    const r=p.new&&p.new.col?p.new:p.old; if(!r||!r.col) return; const o={...(RAW[r.col]||{})};
    if(p.eventType==="DELETE") delete o[r.id]; else o[r.id]=p.new.data; RAW[r.col]=o; rebuild(r.col); softRender(); });
  if(canFin()) ch.on("postgres_changes",{event:"*",schema:"public",table:"contract_fin"},p=>{ if(p.eventType==="DELETE") delete FIN[p.old.id]; else FIN[p.new.id]=p.new.data; rebuild("contracts"); softRender(); });
  ch.subscribe();
}
assetsNs=null;
function makeAssets(){ return {
  async upload(f){ if(f.size>3*1024*1024){ const e=new Error("too_large"); e.code="too_large"; throw e; }
    const ext=(f.name.match(/\.[a-z0-9]{1,5}$/i)||[""])[0].toLowerCase(); const path=todayStr().slice(0,7)+"/"+crypto.randomUUID()+ext;
    const {error}=await SB.storage.from("files").upload(path,f,{contentType:f.type||undefined,upsert:false}); if(error){ const e=new Error(error.message); e.code=/mime|type/i.test(error.message)?"unsupported_type":/size|large/i.test(error.message)?"too_large":"error"; throw e; }
    return {id:path,url:SB.storage.from("files").getPublicUrl(path).data.publicUrl,contentType:f.type}; },
  async delete(id){ await SB.storage.from("files").remove([id]); } }; }
function shellAuth(on){ document.querySelector("header.top nav.tabs").style.display=on?"":"none"; $("#bot").style.display=on?"":"none"; $("#meBox").style.display=on?"":"none"; }
function authCard(inner){ shellAuth(false); $("#app").innerHTML='<div style="max-width:380px;margin:40px auto" class="panel">'+inner+'</div>'; }
function showLogin(msg){
  authCard('<h1 style="margin-top:0">Đăng nhập</h1><div class="sub" style="margin-bottom:10px">BVI Điều hành · tài khoản do owner cấp</div>'+(msg?'<div class="alert bad" style="margin-bottom:8px">'+esc(msg)+'</div>':'')
   +'<form id="lf" class="grid" style="gap:8px"><div class="f"><label for="lem">Email</label><input id="lem" type="email" autocomplete="username" required></div><div class="f"><label for="lpw">Mật khẩu</label><input id="lpw" type="password" autocomplete="current-password" required></div><button class="btn pri">Đăng nhập</button><div class="sub" id="lmsg"></div></form>'
   +'<div class="sub" style="margin-top:12px">Quên mật khẩu: nhờ owner đặt lại trong mục Tài khoản.</div><div style="margin-top:8px"><a href="#" id="bootLink" class="sub">Cài đặt lần đầu (tạo tài khoản owner)</a></div>');
  $("#lf").addEventListener("submit",async e=>{ e.preventDefault(); $("#lmsg").textContent="Đang đăng nhập…";
    const {error}=await SB.auth.signInWithPassword({email:$("#lem").value.trim(),password:$("#lpw").value});
    if(error){ $("#lmsg").textContent=/invalid/i.test(error.message)?"Sai email hoặc mật khẩu.":/banned/i.test(error.message)?"Tài khoản đã bị khóa.":error.message; return; }
    await logEv("login"); startSession(); });
  $("#bootLink").addEventListener("click",e=>{ e.preventDefault(); showBootstrap(); });
}
function showBootstrap(){
  authCard('<h1 style="margin-top:0">Tạo tài khoản owner</h1><div class="sub" style="margin-bottom:10px">Chỉ làm một lần. Email owner: minhducuy@gmail.com</div><form id="bf" class="grid" style="gap:8px"><div class="f"><label for="bcode">Mã khởi tạo</label><input id="bcode" required autocomplete="off"></div><div class="f"><label for="bpw">Mật khẩu owner (từ 8 ký tự)</label><input id="bpw" type="password" minlength="8" required autocomplete="new-password"></div><div class="f"><label for="bpw2">Nhập lại mật khẩu</label><input id="bpw2" type="password" minlength="8" required autocomplete="new-password"></div><button class="btn pri">Tạo owner</button><div class="sub" id="bmsg"></div></form><div style="margin-top:8px"><a href="#" id="backLogin" class="sub">← Đăng nhập</a></div>');
  $("#backLogin").addEventListener("click",e=>{e.preventDefault();showLogin();});
  $("#bf").addEventListener("submit",async e=>{ e.preventDefault(); if($("#bpw").value!==$("#bpw2").value){ $("#bmsg").textContent="Hai mật khẩu chưa khớp."; return; }
    $("#bmsg").textContent="Đang tạo…"; const r=await callAdmin({action:"bootstrap",code:$("#bcode").value,password:$("#bpw").value},true);
    if(r.error){ $("#bmsg").textContent=r.error==="already_bootstrapped"?"Đã có owner. Hãy đăng nhập.":r.error; return; }
    const {error}=await SB.auth.signInWithPassword({email:r.email,password:$("#bpw").value}); if(error){ showLogin("Đã tạo owner, hãy đăng nhập."); return; } startSession(); });
}
async function logEv(a,sum){ try{ await SB.rpc("log_event",{p_action:a,p_summary:sum||null}); }catch(e){} }
async function signOutLog(){ await logEv("logout"); await SB.auth.signOut(); }
async function callAdmin(body,anon){
  try{ const h={"Content-Type":"application/json",apikey:SB_KEY}; if(!anon){ const {data}=await SB.auth.getSession(); h.Authorization="Bearer "+(data.session?.access_token||""); }
    const res=await fetch(SB_URL+"/functions/v1/admin-users",{method:"POST",headers:h,body:JSON.stringify(body)}); return await res.json(); }catch(e){ return {error:"Không kết nối được máy chủ"}; } }
async function callDrive(body){
  try{ const {data}=await SB.auth.getSession(); const h={"Content-Type":"application/json",apikey:SB_KEY,Authorization:"Bearer "+(data.session?.access_token||"")};
    const res=await fetch(SB_URL+"/functions/v1/drive",{method:"POST",headers:h,body:JSON.stringify(body)}); let j=null; try{ j=await res.json(); }catch(_){} if(!res.ok&&!(j&&j.error)) return {error:res.status===546||res.status===504?"timeout":"http_"+res.status}; return j||{error:"http_"+res.status}; }catch(e){ return {error:"Không kết nối được máy chủ"}; } }
function showChangePw(first){
  const html='<h1 style="margin-top:0">'+(first?'Đổi mật khẩu lần đầu':'Đổi mật khẩu')+'</h1><div class="sub" style="margin-bottom:10px">'+esc(PROFILE?.email||"")+(first?' · mật khẩu được cấp chỉ dùng một lần':'')+'</div><form id="cpf" class="grid" style="gap:8px"><div class="f"><label for="np1">Mật khẩu mới (từ 8 ký tự)</label><input id="np1" type="password" minlength="8" required autocomplete="new-password"></div><div class="f"><label for="np2">Nhập lại</label><input id="np2" type="password" minlength="8" required autocomplete="new-password"></div><button class="btn pri">Lưu mật khẩu</button><div class="sub" id="cpm"></div></form>'+(first?'<div style="margin-top:8px"><a href="#" id="lo2" class="sub">Đăng xuất</a></div>':'');
  if(first) authCard(html); else showDrawer('<div class="dh"><h2>Đổi mật khẩu</h2><button class="btn sm" data-close>Đóng</button></div><div class="db">'+html.replace(/<h1[^]*?<\/h1>/,"")+'</div>');
  $("#lo2")?.addEventListener("click",async e=>{e.preventDefault(); await signOutLog(); location.reload();});
  $("#cpf").addEventListener("submit",async e=>{ e.preventDefault(); const a=$("#np1").value; if(a!==$("#np2").value){ $("#cpm").textContent="Hai mật khẩu chưa khớp."; return; } if(a.length<8){ $("#cpm").textContent="Cần ít nhất 8 ký tự."; return; }
    $("#cpm").textContent="Đang lưu…"; const {error}=await SB.auth.updateUser({password:a}); if(error){ $("#cpm").textContent=/same/i.test(error.message)?"Mật khẩu mới phải khác mật khẩu cũ.":error.message; return; }
    await SB.from("profiles").update({must_change_pw:false}).eq("id",PROFILE.id); PROFILE.must_change_pw=false; logEv("password",first?"đổi mật khẩu lần đầu":"đổi mật khẩu"); toast("Đã đổi mật khẩu"); if(first) startSession(); else closeDrawer(); });
}
async function startSession(){
  const {data:{session}}=await SB.auth.getSession(); if(!session){ showLogin(); return; }
  const {data:prof,error}=await SB.from("profiles").select("*").eq("id",session.user.id).maybeSingle();
  if(error||!prof){ await SB.auth.signOut(); showLogin("Tài khoản chưa được cấp quyền. Liên hệ owner."); return; }
  if(!prof.active){ await SB.auth.signOut(); showLogin("Tài khoản đã bị khóa."); return; }
  if(prof.role==="ctv"){ location.replace("sales.html"); return; } // cộng tác viên chỉ dùng trang sales
  PROFILE=prof; if(prof.must_change_pw){ showChangePw(true); return; }
  logEv("open"); if(!window._seenT){ window._seenT=setInterval(()=>{ if(document.visibilityState==="visible") logEv("open"); },15*60e3); document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") logEv("open"); }); } userCan=["owner","manager"].includes(prof.role); me=prof.person_id||null; viewerName=prof.name||prof.email;
  if(prof.role!=="viewer") assetsNs=makeAssets();
  shellAuth(true); renderShell(); $("#app").innerHTML='<div class="empty">Đang tải dữ liệu…</div>';
  try{ await loadAll(); }catch(e){ $("#app").innerHTML='<div class="alert bad">Không đọc được dữ liệu: '+esc(e.message||"")+'. Tải lại trang.</div>'; return; }
  loadedCols=new Set(COLS); ready=true; subscribe(); render();
}
async function boot(){
  renderShell(); shellAuth(false);
  if(!window.supabase){ $("#app").innerHTML='<div class="alert bad">Không tải được thư viện kết nối. Kiểm tra mạng rồi tải lại trang.</div>'; return; }
  SB=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  SB.auth.onAuthStateChange(ev=>{ if(ev==="SIGNED_OUT"){ PROFILE=null; ready=false; showLogin(); } });
  startSession();
}
function renderMe(){ const b=$("#meBtn"); if(b) b.textContent=(viewerName||"Tài khoản")+(PROFILE?" · "+ROLE_L[PROFILE.role]:""); }
function openMe(){
  showDrawer('<div class="dh"><div><h2>'+esc(PROFILE.name||PROFILE.email)+'</h2><div class="sub">'+esc(PROFILE.email)+' · '+ROLE_L[PROFILE.role]+(canFin()?' · xem tài chính':'')+'</div></div><button class="btn sm" data-close>Đóng</button></div><div class="db">'
   +'<div class="sub">Nhân sự gắn với tài khoản: <b>'+esc(pname(me)||"chưa gắn")+'</b></div><div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="btn" id="mePw">Đổi mật khẩu</button>'+(isOwner()?'<a class="btn" href="#tai-khoan" id="meAcc">Quản lý tài khoản</a>':'')+(canManage()?'<a class="btn" href="#nhat-ky" id="meLog">Nhật ký hoạt động</a>':'')+'<button class="btn" id="meOut">Đăng xuất</button></div></div>');
  $("#mePw").addEventListener("click",()=>showChangePw(false)); $("#meAcc")?.addEventListener("click",()=>closeDrawer()); $("#meLog")?.addEventListener("click",()=>closeDrawer());
  $("#meOut").addEventListener("click",async()=>{ await signOutLog(); location.hash=""; location.reload(); });
}
/* ---------- quản lý tài khoản (owner) ---------- */
let ACC=null;
let ACT=null;
async function loadAct(){ const since=new Date(Date.now()-30*864e5).toISOString(); const m={};
  try{ const {data,error}=await SB.from("activity_log").select("user_id,action,at").gte("at",since).order("at",{ascending:false}).limit(5000); if(error) throw error;
    const w7=Date.now()-7*864e5; (data||[]).forEach(r=>{ const o=m[r.user_id]||(m[r.user_id]={seen:null,work:null,n7:0}); if(!o.seen) o.seen=r.at; if(["create","update","delete"].includes(r.action)){ if(!o.work) o.work=r.at; if(new Date(r.at)>=w7) o.n7++; } });
  }catch(e){} ACT=m; }
function accT(x){ if(!x) return ""; const d=new Date(x); if(isNaN(d)) return ""; const p=n=>String(n).padStart(2,"0"); const mins=Math.round((Date.now()-d)/6e4);
  const rel=mins<60?(mins<=1?"vừa xong":mins+" phút trước"):mins<1440?Math.round(mins/60)+" giờ trước":Math.round(mins/1440)+" ngày trước";
  return p(d.getHours())+":"+p(d.getMinutes())+" "+p(d.getDate())+"/"+p(d.getMonth()+1)+'<div class="sub">'+rel+'</div>'; }
function accSeenCell(u){ const a=(ACT||{})[u.id]||{}; const seen=[a.seen,u.last_sign_in_at].filter(Boolean).sort().pop(); const old=!seen||Date.now()-new Date(seen)>3*864e5;
  return '<td'+(old?' style="color:var(--warn,#d9a441)"':'')+'>'+(seen?accT(seen):'<span class="sub">Chưa vào</span>')+'</td><td>'+(a.work?accT(a.work):'<span class="sub">Chưa có</span>')+'</td><td>'+(a.n7?'<b>'+a.n7+'</b>':'<span class="sub">0</span>')+'</td>'; }
async function loadAcc(){ const [r]=await Promise.all([callAdmin({action:"list"}),loadAct()]); if(r.error){ toast(r.error==="owner_only"?"Chỉ owner xem được":r.error); ACC=[]; } else ACC=r.users; if(ui.view==="tai-khoan") render(); }
function vAccounts(){
  if(!isOwner()) return '<div class="alert bad">Chỉ owner quản lý tài khoản.</div>';
  if(ACC===null){ loadAcc(); return '<div class="empty">Đang tải danh sách tài khoản…</div>'; }
  let h='<div class="row between"><div><h1>Tài khoản, phân quyền</h1><div class="sub">'+ACC.length+' tài khoản. Owner: toàn quyền, cấp tài khoản. Quản lý: sửa mọi dữ liệu, duyệt phép, FAQ. Nhân viên: ghi việc, vùng, lịch, báo cáo. Chỉ xem: không sửa. Tài chính bật riêng từng người.</div></div><div class="row"><a class="btn" href="#nhat-ky">Nhật ký</a><button class="btn" id="accBulk">Tạo tài khoản cho nhân sự</button><button class="btn pri" id="accAdd">Thêm tài khoản</button></div></div>';
  h+='<div class="tw panel" style="margin-top:12px"><table><thead><tr><th>Tài khoản</th><th>Nhân sự</th><th>Vai trò</th><th>Tài chính</th><th>Kế hoạch</th><th>Duyệt nghỉ</th><th>Trạng thái</th><th>Vào web gần nhất</th><th>Thao tác nghiệp vụ gần nhất</th><th title="Số lần tạo, sửa, xóa dữ liệu trong 7 ngày">Thao tác 7 ngày</th></tr></thead><tbody>'
   +ACC.map(u=>'<tr data-acc="'+u.id+'" style="cursor:pointer"><td><b>'+esc(u.name||"")+'</b><div class="sub">'+esc(u.email)+'</div></td><td>'+esc(pname(u.person_id)||"—")+'</td><td>'+ROLE_L[u.role]+'</td><td>'+(u.role==="owner"||u.can_finance?'<span class="pill good">Được xem</span>':'<span class="pill">Không</span>')+'</td><td>'+(u.role==="owner"||(u.person_id&&S.people[u.person_id]?.canPlan)?'<span class="pill good">Được dùng</span>':'<span class="pill">Không</span>')+'</td><td>'+(u.role==="owner"||(u.person_id&&S.people[u.person_id]?.canLeave)?'<span class="pill good">Được duyệt</span>':'<span class="pill">Không</span>')+'</td><td>'+(u.active?(u.must_change_pw?'<span class="pill warn">Chờ đổi mật khẩu</span>':'<span class="pill good">Hoạt động</span>'):'<span class="pill bad">Đã khóa</span>')+'</td>'+accSeenCell(u)+'</tr>').join("")+'</tbody></table></div>';
  h+='<div class="panel" style="margin-top:12px"><h2>Chuyển dữ liệu từ bản cũ</h2><div class="sub">Ở bản cũ trên Claude, vào Công ty bấm "Xuất toàn bộ dữ liệu (JSON)", rồi chọn file đó ở đây. Bản ghi trùng mã sẽ được ghi đè bằng bản trong file.</div><label class="btn" style="margin-top:8px;cursor:pointer">Chọn file JSON<input type="file" id="impJson" accept=".json,application/json" hidden></label><span class="sub" id="impJmsg" style="margin-left:8px"></span></div>';
  return h;
}
function accForm(u){
  const people=Object.entries(S.people).sort((a,b)=>(a[1].name||"").localeCompare(b[1].name||"","vi"));
  const isSelf=u&&u.id===PROFILE.id;
  return '<div class="dh"><div><h2>'+(u?esc(u.email):"Thêm tài khoản")+'</h2>'+(u?'<div class="sub">'+ROLE_L[u.role]+(u.active?'':' · đã khóa')+'</div>':'')+'</div><button class="btn sm" data-close>Đóng</button></div><div class="db"><form id="accF" class="grid" style="gap:8px">'
   +(u?'':'<div class="f"><label for="a_em">Email đăng nhập</label><input id="a_em" type="email" required></div>')
   +'<div class="f"><label for="a_nm">Tên hiển thị</label><input id="a_nm" value="'+esc(u?.name||"")+'"></div>'
   +'<div class="f"><label for="a_p">Gắn với nhân sự (để thấy việc của mình)</label><select id="a_p"><option value="">— Chưa gắn —</option>'+people.map(([k,p])=>'<option value="'+k+'"'+(u?.person_id===k?" selected":"")+'>'+esc(p.name)+'</option>').join("")+'</select></div>'
   +'<div class="f2"><div class="f"><label for="a_r">Vai trò</label><select id="a_r"'+(isSelf?" disabled":"")+'>'+Object.entries(ROLE_L).filter(([k])=>k!=="owner"||u?.role==="owner").map(([k,l])=>'<option value="'+k+'"'+((u?.role||"staff")===k?" selected":"")+'>'+l+'</option>').join("")+'</select></div>'
   +'<div class="f"><label>Tài chính</label><label class="chk"><input type="checkbox" id="a_f"'+(u?.can_finance||u?.role==="owner"?" checked":"")+(isSelf?" disabled":"")+'><span>Được xem số tiền hợp đồng</span></label></div></div>'
   +'<div class="f"><label>Tính năng</label><label class="chk"><input type="checkbox" id="a_pl"'+(u?.role==="owner"||(u?.person_id&&S.people[u.person_id]?.canPlan)?" checked":"")+(u?.role==="owner"?" disabled":"")+'><span>Kế hoạch tuần: dán lịch, bảng tuần, rà soát công việc</span></label><label class="chk"><input type="checkbox" id="a_lv"'+(u?.role==="owner"||(u?.person_id&&S.people[u.person_id]?.canLeave)?" checked":"")+(u?.role==="owner"?" disabled":"")+'><span>Duyệt đơn nghỉ phép, về sớm</span></label><label class="chk"><input type="checkbox" id="a_ex"'+(u?.role==="owner"||(u?.person_id&&S.people[u.person_id]?.canExpense)?" checked":"")+(u?.role==="owner"?" disabled":"")+'><span>Ghi thu chi: chụp chứng từ thanh toán (chỉ thấy phiếu của mình)</span></label><label class="chk"><input type="checkbox" id="a_rc"'+(u?.role==="owner"||(u?.person_id&&S.people[u.person_id]?.canRecon)?" checked":"")+(u?.role==="owner"?" disabled":"")+'><span>Đối soát việc: xem việc trễ, lệch giữa lịch, báo cáo, tiến độ, hồ sơ vùng</span></label><div class="sub">Cần gắn với nhân sự. Người không có quyền vẫn thấy "Lịch hôm nay của tôi" ở Tổng quan.</div></div>'
   +(u?'':'<div class="f"><label for="a_pw">Mật khẩu cấp lần đầu (để trống: hệ thống tự tạo)</label><input id="a_pw" minlength="8" autocomplete="off"></div>')
   +'<div class="row"><button class="btn pri">'+(u?"Lưu":"Tạo tài khoản")+'</button><span class="sub" id="accM"></span></div></form>'
   +(u&&!isSelf?'<div class="panel" style="margin-top:12px"><div class="row" style="flex-wrap:wrap"><button class="btn" id="accPw">Đặt lại mật khẩu</button><button class="btn" id="accAct">'+(u.active?"Ngừng kích hoạt":"Kích hoạt lại")+'</button><button class="btn" id="accDel">Xóa tài khoản</button></div><div id="accOut" style="margin-top:8px"></div></div>':'')
   +(u&&isSelf?'<div class="panel" style="margin-top:12px"><button class="btn" id="accPwSelf">Đổi mật khẩu của tôi</button></div>':'')+'</div>';
}
function pwBox(email,pw){ return '<div class="alert" style="margin-top:8px">Gửi riêng cho người dùng (không đăng nhóm):<br>Email: <b>'+esc(email)+'</b><br>Mật khẩu tạm: <b class="mono">'+esc(pw)+'</b><br>Lần đầu đăng nhập hệ thống sẽ bắt đổi mật khẩu. <button type="button" class="btn sm" data-cp="'+esc("Đăng nhập BVI Điều hành: "+location.href.split("#")[0]+"\nEmail: "+email+"\nMật khẩu tạm: "+pw)+'">Sao chép</button></div>'; }
function bindCp(L){ L.querySelectorAll("[data-cp]").forEach(b=>b.addEventListener("click",async()=>{ try{ await navigator.clipboard.writeText(b.dataset.cp); toast("Đã sao chép"); }catch(e){ toast("Trình duyệt chặn sao chép"); } })); }
function openAcc(id){
  const u=id?ACC.find(x=>x.id===id):null; ui.drawer=null; showDrawer(accForm(u)); const L=$("#layer");
  $("#accF").addEventListener("submit",async e=>{ e.preventDefault(); const m=$("#accM"); m.textContent="Đang lưu…";
    const body={name:$("#a_nm").value.trim(),person_id:$("#a_p").value||null,role:$("#a_r").value,can_finance:$("#a_f").checked};
    const r=u?await callAdmin({action:"update",id:u.id,...body}):await callAdmin({action:"create",email:$("#a_em").value.trim(),password:$("#a_pw").value.trim()||undefined,...body});
    if(r.error){ m.textContent=/already/i.test(r.error)?"Email này đã có tài khoản.":r.error; return; }
    const pid=body.person_id, pl=$("#a_pl")?.checked; if(pid&&S.people[pid]&&!!S.people[pid].canPlan!==!!pl&&body.role!=="owner") await upd("people",pid,{canPlan:!!pl});
    if(u?.person_id&&u.person_id!==pid&&S.people[u.person_id]?.canPlan&&!ACC.some(x=>x.id!==u.id&&x.person_id===u.person_id)) await upd("people",u.person_id,{canPlan:false});
    const lv=$("#a_lv")?.checked; if(pid&&S.people[pid]&&!!S.people[pid].canLeave!==!!lv&&body.role!=="owner") await upd("people",pid,{canLeave:!!lv});
    const rcx=$("#a_rc")?.checked; if(pid&&S.people[pid]&&!!S.people[pid].canRecon!==!!rcx&&body.role!=="owner") await upd("people",pid,{canRecon:!!rcx});
    if(u?.person_id&&u.person_id!==pid&&S.people[u.person_id]?.canRecon&&!ACC.some(x=>x.id!==u.id&&x.person_id===u.person_id)) await upd("people",u.person_id,{canRecon:false});
    const ex=$("#a_ex")?.checked; if(pid&&S.people[pid]&&!!S.people[pid].canExpense!==!!ex&&body.role!=="owner") await upd("people",pid,{canExpense:!!ex});
    if(u?.person_id&&u.person_id!==pid&&S.people[u.person_id]?.canExpense&&!ACC.some(x=>x.id!==u.id&&x.person_id===u.person_id)) await upd("people",u.person_id,{canExpense:false});
    if(u?.person_id&&u.person_id!==pid&&S.people[u.person_id]?.canLeave&&!ACC.some(x=>x.id!==u.id&&x.person_id===u.person_id)) await upd("people",u.person_id,{canLeave:false});
    m.textContent="Đã lưu"; if(!u){ $("#accF").insertAdjacentHTML("afterend",pwBox(r.email,r.password)); bindCp(L); $("#accF").querySelector("button").disabled=true; } await loadAcc(); });
  $("#accPw")?.addEventListener("click",async()=>{ const r=await callAdmin({action:"reset_password",id:u.id}); if(r.error){ toast(r.error); return; } $("#accOut").innerHTML=pwBox(u.email,r.password); bindCp(L); loadAcc(); });
  $("#accAct")?.addEventListener("click",async()=>{ const r=await callAdmin({action:"set_active",id:u.id,active:!u.active}); if(r.error){ toast(r.error); return; } toast(u.active?"Đã khóa tài khoản":"Đã kích hoạt lại"); closeDrawer(); loadAcc(); });
  $("#accDel")?.addEventListener("click",async e=>{ const b=e.currentTarget; if(b.dataset.c!=="1"){ b.dataset.c="1"; b.textContent="Bấm lần nữa để xóa hẳn"; return; } const r=await callAdmin({action:"delete",id:u.id}); if(r.error){ toast(r.error); return; } toast("Đã xóa tài khoản"); closeDrawer(); loadAcc(); });
  $("#accPwSelf")?.addEventListener("click",()=>showChangePw(false));
}
async function importJson(file){
  const m=$("#impJmsg"); let j; try{ j=JSON.parse(await file.text()); }catch(e){ m.textContent="File không đọc được."; return; }
  const C=j.collections||{}; const rows=[], fins=[];
  COLS.forEach(col=>Object.entries(C[col]||{}).forEach(([id,d])=>{ if(!d||typeof d!=="object") return; if(col==="contracts"){ const {pub,fin}=finSplit(d); rows.push({col,id,data:pub}); fins.push({id,data:fin}); } else rows.push({col,id,data:d}); }));
  if(!rows.length){ m.textContent="File không có dữ liệu."; return; }
  for(let i=0;i<rows.length;i+=200){ m.textContent="Đang ghi "+Math.min(i+200,rows.length)+"/"+rows.length+"…"; const {error}=await SB.rpc("import_docs",{p_rows:rows.slice(i,i+200)}); if(error){ m.textContent="Lỗi: "+error.message; return; } }
  if(fins.length){ const {error}=await SB.from("contract_fin").upsert(fins); if(error){ m.textContent="Đã ghi dữ liệu, nhưng lỗi phần tài chính: "+error.message; return; } }
  await logEv("import","nhập dữ liệu từ file "+file.name+": "+rows.length+" bản ghi"); await loadAll(); m.textContent="Đã chuyển "+rows.length+" bản ghi."; render();
}

function slugName(n){ const w=String(n||"").replace(/^(anh|chị|chi|em|ông|ong|bà|ba|cô|co|chú|chu)\s+/i,"").trim().split(/\s+/).pop()||"user"; return w.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase().replace(/[^a-z0-9]/g,""); }
function bulkPlan(domain){
  const taken=new Set((ACC||[]).map(u=>u.email.toLowerCase())); const linked=new Set((ACC||[]).map(u=>u.person_id).filter(Boolean));
  const ps=Object.entries(S.people).filter(([k,p])=>p.active!==false&&!linked.has(k)).sort((a,b)=>(a[1].order||99)-(b[1].order||99));
  const cnt={}; return ps.map(([k,p])=>{ const b=slugName(p.name); let n=(cnt[b]||0)+1, em; do{ em=b+(n>1?n:"")+"@"+domain; n++; }while(taken.has(em)); cnt[b]=n-1; taken.add(em);
    return {pid:k,name:p.name,email:em,role:p.team==="dieuphoi"||p.team==="lead"?"manager":"staff",fin:false,on:true}; }); }
function openBulk(){
  const st={domain:"salefronts.com",pw:"123123123",rows:null}; st.rows=bulkPlan(st.domain);
  const draw=()=>{ showDrawer('<div class="dh"><div><h2>Tạo tài khoản cho nhân sự</h2><div class="sub">Nhân sự chưa có tài khoản. Email = tên gọi không dấu, trùng thì thêm số.</div></div><button class="btn sm" data-close>Đóng</button></div><div class="db">'
    +'<div class="f2"><div class="f"><label for="bkD">Tên miền email</label><input id="bkD" value="'+esc(st.domain)+'"></div><div class="f"><label for="bkP">Mật khẩu cấp chung (từ 8 ký tự)</label><input id="bkP" value="'+esc(st.pw)+'" autocomplete="off"></div></div><div class="sub" style="margin:4px 0 8px">Ai cũng phải đổi mật khẩu ở lần đăng nhập đầu.</div>'
    +(st.rows.length?st.rows.map((r,i)=>'<div class="panel" style="margin-bottom:6px;padding:8px 10px"><label class="chk"><input type="checkbox" data-bk="'+i+'"'+(r.on?" checked":"")+'><span><b>'+esc(r.name)+'</b></span></label><div class="row" style="flex-wrap:wrap;gap:6px;margin-top:4px"><input data-bke="'+i+'" value="'+esc(r.email)+'" style="flex:1 1 200px;min-width:0"><select data-bkr="'+i+'">'+["manager","staff","viewer"].map(x=>'<option value="'+x+'"'+(r.role===x?" selected":"")+'>'+ROLE_L[x]+'</option>').join("")+'</select><label class="row" style="gap:4px;font-size:13px"><input type="checkbox" data-bkf="'+i+'"'+(r.fin?" checked":"")+'> Tài chính</label></div><div class="sub" id="bkm'+i+'"></div></div>').join(""):'<div class="sub">Mọi nhân sự đã có tài khoản.</div>')
    +'<div class="row" style="position:sticky;bottom:0;background:var(--surface);padding:10px 0"><button class="btn pri" id="bkGo"'+(st.rows.some(r=>r.on)?'':' disabled')+'>Tạo '+st.rows.filter(r=>r.on).length+' tài khoản</button><span class="sub" id="bkMsg"></span></div></div>');
    const L=$("#layer");
    $("#bkD").addEventListener("change",e=>{ st.domain=e.target.value.trim().replace(/^@/,""); st.rows=bulkPlan(st.domain); draw(); });
    $("#bkP").addEventListener("input",e=>{ st.pw=e.target.value; });
    L.querySelectorAll("[data-bk]").forEach(c=>c.addEventListener("change",()=>{ st.rows[+c.dataset.bk].on=c.checked; draw(); }));
    L.querySelectorAll("[data-bke]").forEach(c=>c.addEventListener("change",()=>{ st.rows[+c.dataset.bke].email=c.value.trim().toLowerCase(); }));
    L.querySelectorAll("[data-bkr]").forEach(c=>c.addEventListener("change",()=>{ st.rows[+c.dataset.bkr].role=c.value; }));
    L.querySelectorAll("[data-bkf]").forEach(c=>c.addEventListener("change",()=>{ st.rows[+c.dataset.bkf].fin=c.checked; }));
    $("#bkGo")?.addEventListener("click",async e=>{ if(st.pw.length<8){ toast("Mật khẩu cần ít nhất 8 ký tự"); return; } e.currentTarget.disabled=true; let ok=0; const todo=st.rows.filter(r=>r.on);
      for(const r of todo){ const i=st.rows.indexOf(r); $("#bkMsg").textContent="Đang tạo "+(ok+1)+"/"+todo.length+"…";
        const res=await callAdmin({action:"create",email:r.email,password:st.pw,name:r.name,person_id:r.pid,role:r.role,can_finance:r.fin});
        $("#bkm"+i).textContent=res.error?("Lỗi: "+(/already/i.test(res.error)?"email đã có tài khoản":res.error)):"✓ Đã tạo"; if(!res.error){ ok++; r.on=false; } }
      $("#bkMsg").textContent="Đã tạo "+ok+"/"+todo.length+" tài khoản."; await loadAcc(); });
  }; draw(); }

/* ---------- nhật ký hoạt động (owner, quản lý) ---------- */
const LOG_ACT={login:["Đăng nhập","good"],open:["Mở ứng dụng",""],logout:["Đăng xuất",""],password:["Mật khẩu",""],create:["Thêm","good"],update:["Sửa","warn"],delete:["Xóa","bad"],finance:["Thanh toán","warn"],account:["Tài khoản","bad"],import:["Nhập file","bad"]};
const LOG_COL={zones:"Vùng",people:"Nhân sự",tasks:"Việc",contracts:"Hợp đồng",daily:"Báo cáo",units:"Đơn vị",events:"Lịch",leaves:"Nghỉ phép",faqs:"FAQ",supports:"Hỗ trợ",contacts:"Liên hệ",accounts:"Tài khoản",api_keys:"Khóa API",shares:"Bản gửi khách",expenses:"Thu chi"};
const LG={t:0,p:"7",from:"",to:"",who:"",act:"",q:"",rows:null,n:200,err:""};
function lgRange(){ const d0=new Date(); d0.setHours(0,0,0,0); let a=new Date(d0), b=null;
  if(LG.p==="7") a.setDate(a.getDate()-6); else if(LG.p==="30") a.setDate(a.getDate()-29); else if(LG.p==="month") a.setDate(1);
  else if(LG.p==="custom"){ if(LG.from) a=new Date(LG.from+"T00:00:00"); if(LG.to){ b=new Date(LG.to+"T00:00:00"); b.setDate(b.getDate()+1); } }
  return [a,b]; }
async function loadLogs(){ LG.rows=null; LG.err=""; const [a,b]=lgRange();
  let q=SB.from("activity_log").select("*").gte("at",a.toISOString()).order("at",{ascending:false}).limit(2000); if(b) q=q.lt("at",b.toISOString());
  const {data,error}=await q; LG.t=Date.now(); if(error){ LG.err=error.message; LG.rows=[]; } else LG.rows=data||[]; if(ui.view==="nhat-ky") render(); }
function lgFilter(){ const q=LG.q.trim().toLowerCase();
  return (LG.rows||[]).filter(r=>(!LG.who||(r.user_id||"sys")===LG.who)&&(!LG.act||(LG.act==="auth"?["login","open","logout","password"].includes(r.action):LG.act==="data"?["create","update","delete","finance","import"].includes(r.action):r.action===LG.act))&&(!q||((r.name||"")+" "+(r.title||"")+" "+(r.summary||"")).toLowerCase().includes(q))); }
function lgTime(t){ return new Date(t).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"}); }
function lgDay(t){ const d=new Date(t); return d.toLocaleDateString("vi-VN",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"}); }
function vLog(){
  if(!canManage()) return '<div class="alert bad">Chỉ owner và quản lý xem được nhật ký.</div>';
  if(LG.rows!==null&&Date.now()-LG.t>120000) LG.rows=null;
  if(LG.rows===null){ loadLogs(); return '<div class="empty">Đang tải nhật ký…</div>'; }
  const rows=lgFilter(); const people={}; (LG.rows||[]).forEach(r=>{ const k=r.user_id||"sys"; if(!people[k]) people[k]=r.name||r.email||"Hệ thống"; });
  let h='<div class="row between"><div><h1>Nhật ký hoạt động</h1><div class="sub">Tự ghi khi đăng nhập, thêm, sửa, xóa dữ liệu và quản lý tài khoản. Sửa liên tục cùng một mục trong 3 phút được gộp thành một dòng. Lưu 12 tháng.</div></div><button class="btn" id="lgRe">Làm mới</button></div>';
  h+='<div class="panel" style="margin-top:12px"><div class="row" style="flex-wrap:wrap;gap:8px">'
   +'<select id="lgP" aria-label="Thời gian">'+[["today","Hôm nay"],["7","7 ngày"],["30","30 ngày"],["month","Tháng này"],["custom","Từ ngày đến ngày"]].map(([v,l])=>'<option value="'+v+'"'+(LG.p===v?" selected":"")+'>'+l+'</option>').join("")+'</select>'
   +(LG.p==="custom"?'<input type="date" id="lgF" value="'+esc(LG.from)+'" aria-label="Từ ngày"><input type="date" id="lgT" value="'+esc(LG.to)+'" aria-label="Đến ngày">':'')
   +'<select id="lgW" aria-label="Người"><option value="">Mọi người</option>'+Object.entries(people).sort((a,b)=>a[1].localeCompare(b[1],"vi")).map(([k,n])=>'<option value="'+esc(k)+'"'+(LG.who===k?" selected":"")+'>'+esc(n)+'</option>').join("")+'</select>'
   +'<select id="lgA" aria-label="Loại"><option value="">Mọi thao tác</option><option value="auth"'+(LG.act==="auth"?" selected":"")+'>Đăng nhập, đăng xuất</option><option value="data"'+(LG.act==="data"?" selected":"")+'>Thay đổi dữ liệu</option>'+["create","update","delete","finance","account"].map(a=>'<option value="'+a+'"'+(LG.act===a?" selected":"")+'>'+LOG_ACT[a][0]+'</option>').join("")+'</select>'
   +'<input id="lgQ" placeholder="Tìm tên vùng, việc, nội dung…" value="'+esc(LG.q)+'" style="flex:1 1 180px;min-width:0"></div></div>';
  if(LG.err) h+='<div class="alert bad" style="margin-top:8px">Không đọc được nhật ký: '+esc(LG.err)+'</div>';
  // tổng hợp theo người
  const sum={}; rows.forEach(r=>{ const k=r.user_id||"sys"; const o=sum[k]||(sum[k]={name:r.name||r.email||"Hệ thống",login:0,last:null,create:0,update:0,del:0,tot:0}); if(r.action==="login"||r.action==="open"){ o.login++; if(!o.last) o.last=r.at; } else if(r.action==="create") o.create++; else if(r.action==="update"||r.action==="finance") o.update++; else if(r.action==="delete") o.del++; if(!["login","open","logout"].includes(r.action)) o.tot++; });
  const se=Object.entries(sum).sort((a,b)=>b[1].tot-a[1].tot);
  if(se.length) h+='<div class="tw panel" style="margin-top:12px"><table><thead><tr><th>Người</th><th>Vào hệ thống gần nhất</th><th>Lượt vào</th><th>Thêm</th><th>Sửa</th><th>Xóa</th></tr></thead><tbody>'
    +se.map(([k,o])=>'<tr data-lgw="'+esc(k)+'" style="cursor:pointer"><td><b>'+esc(o.name)+'</b></td><td class="sub">'+(o.last?lgTime(o.last)+' · '+new Date(o.last).toLocaleDateString("vi-VN"):'—')+'</td><td>'+o.login+'</td><td>'+o.create+'</td><td>'+o.update+'</td><td>'+(o.del?'<b style="color:var(--bad)">'+o.del+'</b>':0)+'</td></tr>').join("")+'</tbody></table></div>';
  if(!rows.length) return h+'<div class="empty" style="margin-top:12px">Chưa có hoạt động nào trong khoảng này.</div>';
  h+='<div class="panel" style="margin-top:12px">'; let day="";
  rows.slice(0,LG.n).forEach(r=>{ const d=lgDay(r.at); if(d!==day){ day=d; h+='<h3 style="margin:14px 0 6px;text-transform:capitalize">'+esc(d)+'</h3>'; }
    const A=LOG_ACT[r.action]||[r.action,""]; const can=r.col&&r.col!=="accounts"&&r.action!=="delete"&&S[r.col]&&S[r.col][r.doc_id];
    h+='<div class="row" style="gap:8px;align-items:flex-start;padding:6px 0;border-top:1px solid var(--line)"><span class="mono sub" style="flex:0 0 44px">'+lgTime(r.at)+'</span><span class="pill '+A[1]+'" style="flex:0 0 auto">'+A[0]+'</span><div style="flex:1;min-width:0"><b>'+esc(r.name||r.email||"Hệ thống")+'</b> '
     +(r.col?'<span class="sub">'+esc(LOG_COL[r.col]||r.col)+'</span> '+(can?'<a href="#" style="color:var(--brand)" data-lgo="'+esc(r.col)+'|'+esc(r.doc_id)+'">'+esc(r.title||r.doc_id)+'</a>':esc(r.title||r.doc_id||""))+': ':'')
     +'<span>'+esc(r.summary||"")+'</span></div></div>'; });
  h+='</div>'+(rows.length>LG.n?'<div class="row" style="justify-content:center;margin-top:8px"><button class="btn" id="lgMore">Xem thêm ('+(rows.length-LG.n)+' dòng)</button></div>':'');
  return h; }
function bindLog(A){
  const re=()=>{ LG.n=200; render(); };
  $("#lgRe")?.addEventListener("click",()=>{ loadLogs(); render(); });
  $("#lgP")?.addEventListener("change",e=>{ LG.p=e.target.value; if(LG.p!=="custom") loadLogs(); render(); });
  $("#lgF")?.addEventListener("change",e=>{ LG.from=e.target.value; loadLogs(); render(); });
  $("#lgT")?.addEventListener("change",e=>{ LG.to=e.target.value; loadLogs(); render(); });
  $("#lgW")?.addEventListener("change",e=>{ LG.who=e.target.value; re(); });
  $("#lgA")?.addEventListener("change",e=>{ LG.act=e.target.value; re(); });
  let qt=null; $("#lgQ")?.addEventListener("input",e=>{ LG.q=e.target.value; clearTimeout(qt); qt=setTimeout(()=>{ re(); const i=$("#lgQ"); if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length); } },350); });
  $("#lgMore")?.addEventListener("click",()=>{ LG.n+=300; render(); });
  A.querySelectorAll("[data-lgw]").forEach(r=>r.addEventListener("click",()=>{ LG.who=LG.who===r.dataset.lgw?"":r.dataset.lgw; re(); }));
  const OP={zones:openZone,tasks:id=>openTask(id),contracts:openContract,events:openEvent,units:openUnit,people:openPerson,faqs:openFaq,leaves:openLeave,supports:id=>openSupport(id),contacts:id=>(S.contacts[id]?.type==="lead"?(location.hash="nhu-cau"):openContact(id))};
  A.querySelectorAll("[data-lgo]").forEach(a=>a.addEventListener("click",e=>{ e.preventDefault(); const [c,id]=a.dataset.lgo.split("|"); const f=OP[c]; if(f) f(id); else toast("Mục này không mở chi tiết được"); }));
}
/* ---------- API cho đối tác (chỉ owner) ---------- */
const API_BASE=SB_URL+"/functions/v1/api/v1";
const API_RES={zones:"Vùng trồng",tasks:"Công việc",events:"Lịch công tác",leaves:"Lịch nghỉ",daily:"Báo cáo ngày",units:"Công ty, khách hàng",people:"Nhân sự",faqs:"Hỏi đáp",supports:"Yêu cầu hỗ trợ",contracts:"Hợp đồng (không có số tiền)",leads:"Nhu cầu khách hàng (che SĐT, email)",leads_write:"Gửi nhu cầu khách hàng (chỉ ghi)",farmbase_sync:"Đồng bộ FarmBase từ extension (chỉ ghi)"};
const API_W=["leads_write","farmbase_sync"];
let APIK=null, APIERR="";
async function callApiAdmin(body){
  try{ const {data}=await SB.auth.getSession(); const res=await fetch(SB_URL+"/functions/v1/api/admin",{method:"POST",headers:{"Content-Type":"application/json",apikey:SB_KEY,Authorization:"Bearer "+(data.session?.access_token||"")},body:JSON.stringify(body)});
    let j=null; try{ j=await res.json(); }catch(_){} return j||{error:"http_"+res.status}; }catch(e){ return {error:"Không kết nối được máy chủ"}; } }
async function loadApiKeys(){ const r=await callApiAdmin({action:"list"}); if(r.error){ APIERR=r.error==="owner_only"?"Chỉ owner quản lý API.":r.error; APIK=[]; } else { APIERR=""; APIK=r.keys||[]; } if(ui.view==="api") render(); }
function apiTime(x){ if(!x) return '<span class="sub">—</span>'; const d=new Date(x); return d.toLocaleDateString("vi-VN")+' '+String(d.getHours()).padStart(2,"0")+':'+String(d.getMinutes()).padStart(2,"0"); }
function apiState(k){ if(k.revoked_at) return '<span class="pill bad">Đã thu hồi</span>'; if(k.expires_at&&new Date(k.expires_at)<new Date()) return '<span class="pill warn">Hết hạn</span>'; return '<span class="pill good">Đang dùng</span>'; }
function vApi(){
  if(!isOwner()) return '<div class="alert bad">Chỉ owner quản lý API.</div>';
  if(APIK===null){ loadApiKeys(); return '<div class="empty">Đang tải danh sách khóa API…</div>'; }
  let h='<div class="row between"><div><h1>API cho đối tác</h1><div class="sub">Chỉ owner thấy trang này. Đối tác dùng khóa để <b>đọc</b> dữ liệu, không sửa được gì; riêng quyền "Gửi nhu cầu khách hàng" cho phép form, hệ thống khác thêm nhu cầu mới. API không bao giờ trả CCCD, sổ đỏ, số điện thoại, số tiền hợp đồng, link Drive.</div></div><div class="row"><button class="btn" id="apiRe">Tải lại</button><button class="btn pri" id="apiAdd">Tạo khóa mới</button></div></div>';
  if(APIERR) h+='<div class="alert bad" style="margin-top:8px">'+esc(APIERR)+'</div>';
  if(!APIK.length) h+='<div class="empty" style="margin-top:12px">Chưa có khóa nào. Bấm "Tạo khóa mới" để cấp cho một đối tác.</div>';
  else h+='<div class="tw panel" style="margin-top:12px"><table><thead><tr><th>Đối tác</th><th>Khóa</th><th>Quyền</th><th>Tạo</th><th>Hết hạn</th><th>Dùng gần nhất</th><th>Lượt gọi</th><th>Trạng thái</th><th></th></tr></thead><tbody>'
    +APIK.map(k=>'<tr><td><b>'+esc(k.name)+'</b></td><td class="mono">'+esc(k.prefix)+'…</td><td style="max-width:260px">'+(k.scopes||[]).map(s=>'<span class="pill" style="margin:1px">'+esc(API_RES[s]||s)+'</span>').join("")+'</td><td>'+apiTime(k.created_at)+'<div class="sub">'+esc(k.created_by||"")+'</div></td><td>'+(k.expires_at?apiTime(k.expires_at):'<span class="sub">Không hạn</span>')+'</td><td>'+apiTime(k.last_used_at)+(k.last_ip?'<div class="sub mono">'+esc(k.last_ip)+'</div>':'')+'</td><td>'+(k.use_count||0)+'</td><td>'+apiState(k)+'</td><td><div class="row" style="gap:4px;flex-wrap:nowrap">'
      +(k.revoked_at?'':'<button class="btn sm" data-apied="'+k.id+'">Sửa quyền</button><button class="btn sm" data-apirv="'+k.id+'">Thu hồi</button>')+'<button class="btn sm" data-apidel="'+k.id+'">Xóa</button></div></td></tr>').join("")+'</tbody></table></div>';
  const ex=API_BASE+"/zones?limit=100";
  const DOC="https://sfportal.github.io/bvi-dieu-hanh/api.html";
  h+='<div class="panel" style="margin-top:12px"><h2>Hướng dẫn gửi đối tác</h2>'
   +'<div class="sub">Trang hướng dẫn công khai (không chứa khóa), gửi link này cùng khóa cho đối tác:</div><div class="row" style="gap:6px;margin:4px 0 12px"><a class="mono" href="'+DOC+'" target="_blank" rel="noopener" style="flex:1;min-width:0;overflow-wrap:anywhere;color:var(--brand)">'+DOC+'</a><button class="btn sm" id="apiCpDoc">Sao chép link</button></div>'
   +'<div class="sub">Kết nối AI (MCP, dùng chung khóa, xem mục "Kết nối AI" trong trang hướng dẫn):</div><div class="row" style="gap:6px;margin:4px 0 12px"><code class="mono" style="flex:1;min-width:0;overflow-wrap:anywhere">'+esc(API_BASE.replace(/\/v1$/,"")+"/mcp")+'</code><button class="btn sm" id="apiCpMcp">Sao chép</button></div>'
   +'<div class="sub">Địa chỉ gốc:</div><div class="row" style="gap:6px;margin:4px 0 10px"><code class="mono" style="flex:1;min-width:0;overflow-wrap:anywhere">'+esc(API_BASE)+'</code><button class="btn sm" id="apiCpBase">Sao chép</button></div>'
   +'<div class="sub">Gửi khóa trong header <code>X-API-Key</code> (hoặc <code>Authorization: Bearer &lt;khóa&gt;</code>). Chỉ dùng GET.</div>'
   +'<div class="tw" style="margin-top:8px"><table><thead><tr><th>Đường dẫn</th><th>Dữ liệu</th></tr></thead><tbody>'
   +'<tr><td class="mono">GET /v1</td><td>Thông tin khóa và các loại dữ liệu được đọc</td></tr>'
   +Object.entries(API_RES).filter(([k])=>!API_W.includes(k)).map(([k,l])=>'<tr><td class="mono">GET /v1/'+k+'</td><td>'+esc(l)+'</td></tr>').join("")
   +'<tr><td class="mono">POST /v1/leads</td><td>Gửi nhu cầu khách hàng từ form, hệ thống khác (quyền "Gửi nhu cầu khách hàng")</td></tr>'
   +'<tr><td class="mono">POST /v1/farmbase-sync</td><td>Extension FarmBase gửi kết quả kiểm tra hồ sơ vùng (quyền "Đồng bộ FarmBase")</td></tr>'
   +'<tr><td class="mono">GET /v1/&lt;loại&gt;/&lt;id&gt;</td><td>Một bản ghi</td></tr></tbody></table></div>'
   +'<div class="sub" style="margin-top:8px">Tham số: <code>limit</code> (1 đến 1000, mặc định 500), <code>offset</code>, <code>updated_since</code> (ISO 8601, chỉ lấy bản ghi sửa từ thời điểm đó). Kết quả có <code>total</code> và <code>next_offset</code> để lấy trang tiếp. Tối đa 120 lượt mỗi phút cho mỗi khóa.</div>'
   +'<textarea id="apiEx" readonly rows="6" class="mono" style="width:100%;margin-top:8px">curl -H "X-API-Key: bvi_..." "'+esc(ex)+'"\n\n// JavaScript\nconst r = await fetch("'+esc(ex)+'", { headers: { "X-API-Key": "bvi_..." } });\nconst { data, total, next_offset } = await r.json();</textarea>'
   +'<div class="row" style="margin-top:6px"><button class="btn sm" id="apiCpEx">Sao chép ví dụ</button></div>'
   +'<div class="sub" style="margin-top:8px">Mã lỗi: 401 thiếu khóa, khóa sai, đã thu hồi hoặc hết hạn; 403 khóa không được đọc loại dữ liệu đó; 404 không có; 429 gọi quá nhanh.</div></div>';
  return fbsPanel()+h;
}
const API_PRESET=[["leads","Chỉ thu nhu cầu khách",["leads_write"]],["fb","Extension FarmBase",["farmbase_sync"]],["rep","Xem tiến độ vùng",["zones","tasks","events"]],["none","Bỏ chọn hết",[]]];
function apiScopeBoxes(sel){ const box=(k,l)=>'<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-apis="'+k+'"'+(sel.includes(k)?" checked":"")+'> '+esc(l)+'</label>';
  return '<div class="row" style="flex-wrap:wrap;gap:6px;margin:6px 0">'+API_PRESET.map(([k,l])=>'<button type="button" class="btn sm" data-apip="'+k+'">'+l+'</button>').join("")+'</div>'
   +'<div class="sub" style="margin-top:6px">Ghi vào hệ thống</div><div class="row" style="flex-wrap:wrap;gap:6px 14px;margin-top:4px">'+box("leads_write","Gửi nhu cầu khách hàng (form, website, hệ thống khác thêm nhu cầu mới; không đọc được gì)")+box("farmbase_sync","Đồng bộ FarmBase từ extension (chỉ ghi khối FarmBase của vùng; không đọc được gì)")+'</div>'
   +'<div class="sub" style="margin-top:8px">Đọc dữ liệu</div><div class="row" style="flex-wrap:wrap;gap:6px 14px;margin-top:4px">'+Object.entries(API_RES).filter(([k])=>!API_W.includes(k)).map(([k,l])=>box(k,l)).join("")+'</div>'
   +'<div class="sub" id="apiSum" style="margin-top:6px"></div>'; }
function apiBindScopes(){ const L=$("#layer"); const sum=()=>{ const p=apiPicked(), r=p.filter(x=>!API_W.includes(x)); const e=$("#apiSum"); if(e) e.textContent=!p.length?"Chưa chọn quyền nào.":(p.includes("leads_write")?"Được gửi nhu cầu khách hàng. ":"")+(p.includes("farmbase_sync")?"Được đồng bộ FarmBase. ":"")+(r.length?"Được đọc "+r.length+" loại dữ liệu.":"Không đọc được dữ liệu nào."); };
  L.querySelectorAll("[data-apip]").forEach(b=>b.addEventListener("click",()=>{ const want=API_PRESET.find(x=>x[0]===b.dataset.apip)[2]; L.querySelectorAll("[data-apis]").forEach(x=>x.checked=want.includes(x.dataset.apis)); sum(); }));
  L.querySelectorAll("[data-apis]").forEach(x=>x.addEventListener("change",sum)); sum(); }
function apiPicked(){ return [...$("#layer").querySelectorAll("[data-apis]")].filter(x=>x.checked).map(x=>x.dataset.apis); }
function openApiNew(){
  showDrawer('<div class="dh"><div><h2>Tạo khóa API</h2><div class="sub">Khóa chỉ hiện một lần sau khi tạo. Hãy gửi cho đối tác qua kênh riêng.</div></div><button class="btn sm" data-close>Đóng</button></div><div class="db">'
   +'<label>Tên đối tác hoặc mục đích<input id="apiN" maxlength="80" placeholder="Ví dụ: Yanning Hải Nam, đồng bộ báo cáo"></label>'
   +'<div style="margin-top:10px"><b>Quyền của khóa</b>'+apiScopeBoxes(["zones","tasks","events"])+'</div>'
   +'<label style="margin-top:10px">Thời hạn<select id="apiD"><option value="30">30 ngày</option><option value="90" selected>90 ngày</option><option value="365">1 năm</option><option value="0">Không hạn</option></select></label>'
   +'<div class="row" style="margin-top:14px"><button class="btn pri" id="apiGo">Tạo khóa</button><span class="sub" id="apiMsg"></span></div></div>');
  apiBindScopes();
  $("#apiGo").addEventListener("click",async()=>{ const b=$("#apiGo"); const name=$("#apiN").value.trim(), scopes=apiPicked();
    if(!name){ $("#apiMsg").textContent="Cần nhập tên"; return; } if(!scopes.length){ $("#apiMsg").textContent="Chọn ít nhất một quyền"; return; }
    b.disabled=true; $("#apiMsg").textContent="Đang tạo…"; const r=await callApiAdmin({action:"create",name,scopes,days:Number($("#apiD").value)});
    if(r.error){ b.disabled=false; $("#apiMsg").textContent=r.error; return; }
    APIK=null; loadApiKeys(); showApiKey(r.key,r.meta); });
}
function showApiKey(key,m){
  showDrawer('<div class="dh"><div><h2>Khóa API cho '+esc(m.name)+'</h2></div><button class="btn sm" data-close>Đóng</button></div><div class="db">'
   +'<div class="alert bad">Sao chép và lưu khóa ngay. Đóng cửa sổ này là không xem lại được. Mất khóa thì tạo khóa mới và thu hồi khóa cũ.</div>'
   +'<textarea id="apiKeyT" readonly rows="2" class="mono" style="width:100%;margin-top:10px">'+esc(key)+'</textarea>'
   +'<div class="row" style="margin-top:8px"><button class="btn pri" id="apiKeyC">Sao chép khóa</button></div>'
   +'<div class="sub" style="margin-top:10px">Địa chỉ gốc: <span class="mono">'+esc(API_BASE)+'</span></div></div>');
  $("#apiKeyC").addEventListener("click",()=>{ navigator.clipboard?.writeText(key).then(()=>toast("Đã sao chép khóa"),()=>{ $("#apiKeyT").select(); toast("Chọn và sao chép thủ công"); }); });
}
function openApiEdit(id){ const k=(APIK||[]).find(x=>x.id===id); if(!k) return;
  showDrawer('<div class="dh"><div><h2>Sửa quyền khóa</h2><div class="sub mono">'+esc(k.prefix)+'…</div></div><button class="btn sm" data-close>Đóng</button></div><div class="db">'
   +'<label>Tên<input id="apiN" maxlength="80" value="'+esc(k.name)+'"></label><div style="margin-top:10px"><b>Quyền của khóa</b>'+apiScopeBoxes(k.scopes||[])+'</div>'
   +'<div class="row" style="margin-top:14px"><button class="btn pri" id="apiSave">Lưu</button><span class="sub" id="apiMsg"></span></div></div>');
  apiBindScopes();
  $("#apiSave").addEventListener("click",async()=>{ const scopes=apiPicked(); if(!scopes.length){ $("#apiMsg").textContent="Chọn ít nhất một quyền"; return; }
    $("#apiMsg").textContent="Đang lưu…"; const r=await callApiAdmin({action:"update",id,name:$("#apiN").value.trim(),scopes}); if(r.error){ $("#apiMsg").textContent=r.error; return; }
    closeDrawer(); toast("Đã lưu"); loadApiKeys(); });
}
function bindApi(A){ bindFbs(A);
  $("#apiAdd")?.addEventListener("click",openApiNew);
  $("#apiRe")?.addEventListener("click",()=>{ APIK=null; render(); });
  const cp=t=>navigator.clipboard?.writeText(t).then(()=>toast("Đã sao chép"),()=>toast("Chọn và sao chép thủ công"));
  $("#apiCpBase")?.addEventListener("click",()=>cp(API_BASE)); $("#apiCpMcp")?.addEventListener("click",()=>cp(API_BASE.replace(/\/v1$/,"")+"/mcp")); $("#apiCpDoc")?.addEventListener("click",()=>cp("https://sfportal.github.io/bvi-dieu-hanh/api.html")); $("#apiCpEx")?.addEventListener("click",()=>cp($("#apiEx").value));
  A.querySelectorAll("[data-apied]").forEach(b=>b.addEventListener("click",()=>openApiEdit(b.dataset.apied)));
  const twice=(b,label,fn)=>b.addEventListener("click",async()=>{ if(b.dataset.arm!=="1"){ b.dataset.arm="1"; b.textContent=label; b.classList.add("bad"); setTimeout(()=>{ if(b.isConnected){ b.dataset.arm=""; render(); } },4000); return; } b.disabled=true; await fn(); });
  A.querySelectorAll("[data-apirv]").forEach(b=>twice(b,"Bấm lần nữa để thu hồi",async()=>{ const r=await callApiAdmin({action:"revoke",id:b.dataset.apirv}); toast(r.error||"Đã thu hồi, khóa không dùng được nữa"); loadApiKeys(); }));
  A.querySelectorAll("[data-apidel]").forEach(b=>twice(b,"Bấm lần nữa để xóa",async()=>{ const r=await callApiAdmin({action:"delete",id:b.dataset.apidel}); toast(r.error||"Đã xóa khóa"); loadApiKeys(); }));
}
/* ---------- Link báo cáo công khai cho khách: nhân sự soạn, quản lý duyệt và phát hành ---------- */
const SH_PUB="https://sfportal.github.io/bvi-dieu-hanh/bao-cao.html?t=";
let SHL=null;
async function callShare(body){
  try{ const {data}=await SB.auth.getSession(); const res=await fetch(SB_URL+"/functions/v1/share",{method:"POST",headers:{"Content-Type":"application/json",apikey:SB_KEY,Authorization:"Bearer "+(data.session?.access_token||"")},body:JSON.stringify(body)});
    let j=null; try{ j=await res.json(); }catch(_){} return j||{error:"http_"+res.status}; }catch(e){ return {error:"Không kết nối được máy chủ"}; } }
async function loadShl(){ if(!canManage()) return; const r=await callShare({action:"list"}); SHL=r.shares||[]; if(ui.view==="khach") softRender(); }
function shKey(){ return "d_"+custIds().slice().sort().join("_"); }
let SHD=null, SHDAt=0, SHDL=false;
async function loadShd(){ if(SHDL) return; SHDL=true; const r=await callShare({action:"drafts"}); SHDL=false; if(r.drafts){ SHD=r.drafts; SHDAt=Date.now(); softRender(); } else { SHD=SHD||{}; SHDAt=Date.now(); toast("Chưa tải được bản nháp gửi khách: "+(r.error||"lỗi")); } }
function shDraft(){ if(SHD===null||Date.now()-SHDAt>60000) loadShd(); return (SHD||{})[shKey()]||{}; }
function shLive(id,z){ const g=cGrp(z); return {prog:z.custNote||"",blk:z.blocker||"",rem:zRemain(id).join("\n")||(z.next||""),eta:g==="gacc"?(realCode(z)||""):(z.eta||"")}; }
function shVal(d,id,z,f){ const o=(d.z||{})[id]||{}; return o[f]!==undefined?o[f]:shLive(id,z)[f]; }
function shProg(id){ const ts=Object.values(S.tasks).filter(t=>t.zone===id&&t.kind!=="epic"); return {done:ts.filter(t=>t.status==="done").length,total:ts.length}; }
function shActs(zs){ const ids=new Set(zs.map(([id])=>id)); const zn=id=>zShort(S.zones[id]?.name||""); const now=Date.now(), out=[];
  Object.entries(S.tasks).forEach(([tid,t])=>{ if(!ids.has(t.zone)||t.status!=="done"||!t.doneAt) return; const d=new Date(t.doneAt); if(now-d>30*864e5) return;
    out.push({k:"d:"+tid,kind:"done",date:t.doneAt.slice(0,10),zone:zn(t.zone),text:tTitle(t,S.zones[t.zone])}); });
  const td=todayStr(), lim=new Date(now+60*864e5).toISOString().slice(0,10), cu=new Set(custIds());
  Object.entries(S.events||{}).forEach(([eid,e])=>{ if(!e.date||(e.end||e.date)<td||e.date>lim||!["draft","plan"].includes(e.status||"plan")) return;
    const zz=new Set(), tt=[]; if(e.zoneId&&ids.has(e.zoneId)) zz.add(e.zoneId); (e.taskIds||[]).forEach(tid=>{ const t=S.tasks[tid]; if(t&&ids.has(t.zone)){ zz.add(t.zone); const x=tTitle(t,S.zones[t.zone]); if(x&&!tt.includes(x)) tt.push(x); } });
    if(!zz.size&&!(e.unitId&&cu.has(e.unitId))) return;
    out.push({k:"e:"+eid,kind:"plan",date:e.date,end:e.end&&e.end!==e.date?e.end:"",time:e.time||"",place:e.place||"",st:e.status==="draft"?"Dự kiến":"Đã chốt",zone:[...zz].map(zn).join(", ")||"Chung",text:tt.length?(tt.slice(0,4).join("; ")+(tt.length>4?" và "+(tt.length-4)+" việc khác":"")):(e.title||"Làm việc tại vùng trồng")}); });
  return out.sort((a,b)=>a.kind===b.kind?(a.kind==="done"?b.date.localeCompare(a.date):a.date.localeCompare(b.date)):a.kind==="plan"?-1:1); }
const shSafe=v=>typeof v==="string"?v.replace(/(?:\+?84)?\d(?:[\s.\-]?\d){8,}/g,"•••"):Array.isArray(v)?v.map(shSafe):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,shSafe(x)])):v;
function shFb(){ const f=shDraft().fb||{}; const org=String(f.org||"").trim().slice(0,60), login=String(f.login||"").trim().slice(0,120); return f.on!==false&&org&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)?{org,login,url:"https://app.farmbase.vn/"}:null; }
// Báo cáo gửi khách không nhắc tên BVI: thay bằng "đơn vị triển khai" ở mọi chữ trong báo cáo, file Word, tóm tắt.
const noBviR=(m,o,str)=>/(^|[.!?:\n]\s*)$/.test(str.slice(0,o))?"Đơn vị triển khai":"đơn vị triển khai";
const noBvi=v=>typeof v==="string"?v.replace(/c[oô]ng\s+ty\s+(?:cp|c[oổ]\s*ph[aầ]n)\s+bvi\b/gi,noBviR).replace(/\bBVI\b/gi,noBviR):Array.isArray(v)?v.map(noBvi):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,noBvi(x)])):v;
function shSnap(){ const s=noBvi(shSafe(shSnap0())); s.fb=shFb(); return s; }
function fbDocx(){ const f=shFb(); if(!f) return "";
  return wH("Xem vùng trồng và truy xuất nguồn gốc (TXNG) trên FarmBase")
   +wTable([["Địa chỉ","https://app.farmbase.vn/"],["Mã tổ chức",{t:f.org,b:true}],["Email đăng nhập",{t:f.login,b:true}],["Mật khẩu","Gửi riêng qua Zalo. Vui lòng đổi mật khẩu ở lần đăng nhập đầu tiên."]].map(r=>[{t:r[0],b:true,fill:"E8EFE6"},typeof r[1]==="string"?{t:r[1],fill:"FFFFFF"}:{...r[1],fill:"FFFFFF"}]),[3200,11638]); }
function shSnap0(){ const d=shDraft(); const {zs,G,ha,multi}=custData(); const hideZ=id=>!!((d.z||{})[id]||{}).hide; const vis=zs.filter(([id])=>!hideZ(id));
  const groups=Object.keys(CGRP).map(g=>{ const L=G[g].filter(([id])=>!hideZ(id)); if(!L.length) return null;
    return {k:g,label:CGRP[g],crit:CGRP_CRIT[g],eta:g==="gacc"?"Đã có":g==="tbd"?"Chưa xác định":grpEta(L),n:L.length,ha:+ha(L).toFixed(2),
      zones:L.map(([id,z])=>{ const p=shProg(id); return {name:zShort(z.name),place:zPlace(z,multi),ha:+(+z.ha||0).toFixed(2),step:z.step??null,stepName:z.step!=null&&STEPS[z.step]?STEPS[z.step].name:"",status:custStatus(z),
        eta:shVal(d,id,z,"eta"),prog:shVal(d,id,z,"prog"),blk:shVal(d,id,z,"blk"),rem:String(shVal(d,id,z,"rem")||"").split("\n").map(s=>s.trim()).filter(Boolean),done:p.done,total:p.total}; })}; }).filter(Boolean);
  const hx=d.x||{}; const acts=shActs(vis).filter(a=>!hx[a.k]).map(({kind,date,end,time,place,st,zone,text})=>({kind,date,end,time,place,st,zone,text}));
  return {v:1,title:"Báo cáo tiến độ mã số vùng trồng",legal:custLegal(),date:dmy(todayStr()),at:new Date().toISOString(),intro:d.intro||"",n:vis.length,ha:+ha(vis).toFixed(2),groups,acts,
    note:"Các mốc là dự kiến. Mã nội địa do cơ quan nhà nước xét duyệt, mã GACC do phía Trung Quốc phê duyệt."}; }
async function shSave(patch){ const k=shKey(); const cur=shDraft(); const {token,pubAt,pubBy,...rest}={...cur,...patch}; const data={...rest,unitIds:custIds(),legal:custLegal()};
  SHD=SHD||{}; SHD[k]={...cur,...data,updatedAt:new Date().toISOString(),updatedBy:me||""}; softRender();
  const r=await callShare({action:"draft_save",key:k,data}); if(r.draft){ SHD[k]=r.draft; return true; } toast("Chưa lưu được bản nháp: "+(r.error||"lỗi")); return false; }
function shPanel(){ const d=shDraft(); const pub=d.token?SH_PUB+d.token:""; const s=pub&&SHL?SHL.find(x=>x.token===d.token):null; if(pub&&SHL===null&&canManage()) loadShl();
  const changed=d.token&&d.updatedAt&&d.pubAt&&d.updatedAt>d.pubAt;
  let h='<div class="panel" style="margin-top:12px;border-left:3px solid var(--brand)"><div class="row between" style="flex-wrap:wrap;gap:8px"><div style="min-width:0"><h2 style="margin:0">Link công khai cho khách</h2><div class="sub">Nhân sự soạn bản gửi khách, quản lý hoặc owner duyệt rồi phát hành. Khách chỉ thấy bản đã phát hành, không thấy bản nháp.</div>'
   +'<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">'+(pub?'<span class="pill good">Đã phát hành '+esc(d.pubAt?new Date(d.pubAt).toLocaleString("vi-VN"):"")+(d.pubBy?' · '+esc(d.pubBy):'')+'</span>':'<span class="pill">Chưa phát hành</span>')
   +(s?'<span class="pill">'+s.views+' lượt xem'+(s.lastView?' · gần nhất '+esc(new Date(s.lastView).toLocaleString("vi-VN")):'')+'</span>':'')
   +(d.review&&(!d.pubAt||d.review.at>d.pubAt)?'<span class="pill warn">Chờ duyệt · '+esc(pname(d.review.by)||"")+'</span>':'')+(changed?'<span class="pill warn">Bản nháp đã sửa sau lần phát hành</span>':'')+'</div></div>'
   +'<div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn'+(ui.shEdit?' pri':'')+'" id="shEdit">'+(ui.shEdit?'Xong, đóng soạn thảo':'Soạn bản gửi khách')+'</button>'
   +(canManage()?'<button class="btn pri" id="shPub">'+(pub?'Cập nhật bản phát hành':'Duyệt và phát hành')+'</button>':'<button class="btn" id="shAsk">Gửi quản lý duyệt</button>')+'</div></div>';
  if(pub) h+='<div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap"><a class="mono" href="'+esc(pub)+'" target="_blank" rel="noopener" style="flex:1;min-width:0;overflow-wrap:anywhere;color:var(--brand)">'+esc(pub)+'</a><button class="btn sm" id="shCopy">Sao chép link</button>'+(canManage()?'<button class="btn sm" id="shRevoke">Thu hồi link</button>':'')+'</div>';
  return h+'</div>'; }
function shEditor(){ const d=shDraft(); const {zs}=custData(); const z0=d.z||{};
  let h='<div class="panel" style="margin-top:12px"><h2>Lời nhắn đầu báo cáo</h2><div class="sub">Tóm tắt tuần hoặc lưu ý gửi khách. Không ghi số điện thoại, CCCD, số sổ đỏ, chi phí. Báo cáo gửi khách không nhắc tên BVI: chữ BVI tự đổi thành "đơn vị triển khai".</div><textarea id="shIntro" rows="3" style="width:100%;margin-top:6px" placeholder="Ví dụ: Tuần này BVI đã nộp hồ sơ cứng cho Phòng Kinh tế 3 vùng…">'+esc(d.intro||"")+'</textarea></div>';
  const fb=d.fb||{};
  h+='<div class="panel" style="margin-top:12px"><h2>Xem vùng trồng trên FarmBase</h2><div class="sub">Báo cáo sẽ có nút vào <b>app.farmbase.vn</b> kèm mã tổ chức và email đăng nhập của khách. <b>Không ghi mật khẩu ở đây.</b> Mật khẩu nhắn riêng cho khách qua Zalo, báo khách đổi mật khẩu ở lần đăng nhập đầu.</div>'
   +'<div class="f2" style="margin-top:8px"><div class="f"><label for="shFbOrg">Mã tổ chức</label><input id="shFbOrg" maxlength="60" autocomplete="off" value="'+esc(fb.org||"")+'"></div><div class="f"><label for="shFbLogin">Email đăng nhập của khách</label><input id="shFbLogin" type="email" maxlength="120" autocomplete="off" value="'+esc(fb.login||"")+'"></div></div>'
   +'<label class="chk" style="margin-top:6px"><input type="checkbox" id="shFbOn"'+(fb.on===false?'':' checked')+'><span>Hiện phần này trong báo cáo</span></label>'
   +((fb.org||fb.login)&&!shFb()&&fb.on!==false?'<div class="sub" style="color:var(--warn)">Cần đủ mã tổ chức và email hợp lệ thì báo cáo mới hiện phần này.</div>':'')+'</div>';
  h+='<div class="panel" style="margin-top:12px"><h2>Từng vùng</h2><div class="sub">Mặc định lấy từ hệ thống. Sửa ở đây chỉ đổi bản gửi khách, không đổi dữ liệu vùng. Bỏ tick "Hiện" để ẩn vùng khỏi báo cáo.</div>';
  zs.forEach(([id,z])=>{ const o=z0[id]||{}, live=shLive(id,z), p=shProg(id); const ed=["prog","blk","rem","eta"].some(f=>o[f]!==undefined&&o[f]!==live[f]);
    const fld=(f,lab,rows)=>'<div class="f"><label>'+lab+(o[f]!==undefined&&o[f]!==live[f]?' <span class="pill warn" style="font-size:11px">đã sửa</span>':'')+'</label>'+(rows?'<textarea rows="'+rows+'" data-shz="'+esc(id)+'" data-shf="'+f+'">'+esc(shVal(d,id,z,f))+'</textarea>':'<input data-shz="'+esc(id)+'" data-shf="'+f+'" value="'+esc(shVal(d,id,z,f))+'">')+'</div>';
    h+='<div style="border-top:1px solid var(--line);padding:12px 0'+(o.hide?';opacity:.55':'')+'"><div class="row between" style="flex-wrap:wrap;gap:6px"><div><b>'+esc(zShort(z.name))+'</b> <span class="sub">'+fmtHa(z.ha)+' ha · '+CGRP[cGrp(z)]+(p.total?' · việc xong '+p.done+'/'+p.total:'')+'</span></div><div class="row" style="gap:8px"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-shhide="'+esc(id)+'"'+(o.hide?'':' checked')+'> Hiện</label>'+(ed?'<button class="btn sm" data-shreset="'+esc(id)+'">Lấy lại từ hệ thống</button>':'')+'</div></div>'
      +(o.hide?'':'<div class="f2">'+fld("prog","Tiến độ",2)+fld("blk","Vướng mắc",2)+'</div><div class="f2">'+fld("rem","Việc còn lại (mỗi dòng một việc)",3)+fld("eta",cGrp(z)==="gacc"?"Mã nội địa":"Dự kiến có mã nội địa",0)+'</div>')+'</div>'; });
  h+='</div>';
  const acts=shActs(zs.filter(([id])=>!(z0[id]||{}).hide)), hx=d.x||{};
  h+='<div class="panel" style="margin-top:12px"><h2>Hoạt động đưa vào báo cáo</h2><div class="sub">Lịch triển khai, đi thực địa 60 ngày tới (gồm lịch đã duyệt và lịch nháp, khách thấy là "Đã chốt" hoặc "Dự kiến") và việc đã xong 30 ngày qua của các vùng trên. Bỏ tick mục không muốn khách thấy.</div>';
  if(!acts.length) h+='<div class="empty">Chưa có hoạt động.</div>';
  ["plan","done"].forEach(kd=>{ const L=acts.filter(a=>a.kind===kd); if(!L.length) return; h+='<h3 style="margin:12px 0 4px">'+(kd==="plan"?"Lịch triển khai sắp tới":"Đã hoàn thành")+'</h3>';
    L.forEach(a=>{ h+='<label style="display:flex;gap:8px;align-items:flex-start;padding:4px 0"><input type="checkbox" data-shx="'+esc(a.k)+'"'+(hx[a.k]?'':' checked')+'><span><span class="mono sub">'+dmy(a.date).slice(0,5)+(a.end?"–"+dmy(a.end).slice(0,5):"")+(a.time?" "+esc(a.time):"")+'</span> '+(a.st?'<span class="pill'+(a.st==="Đã chốt"?" good":"")+'">'+a.st+'</span> ':'')+'<b>'+esc(a.zone)+'</b>: '+esc(a.text)+(a.place?' <span class="sub">· '+esc(a.place)+'</span>':'')+'</span></label>'; }); });
  return h+'</div>';
}
function bindShare(){
  $("#shEdit")?.addEventListener("click",()=>{ ui.shEdit=!ui.shEdit; render(); });
  $("#shAsk")?.addEventListener("click",async()=>{ if(await shSave({review:{at:new Date().toISOString(),by:me||""}})) toast("Đã gửi quản lý duyệt"); });
  $("#shCopy")?.addEventListener("click",()=>{ const u=SH_PUB+shDraft().token; navigator.clipboard?.writeText(u).then(()=>toast("Đã sao chép link"),()=>toast("Chọn và sao chép thủ công")); });
  const b=$("#shPub"); b?.addEventListener("click",async()=>{ if(b.dataset.arm!=="1"){ b.dataset.arm="1"; b.textContent="Bấm lần nữa để phát hành cho khách"; setTimeout(()=>{ if(b.isConnected){ b.dataset.arm=""; render(); } },5000); return; }
    b.disabled=true; b.textContent="Đang phát hành…"; const d=shDraft(); const r=await callShare({action:"publish",key:shKey(),token:d.token||null,snap:shSnap()});
    if(r.error){ toast(r.error==="manager_only"?"Chỉ quản lý hoặc owner phát hành được":"Chưa phát hành được: "+r.error); render(); return; }
    SHD=SHD||{}; SHD[shKey()]=r.draft||{...d,token:r.token,pubAt:r.at,pubBy:r.by}; SHL=null; render(); toast("Đã phát hành. Gửi link cho khách."); });
  const rv=$("#shRevoke"); rv?.addEventListener("click",async()=>{ if(rv.dataset.arm!=="1"){ rv.dataset.arm="1"; rv.textContent="Bấm lần nữa để thu hồi"; setTimeout(()=>{ if(rv.isConnected){ rv.dataset.arm=""; render(); } },5000); return; }
    rv.disabled=true; const r=await callShare({action:"revoke",token:shDraft().token,key:shKey()}); if(r.error){ toast(r.error); render(); return; } SHD=SHD||{}; SHD[shKey()]=r.draft||{...shDraft(),token:"",pubAt:"",pubBy:""}; render(); SHL=null; toast("Đã thu hồi, link cũ không mở được nữa"); });
  $("#shIntro")?.addEventListener("change",e=>shSave({intro:e.target.value.slice(0,2000)}));
  const fbSave=()=>shSave({fb:{org:($("#shFbOrg")?.value||"").trim().slice(0,60),login:($("#shFbLogin")?.value||"").trim().slice(0,120),on:!!$("#shFbOn")?.checked}});
  ["#shFbOrg","#shFbLogin","#shFbOn"].forEach(k=>$(k)?.addEventListener("change",fbSave));
  document.querySelectorAll("[data-shf]").forEach(el=>el.addEventListener("change",()=>{ const d=shDraft(), id=el.dataset.shz, f=el.dataset.shf; const z=JSON.parse(JSON.stringify(d.z||{})); const o=z[id]||(z[id]={}); const live=shLive(id,S.zones[id])[f];
    if(el.value===live) delete o[f]; else o[f]=el.value.slice(0,2000); shSave({z}); }));
  document.querySelectorAll("[data-shhide]").forEach(el=>el.addEventListener("change",()=>{ const z=JSON.parse(JSON.stringify(shDraft().z||{})); const id=el.dataset.shhide; (z[id]||(z[id]={})).hide=!el.checked; if(!z[id].hide) delete z[id].hide; shSave({z}); }));
  document.querySelectorAll("[data-shreset]").forEach(el=>el.addEventListener("click",()=>{ const z=JSON.parse(JSON.stringify(shDraft().z||{})); const id=el.dataset.shreset; z[id]=z[id]?.hide?{hide:true}:{}; shSave({z}); }));
  document.querySelectorAll("[data-shx]").forEach(el=>el.addEventListener("change",()=>{ const x={...(shDraft().x||{})}; if(el.checked) delete x[el.dataset.shx]; else x[el.dataset.shx]=true; shSave({x}); }));
}

/* ---------- Thu chi: chụp chứng từ thanh toán, tự đọc dữ liệu ---------- */
const EX_CO=[["salefronts","Salefronts"],["bvi","BVI"],["annong","HTX An Nông"],["other","Khác"]], EX_COL=Object.fromEntries(EX_CO);
let EXL=null, EXM=todayStr().slice(0,7), EXF={co:"",st:"",who:""}, EXBUSY=false;
function canRecon(){ return (typeof canManage==="function"&&canManage())||!!(PROFILE&&PROFILE.role!=="viewer"&&typeof me!=="undefined"&&me&&S.people[me]?.canRecon===true); }
function canExp(){ return isOwner()||!!(typeof me!=="undefined"&&me&&S.people[me]?.canExpense===true); }
function canExpView(){ return canExp()||canFin(); }
async function callExp(body){
  try{ const {data}=await SB.auth.getSession(); const res=await fetch(SB_URL+"/functions/v1/expense",{method:"POST",headers:{"Content-Type":"application/json",apikey:SB_KEY,Authorization:"Bearer "+(data.session?.access_token||"")},body:JSON.stringify(body)});
    let j=null; try{ j=await res.json(); }catch(_){} return j||{error:"http_"+res.status}; }catch(e){ return {error:"Không kết nối được máy chủ"}; } }
async function loadExp(){ if(EXBUSY) return; EXBUSY=true; const r=await callExp({action:"list",month:EXM}); EXBUSY=false; EXL=r.rows?r:{rows:[],err:r.error||"Lỗi"}; if(ui.view==="thu-chi") softRender(); }
const exVnd=n=>(Number(n)||0).toLocaleString("vi-VN")+" đ";
const exCo=r=>r.company==="other"?(r.companyOther||"Khác"):(EX_COL[r.company]||"?");
const exDmy=d=>d?d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4):"";
const EX_CAM='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';
function exShot(id,big){ return '<label class="btn pri" style="display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;'+(big?'padding:16px;font-size:17px;width:100%;box-sizing:border-box':'')+'">'+EX_CAM+'<span>Chụp hoặc chọn ảnh chứng từ</span><input type="file" accept="image/*" data-exfile id="'+id+'" hidden></label>'; }
function exQuick(){ return canExp()?'<div class="panel" style="margin-bottom:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:180px"><b>Thu chi</b><div class="sub">Vừa chuyển hoặc nhận tiền? Chụp ảnh là ghi xong.</div></div>'+exShot("exFileQ")+'</div>':""; }
function exRows(){ const rows=(EXL?.rows||[]); return rows.filter(r=>(!EXF.co||r.company===EXF.co)&&(!EXF.st||(EXF.st==="ok"?!!r.checkedAt:!r.checkedAt))&&(!EXF.who||r.by===EXF.who)); }
function vExp(){
  if(!canExpView()) return '<div class="panel">Tài khoản chưa được cấp quyền ghi thu chi. Nhờ owner bật trong Tài khoản.</div>';
  if(EXL===null) setTimeout(loadExp,0);
  const rv=!!EXL?.reviewer, rows=exRows();
  let h='<div class="row" style="justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:10px"><div><h1 style="margin:0">Thu chi</h1><div class="sub">'+(rv?'Tất cả phiếu thu chi của nhân sự. Bấm vào phiếu để xem ảnh, sửa hoặc đánh dấu đã kiểm.':'Phiếu bạn đã ghi. Sau khi kế toán kiểm sẽ khóa sửa.')+'</div></div></div>';
  if(canExp()) h+='<div style="margin-bottom:8px">'+exShot("exFile",true)+'</div><div style="text-align:center;margin-bottom:14px"><button class="btn sm" id="exManual">Ghi tay, không có ảnh</button></div>';
  const who=rv?[...new Map((EXL?.rows||[]).map(r=>[r.by,r.byName])).entries()]:[];
  h+='<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px"><input type="month" id="exM" value="'+EXM+'" aria-label="Tháng" style="width:auto">'
    +'<select id="exFc" aria-label="Công ty"><option value="">Mọi công ty</option>'+EX_CO.map(([k,l])=>'<option value="'+k+'"'+(EXF.co===k?" selected":"")+'>'+l+'</option>').join("")+'</select>'
    +'<select id="exFs" aria-label="Trạng thái"><option value="">Mọi trạng thái</option><option value="wait"'+(EXF.st==="wait"?" selected":"")+'>Chờ kiểm</option><option value="ok"'+(EXF.st==="ok"?" selected":"")+'>Đã kiểm</option></select>'
    +(who.length>1?'<select id="exFw" aria-label="Người ghi"><option value="">Mọi người ghi</option>'+who.map(([k,n])=>'<option value="'+k+'"'+(EXF.who===k?" selected":"")+'>'+esc(n||"")+'</option>').join("")+'</select>':'')+'</div>';
  if(EXL===null) return h+'<div class="panel sub">Đang tải…</div>';
  if(EXL.err) return h+'<div class="panel">Không tải được: '+esc(EXL.err)+' <button class="btn sm" id="exRe">Thử lại</button></div>';
  const sum={}; rows.forEach(r=>{ const k=exCo(r); const o=sum[k]||(sum[k]={in:0,out:0,n:0,w:0}); o[r.type==="in"?"in":"out"]+=Number(r.amount)||0; o.n++; if(!r.checkedAt) o.w++; });
  if(rows.length) h+='<div class="tw panel" style="margin-bottom:12px"><table><thead><tr><th>Công ty</th><th style="text-align:right">Chi</th><th style="text-align:right">Thu</th><th style="text-align:right">Phiếu</th><th style="text-align:right">Chờ kiểm</th></tr></thead><tbody>'
    +Object.entries(sum).map(([k,o])=>'<tr><td><b>'+esc(k)+'</b></td><td style="text-align:right;white-space:nowrap">'+exVnd(o.out)+'</td><td style="text-align:right;white-space:nowrap">'+exVnd(o.in)+'</td><td style="text-align:right">'+o.n+'</td><td style="text-align:right">'+(o.w||"")+'</td></tr>').join("")+'</tbody></table></div>';
  if(!rows.length) return h+'<div class="panel sub">Chưa có phiếu nào trong tháng này.</div>';
  h+='<div style="display:grid;gap:8px">'+rows.map(r=>'<button class="panel" data-exid="'+r.id+'" style="text-align:left;display:grid;gap:4px;cursor:pointer;width:100%;font:inherit;color:inherit">'
    +'<div class="row" style="justify-content:space-between;gap:8px;flex-wrap:nowrap"><span class="row" style="gap:6px;flex-wrap:wrap"><span class="pill '+(r.type==="in"?"good":"bad")+'">'+(r.type==="in"?"Thu":"Chi")+'</span><span class="pill">'+esc(exCo(r))+'</span>'+(r.checkedAt?'<span class="pill good">Đã kiểm</span>':'<span class="pill warn">Chờ kiểm</span>')+(r.img?'':'<span class="pill">Không ảnh</span>')+'</span><b style="white-space:nowrap;font-size:16px">'+exVnd(r.amount)+'</b></div>'
    +'<div>'+esc(r.note||r.content||"")+'</div>'
    +'<div class="sub">'+exDmy(r.date)+(r.time?" "+esc(r.time):"")+((r.payer||r.payee)?' · '+esc(r.payer||"?")+' → '+esc(r.payee||"?"):'')+(rv?' · ghi bởi '+esc(r.byName||""):'')+'</div></button>').join("")+'</div>';
  return h;
}
function exShrink(f){ return new Promise((ok,no)=>{ const url=URL.createObjectURL(f), img=new Image();
  img.onload=()=>{ try{ const m=1800, s=Math.min(1,m/Math.max(img.naturalWidth,img.naturalHeight)); const c=document.createElement("canvas"); c.width=Math.round(img.naturalWidth*s); c.height=Math.round(img.naturalHeight*s); const g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,c.width,c.height); g.drawImage(img,0,0,c.width,c.height); ok(c.toDataURL("image/jpeg",0.85)); }catch(e){ no(e); } finally{ URL.revokeObjectURL(url); } };
  img.onerror=()=>{ URL.revokeObjectURL(url); no(new Error("Không mở được ảnh")); }; img.src=url; }); }
function exGuess(f){ const n=s=>(typeof norm==="function"?norm(s||""):String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/đ/g,"d"));
  const hit=s=>{ s=n(s); return /salefront/.test(s)?"salefronts":/\bbvi\b/.test(s)?"bvi":/an nong/.test(s)?"annong":""; };
  const a=hit(f.payer), b=hit(f.payee); return a?{company:a,type:"out"}:b?{company:b,type:"in"}:{}; }
async function exPick(file){ if(!file) return; if(!canExp()){ toast("Chưa có quyền ghi thu chi"); return; }
  let data; try{ data=await exShrink(file); }catch(e){ toast(e.message||"Không mở được ảnh"); return; }
  openExp(null,{data}); }
function openExp(id,o){ o=o||{}; const old=id?(EXL?.rows||[]).find(r=>r.id===id):null; const rv=!!EXL?.reviewer;
  const st={id:old?.id||"",img:old?.img||"",ocr:"",saved:false,type:old?.type||"out",company:old?.company||"",uploading:!!o.data,touched:{}};
  const can=!old||isOwner()||(rv&&canExp())||(old.by===EXL?.me&&!old.checkedAt);
  const v=k=>esc(old?.[k]??"");
  const dis=can?"":" disabled";
  showDrawer('<div class="dh"><div><h2>'+(old?(old.type==="in"?"Phiếu thu":"Phiếu chi"):"Ghi thu chi")+'</h2><div class="sub">'+(old?'Ghi bởi '+esc(old.byName||"")+' lúc '+esc(new Date(old.at).toLocaleString("vi-VN"))+(old.checkedAt?' · đã kiểm bởi '+esc(old.checkedBy||""):''):'Kiểm lại số tiền, chọn công ty rồi bấm Lưu.')+'</div></div><button class="btn sm" data-close>Đóng</button></div><div class="db">'
   +(o.data||old?.img?'<div id="exImgBox" style="text-align:center"><img id="exImg" alt="Ảnh chứng từ" style="max-width:100%;max-height:240px;border-radius:8px;border:1px solid var(--line);cursor:zoom-in;background:#fff"'+(o.data?' src="'+o.data+'"':'')+'></div>':'')
   +'<div id="exSt" class="sub" aria-live="polite">'+(o.data?'Đang tải ảnh và đọc chứng từ…':'')+'</div>'
   +'<div class="f"><label>Loại</label><div class="row" style="gap:6px"><button class="btn" data-ext="out" style="flex:1">Chi ra</button><button class="btn" data-ext="in" style="flex:1">Thu vào</button></div></div>'
   +'<div class="f"><label>Chứng từ cho công ty</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">'+EX_CO.map(([k,l])=>'<button class="btn" data-exco="'+k+'">'+l+'</button>').join("")+'</div><input id="exCoO" placeholder="Tên công ty, đơn vị khác" maxlength="80" value="'+v("companyOther")+'"'+dis+' style="display:none;margin-top:6px"></div>'
   +'<div class="f"><label for="exAmt">Số tiền (đồng)</label><input id="exAmt" inputmode="numeric" autocomplete="off" placeholder="0" style="font-size:20px;font-weight:700" value="'+(old?.amount?Number(old.amount).toLocaleString("vi-VN"):"")+'"'+dis+'></div>'
   +'<div class="f"><label for="exNote">Ghi chú ngắn: chi gì, cho việc gì</label><textarea id="exNote" rows="2" maxlength="300" placeholder="Ví dụ: Tạm ứng xăng xe đi Krông Pắc"'+dis+'>'+v("note")+'</textarea></div>'
   +'<div class="f2"><div class="f"><label for="exDate">Ngày</label><input type="date" id="exDate" value="'+(old?.date||todayStr())+'"'+dis+'></div><div class="f"><label for="exRef">Mã giao dịch</label><input id="exRef" maxlength="60" value="'+v("ref")+'"'+dis+'></div></div>'
   +'<div class="f2"><div class="f"><label for="exPayer">Người chuyển</label><input id="exPayer" maxlength="120" value="'+v("payer")+'"'+dis+'></div><div class="f"><label for="exPayee">Người nhận</label><input id="exPayee" maxlength="120" value="'+v("payee")+'"'+dis+'></div></div>'
   +'<div class="f"><label for="exCont">Nội dung chuyển khoản</label><input id="exCont" maxlength="300" value="'+v("content")+'"'+dis+'></div>'
   +'<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:4px">'+(can?'<button class="btn pri" id="exSave" style="flex:1;min-width:140px;padding:12px">Lưu</button>':'')
   +(old&&rv?'<button class="btn" id="exChk">'+(old.checkedAt?'Bỏ đã kiểm':'Đánh dấu đã kiểm')+'</button>':'')
   +(old&&(isOwner()||(old.by===EXL?.me&&!old.checkedAt))?'<button class="btn" id="exDel">Xóa</button>':'')+'</div><div class="sub" id="exMsg"></div></div>');
  const D=$("#layer .drawer"); const q=s=>D.querySelector(s);
  const paint=()=>{ D.querySelectorAll("[data-ext]").forEach(b=>{ const on=b.dataset.ext===st.type; b.classList.toggle("pri",on); b.setAttribute("aria-pressed",on); });
    D.querySelectorAll("[data-exco]").forEach(b=>{ const on=b.dataset.exco===st.company; b.classList.toggle("pri",on); b.setAttribute("aria-pressed",on); });
    q("#exCoO").style.display=st.company==="other"?"":"none";
    const sv=q("#exSave"); if(sv){ sv.disabled=st.uploading; sv.textContent=st.uploading?"Đang tải ảnh…":"Lưu"; } };
  if(can){ D.querySelectorAll("[data-ext]").forEach(b=>b.addEventListener("click",()=>{ st.type=b.dataset.ext; st.touched.type=1; paint(); }));
    D.querySelectorAll("[data-exco]").forEach(b=>b.addEventListener("click",()=>{ st.company=b.dataset.exco; st.touched.company=1; paint(); if(st.company==="other") q("#exCoO").focus(); })); }
  ["exPayer","exPayee","exCont","exRef","exDate","exAmt","exNote"].forEach(k=>q("#"+k)?.addEventListener("input",()=>st.touched[k]=1));
  q("#exAmt")?.addEventListener("input",e=>{ const d=e.target.value.replace(/\D/g,"").slice(0,13); e.target.value=d?Number(d).toLocaleString("vi-VN"):""; });
  q("#exImg")?.addEventListener("click",()=>{ const s=q("#exImg").src; if(s){ const w=window.open(); if(w){ w.document.write('<title>Chứng từ</title><body style="margin:0;background:#222"><img src="'+s+'" style="max-width:100%;display:block;margin:auto">'); w.document.close(); } } });
  if(old?.img) callExp({action:"image",id:old.id}).then(r=>{ if(r.url&&q("#exImg")) q("#exImg").src=r.url; else if(q("#exImgBox")) q("#exImgBox").innerHTML='<div class="sub">Không mở được ảnh</div>'; });
  paint();
  D.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>{ if(!st.saved&&!old&&st.img) callExp({action:"discard",img:st.img}); }));
  $("#layer .scrim")?.addEventListener("click",()=>{ if(!st.saved&&!old&&st.img) callExp({action:"discard",img:st.img}); });
  if(o.data){ callExp({action:"ocr",image:o.data,mime:"image/jpeg"}).then(r=>{ st.uploading=false;
    if(!r.ok){ q("#exSt").textContent="Không tải được ảnh: "+(r.error||"lỗi")+". Vẫn ghi tay được."; paint(); return; }
    st.id=r.id; st.img=r.img; st.ocr=r.ocr;
    const f=r.fields||{}, set=(k,val)=>{ const el=q("#"+k); if(el&&val&&!st.touched[k]&&!el.value) el.value=val; };
    if(r.ocr==="ok"){ set("exAmt",f.amount?Number(f.amount).toLocaleString("vi-VN"):""); if(f.date&&!st.touched.exDate) q("#exDate").value=f.date; set("exPayer",f.payer); set("exPayee",f.payee); set("exCont",f.content); set("exRef",f.ref);
      if(!st.touched.exNote&&!q("#exNote").value&&f.content) q("#exNote").placeholder=f.content;
      st.fx={time:f.time||"",payerBank:f.payerBank||"",payeeBank:f.payeeBank||""};
      const g=exGuess(f); if(g.company&&!st.touched.company) st.company=g.company; if(g.type&&!st.touched.type) st.type=g.type;
      q("#exSt").innerHTML='<span class="pill good">Đã tự điền</span> Kiểm lại số tiền và người nhận trước khi lưu.'; }
    else q("#exSt").textContent=r.ocr==="no_key"?"Ảnh đã tải. Chưa bật đọc tự động, vui lòng nhập số tiền và thông tin.":r.ocr==="not_payment"?"Ảnh không giống chứng từ thanh toán. Kiểm tra lại hoặc nhập tay.":"Chưa đọc được ảnh, vui lòng nhập tay.";
    paint(); }); }
  q("#exSave")?.addEventListener("click",async()=>{ const b=q("#exSave"), m=q("#exMsg");
    const body={action:"save",id:st.id,img:st.img,ocr:st.ocr,type:st.type,company:st.company,companyOther:q("#exCoO").value,amount:q("#exAmt").value.replace(/\D/g,""),date:q("#exDate").value,ref:q("#exRef").value,payer:q("#exPayer").value,payee:q("#exPayee").value,content:q("#exCont").value,note:q("#exNote").value.trim()||(old?"":q("#exCont").value.trim()),...(old?{time:old.time,payerBank:old.payerBank,payeeBank:old.payeeBank}:(st.fx||{}))};
    if(!body.company){ m.textContent="Chọn chứng từ dùng cho công ty nào"; return; }
    if(!Number(body.amount)){ m.textContent="Nhập số tiền"; q("#exAmt").focus(); return; }
    b.disabled=true; m.textContent="Đang lưu…"; const r=await callExp(body); b.disabled=false;
    if(!r.ok){ m.textContent="Chưa lưu được: "+(r.error==="locked"?"phiếu đã kiểm, không sửa được":r.error||"lỗi"); return; }
    st.saved=true; toast("Đã lưu phiếu "+(body.type==="in"?"thu":"chi")); closeDrawer();
    if(EXL?.rows){ const i=EXL.rows.findIndex(x=>x.id===r.rec.id); if(i>=0) EXL.rows[i]=r.rec; else if((r.rec.date||"").startsWith(EXM)) EXL.rows.unshift(r.rec); }
    if(ui.view==="thu-chi") softRender(); else location.hash="thu-chi"; });
  q("#exChk")?.addEventListener("click",async()=>{ const r=await callExp({action:"review",id:old.id,ok:!old.checkedAt}); if(!r.ok){ q("#exMsg").textContent=r.error||"Lỗi"; return; } Object.keys(old).forEach(k=>delete old[k]); Object.assign(old,r.rec); closeDrawer(); softRender(); });
  q("#exDel")?.addEventListener("click",async e=>{ const b=e.target; if(b.dataset.sure!=="1"){ b.dataset.sure="1"; b.textContent="Bấm lần nữa để xóa"; return; }
    const r=await callExp({action:"delete",id:old.id}); if(!r.ok){ q("#exMsg").textContent=r.error==="locked"?"Phiếu đã kiểm, không xóa được":r.error||"Lỗi"; return; }
    EXL.rows=EXL.rows.filter(x=>x.id!==old.id); toast("Đã xóa phiếu"); closeDrawer(); softRender(); });
}
function bindExpFile(A){ A.querySelectorAll("[data-exfile]").forEach(i=>i.addEventListener("change",e=>{ const f=e.target.files[0]; e.target.value=""; exPick(f); })); }
function bindExp(A){ bindExpFile(A);
  $("#exManual")?.addEventListener("click",()=>openExp(null,{}));
  $("#exRe")?.addEventListener("click",()=>{ EXL=null; render(); });
  $("#exM")?.addEventListener("change",e=>{ if(/^\d{4}-\d{2}$/.test(e.target.value)){ EXM=e.target.value; EXL=null; render(); } });
  $("#exFc")?.addEventListener("change",e=>{ EXF.co=e.target.value; render(); });
  $("#exFs")?.addEventListener("change",e=>{ EXF.st=e.target.value; render(); });
  $("#exFw")?.addEventListener("change",e=>{ EXF.who=e.target.value; render(); });
  A.querySelectorAll("[data-exid]").forEach(b=>b.addEventListener("click",()=>openExp(b.dataset.exid))); }

/* ---------- Đối soát việc: một trang cho quản lý (hoặc nhân sự được cấp quyền) thấy việc xong/chưa và chỗ lệch giữa báo cáo nhanh, lịch, công việc, tiến độ vùng, hồ sơ cứng ---------- */
let RC={w:null,who:"",grp:"",showAck:false,zOpen:false,mode:"",dr:"30",ds:"open",dw:"",all:false,dg:"zone"};
// Trang quản lý chỉ tập trung vùng ưu tiên 1, 2 (bật "Tất cả vùng" để xem hết)
const rcZOk=zid=>RC.all||!!(zid&&S.zones[zid]&&isFocus(S.zones[zid]));
const rcTOk=x=>rcZOk(x.zone);
const rcEOk=e=>RC.all||rcZOk(e.zoneId)||(e.taskIds||[]).some(k=>S.tasks[k]&&rcTOk(S.tasks[k]));
const RC_GRP={task:"Công việc",ev:"Lịch",daily:"Báo cáo nhanh",zone:"Vùng, hồ sơ"};
const RC_T={
  task_late:["task","Việc quá hạn","bad"],
  ev_past:["ev","Lịch đã qua, chưa chốt","warn"],
  ev_task:["ev","Lịch xong, việc chưa xong","bad"],
  ev_miss:["ev","Lịch xong, thiếu minh chứng","warn"],
  daily_miss:["daily","Thiếu báo cáo nhanh","warn"],
  daily_zone:["daily","Báo cáo nhắc vùng, việc chưa cập nhật","warn"],
  zone_hard:["zone","Bước vùng đi trước hồ sơ cứng","bad"],
  zone_doc:["zone","Đã nộp, hồ sơ chưa lên Drive, FarmBase","warn"],
  zone_fb:["zone","Ô F lệch với FarmBase (extension)","warn"],
  zone_idle:["zone","Vùng không còn việc mở","warn"],
  zone_stale:["zone","Vùng lâu không cập nhật","warn"]};
function rcAck(rec,type,sig){ const a=rec?.rc?.[type]; return a&&a.sig===sig?a:null; }
function rcWeek(){ return RC.w||wkStart(todayStr()); }
function rcIssues(){
  const w0=rcWeek(), w1=addDays(w0,6), t=todayStr(), past=w1<t?w1:addDays(t,-1), out=[];
  const T=Object.entries(S.tasks).filter(([id,x])=>x.kind!=="epic"&&!tOpenKids(id)&&rcTOk(x));
  const zn=id=>S.zones[id]?zShort(S.zones[id].name):"";
  const add=(type,o)=>out.push({type,grp:RC_T[type][0],sev:RC_T[type][2],...o});
  // 1. việc quá hạn (đến hết tuần đang xem)
  T.forEach(([id,x])=>{ if(x.status==="done"||!x.due||x.due>=t||x.due>w1) return; const sig=x.due+"|"+x.status;
    add("task_late",{id:"tl:"+id,col:"tasks",rid:id,who:x.R||"",date:x.due,sig,ack:rcAck(x,"task_late",sig),text:tTitle(x,S.zones[x.zone])+(x.zone?" · "+zn(x.zone):""),sub:"Hạn "+dm(x.due)+" · "+(TSTAT[x.status]||x.status)+" · trễ "+diffDays(t,x.due)+" ngày",open:["task",id],fix:"done"}); });
  // 2-4. lịch
  Object.entries(S.events||{}).forEach(([id,e])=>{ const d=e.date; if(!d||d<w0||d>w1||!rcEOk(e)) return; const end=e.end||d; const who=e.lead||(e.people||[])[0]||"";
    if(["draft","plan"].includes(e.status||"plan")&&end<=past){ const sig=e.status+"|"+end;
      add("ev_past",{id:"ep:"+id,col:"events",rid:id,who,date:d,sig,ack:rcAck(e,"ev_past",sig),text:e.title||"(chưa có tên)",sub:dm(d)+(e.status==="draft"?" · còn là lịch nháp":" · chưa đánh dấu xong, chưa ghi kết quả"),open:["ev",id]}); }
    if(e.status==="done"){ const op=(e.taskIds||[]).filter(k=>S.tasks[k]&&S.tasks[k].status!=="done");
      if(op.length){ const sig=op.slice().sort().join(",");
        add("ev_task",{id:"et:"+id,col:"events",rid:id,who,date:d,sig,ack:rcAck(e,"ev_task",sig),text:e.title||"",sub:dm(d)+" đã xong, còn "+op.length+" việc chưa tick: "+op.slice(0,3).map(k=>tTitle(S.tasks[k],S.zones[S.tasks[k].zone])).join("; ")+(op.length>3?"…":""),open:["ev",id],fix:"evtasks",tids:op}); }
      const m=evMissing(e); if(m.length){ const sig=m.join(",");
        add("ev_miss",{id:"em:"+id,col:"events",rid:id,who,date:d,sig,ack:rcAck(e,"ev_miss",sig),text:e.title||"",sub:dm(d)+" · thiếu "+m.join(", "),open:["ev",id]}); } } });
  // 5. thiếu báo cáo nhanh
  Object.keys(S.people).filter(isReporter).forEach(pid=>{ const p=S.people[pid]; const miss=[]; let d=w0;
    for(let i=0;i<7;i++,d=addDays(d,1)){ if(d>past) break; if(new Date(d+"T00:00:00").getDay()===0) continue; if(S.daily[d+"_"+pid]||onLeave(pid,d)) continue; if((p.rcDaily||{})[d]&&!RC.showAck) continue; miss.push(d); }
    if(miss.length){ const sig=miss.join(","); const ackd=miss.every(x=>(p.rcDaily||{})[x]);
      add("daily_miss",{id:"dm:"+pid+":"+w0,col:"people",rid:pid,who:pid,date:miss[0],sig,ack:ackd?{at:(p.rcDaily||{})[miss[0]].at,by:(p.rcDaily||{})[miss[0]].by}:null,dates:miss,text:"Chưa gửi báo cáo nhanh "+miss.length+" ngày",sub:miss.map(dm).join(", "),open:["rep",pid]}); } });
  // 6. báo cáo nhắc tên vùng nhưng không có việc nào của vùng được cập nhật quanh ngày đó
  const ZN=Object.entries(S.zones).filter(([zid,z])=>z.active!==false&&z.step!=null&&rcZOk(zid)).map(([id,z])=>[id,norm(zShort(z.name))]).filter(([,n])=>n.length>=4);
  Object.entries(S.daily).forEach(([did,r])=>{ if(!r.date||r.date<w0||r.date>w1) return; const txt=" "+norm((r.done||"")+" "+(r.loc||""))+" ";
    ZN.forEach(([zid,n])=>{ const re=new RegExp("(^|[^a-z0-9])"+n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"($|[^a-z0-9])"); if(!re.test(txt)) return;
      const lo=addDays(r.date,-1), hi=addDays(r.date,2)+"T23"; const z=S.zones[zid];
      const touched=T.some(([,x])=>x.zone===zid&&((x.updatedAt||"").slice(0,10)>=lo&&(x.updatedAt||"")<=hi||(x.doneAt||"").slice(0,10)>=lo&&(x.doneAt||"")<=hi))||((z.updatedAt||"").slice(0,10)>=lo&&(z.updatedAt||"")<=hi);
      if(touched) return; const sig=zid;
      add("daily_zone",{id:"dz:"+did+":"+zid,col:"daily",rid:did,who:r.person,date:r.date,sig,ack:rcAck(r,"daily_zone",zid)||(r.rc?.["daily_zone:"+zid]||null),akey:"daily_zone:"+zid,text:"Báo cáo "+dm(r.date)+" nhắc "+zShort(z.name)+", chưa có việc nào của vùng được cập nhật",sub:"“"+String(r.done||"").replace(/\s+/g," ").slice(0,140)+"”",open:["zone",zid]}); }); });
  // 7-10. vùng và hồ sơ
  Object.entries(S.zones).forEach(([zid,z])=>{ if(z.active===false||z.step==null||!rcZOk(zid)) return; const s=hsStat(z); const own=z.owner||"";
    const zt=T.filter(([,x])=>x.zone===zid), op=zt.filter(([,x])=>x.status!=="done");
    if(z.step>=5&&s.hard<s.n){ const sig=z.step+"|"+s.hard;
      add("zone_hard",{id:"zh:"+zid,col:"zones",rid:zid,who:own,date:"",sig,ack:rcAck(z,"zone_hard",sig),text:zShort(z.name)+": bước "+z.step+" ("+STEPS[z.step].name+") nhưng hồ sơ cứng mới "+s.hard+"/"+s.n,sub:"Sau bước 4 (ký hồ sơ) cần đủ bản cứng. Kiểm tra lại bước hoặc ghi nhận hồ sơ.",open:["hs",zid]}); }
    if(z.step>=6&&s.ok<s.n&&!(z.step>=5&&s.hard<s.n)){ const sig=z.step+"|"+s.ok;
      add("zone_doc",{id:"zd:"+zid,col:"zones",rid:zid,who:own,date:"",sig,ack:rcAck(z,"zone_doc",sig),text:zShort(z.name)+": đã ở bước "+z.step+", hồ sơ hoàn tất "+s.ok+"/"+s.n,sub:"Drive "+s.drive+"/"+s.n+" · FarmBase "+s.fb+"/"+s.n,open:["hs",zid]}); }
    const fd=fbsDiff(z); if(fd.length){ const sig=fd.map(x=>x.join(":")).join(",")+"|"+(z.fbs?.ranAt||""); const nm=k=>(HS.find(x=>x[0]===k)||[,k,k])[2];
      add("zone_fb",{id:"zf:"+zid,col:"zones",rid:zid,who:own,date:"",sig,ack:rcAck(z,"zone_fb",sig),text:zShort(z.name)+": ô F lệch với FarmBase",sub:fd.map(([k,t])=>nm(k)+(t==="tick"?": app ghi đã nhập, FarmBase còn thiếu":": FarmBase đã đủ, app chưa tick F")).join(" · ")+" · đồng bộ "+fbWhen(z.fbs?.syncedAt),open:["hs",zid]}); }
    if(z.step<8&&zt.length&&!op.length){ const sig=z.step+"|"+zt.length;
      add("zone_idle",{id:"zi:"+zid,col:"zones",rid:zid,who:own,date:"",sig,ack:rcAck(z,"zone_idle",sig),text:zShort(z.name)+": bước "+z.step+", mọi việc đã xong",sub:"Tăng bước nếu đã đạt, hoặc giao việc cho bước tiếp theo.",open:["zone",zid]}); }
    if(z.step<6&&op.length){ const last=[z.updatedAt||"",...zt.map(([,x])=>x.updatedAt||"")].sort().pop()||""; if(last&&last.slice(0,10)<addDays(t,-14)){ const sig=last.slice(0,10);
      add("zone_stale",{id:"zs:"+zid,col:"zones",rid:zid,who:own,date:"",sig,ack:rcAck(z,"zone_stale",sig),text:zShort(z.name)+": "+diffDays(t,last.slice(0,10))+" ngày chưa có cập nhật",sub:"Còn "+op.length+" việc mở · bước "+z.step+" ("+STEPS[z.step].name+")",open:["zone",zid]}); } } });
  return out;
}
function rcPersonOf(i){ if(i.who) return i.who; if(i.col==="zones"){ const op=Object.values(S.tasks).filter(x=>x.zone===i.rid&&x.status!=="done"&&x.R); return op[0]?.R||""; } return ""; }
function rcWeekStats(){ const w0=rcWeek(), w1=addDays(w0,6), t=todayStr(), past=w1<t?w1:addDays(t,-1);
  const T=Object.entries(S.tasks).filter(([id,x])=>x.kind!=="epic"&&!tOpenKids(id)&&rcTOk(x));
  const due=T.filter(([,x])=>x.due&&x.due>=w0&&x.due<=w1), dueDone=due.filter(([,x])=>x.status==="done");
  const doneW=T.filter(([,x])=>(x.doneAt||"").slice(0,10)>=w0&&(x.doneAt||"").slice(0,10)<=w1);
  const late=T.filter(([,x])=>x.status!=="done"&&x.due&&x.due<t);
  const ev=Object.entries(S.events||{}).filter(([,e])=>e.date&&e.date>=w0&&e.date<=w1&&e.status!=="cancel"&&rcEOk(e)), evDone=ev.filter(([,e])=>e.status==="done");
  const reps=Object.keys(S.people).filter(isReporter); let need=0,got=0; let d=w0;
  for(let i=0;i<7;i++,d=addDays(d,1)){ if(d>past) break; if(new Date(d+"T00:00:00").getDay()===0) continue; reps.forEach(p=>{ if(onLeave(p,d)) return; need++; if(S.daily[d+"_"+p]) got++; }); }
  return {w0,w1,t,past,T,due,dueDone,doneW,late,ev,evDone,reps,need,got}; }
function rcBar(a,b){ const p=b?Math.round(a/b*100):0; return '<div style="height:6px;background:var(--line);border-radius:3px;margin-top:6px;overflow:hidden"><div style="height:100%;width:'+p+'%;background:'+(p>=80?"var(--good)":p>=50?"var(--warn)":"var(--bad)")+'"></div></div>'; }
// Hồ sơ từng vùng: bấm ô để đổi bản cứng (Chưa có → Đủ → Thiếu), ghi chú hồ sơ của vùng
function rcHsBlock(zid){ const z=S.zones[zid]; if(!z) return ""; const s=hsStat(z);
  return '<div style="margin-top:8px"><div class="row between" style="gap:6px"><span class="sub">Hồ sơ: bản cứng '+s.hard+'/'+s.n+' · Drive '+s.drive+'/'+s.n+' · FarmBase '+s.fb+'/'+s.n+'</span><button class="btn sm" data-rchd="'+zid+'">Chi tiết hồ sơ</button></div>'+fbsLine(z)
   +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px;margin-top:6px">'+HS.map(([k,l,sh])=>{ const x=hsItem(z,k), h=x.hard||"";
     const on={c:h==="ok"||h==="na",d:!!x.drive||h==="na",f:!!x.fb||h==="na"}, part=h==="part";
     const bt=(f,lab,tip)=>'<button type="button" data-rchc="'+zid+'|'+k+'|'+f+'" aria-label="'+esc(sh+": "+tip)+'" title="'+esc(tip)+'" style="width:32px;height:30px;border-radius:6px;border:1px solid '+(on[f]?"var(--good)":f==="c"&&part?"var(--warn)":"var(--line)")+';background:'+(on[f]?"var(--good)":f==="c"&&part?"var(--warn)":"var(--surface)")+';color:'+(on[f]||(f==="c"&&part)?"#fff":"var(--muted)")+';font:700 13px/1 ui-monospace,monospace;cursor:pointer;padding:0">'+lab+'</button>';
     return '<div title="'+esc(l+(x.holder?" · "+hsHolder(x.holder)+" giữ":""))+'" style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;min-width:0;background:'+(hsDone(x)?"color-mix(in srgb,var(--good) 10%,transparent)":"var(--surface)")+'"><div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(sh)+'</div>'
      +'<div class="row" style="gap:4px;flex-wrap:nowrap;margin-top:4px">'+bt("c","C","Bản cứng: "+HSHARD[h]+". Bấm để đổi")+bt("d","D","Drive: "+(on.d?"đã có":"chưa có"))+bt("f","F","FarmBase: "+(on.f?"đã nhập":"chưa nhập"))+'</div>'
      +'<div class="sub" style="font-size:11px;margin-top:3px">'+esc(h==="na"?"Không cần":"Cứng: "+HSHARD[h].toLowerCase())+'</div></div>'; }).join("")+'</div>'
   +'<textarea data-rchn="'+zid+'" rows="2" maxlength="600" placeholder="Ghi chú hồ sơ: thiếu gì, ai đang giữ, hẹn ngày bổ sung…" style="width:100%;margin-top:6px;box-sizing:border-box">'+esc(z.hsNote||"")+'</textarea>'
   +(z.hsNoteAt?'<div class="sub" style="font-size:11px">Ghi chú sửa '+dm(z.hsNoteAt.slice(0,10))+(z.hsNoteBy?' bởi '+esc(pname(z.hsNoteBy)):'')+'</div>':'')+'</div>'; }
function rcModeBar(){ return '<div class="row between" style="gap:8px;margin-bottom:12px"><div class="focusbar" role="group" aria-label="Chế độ xem">'+[["","Đối soát theo tuần"],["due","Việc đến hạn"]].map(([k,l])=>'<button data-rcm="'+k+'" aria-pressed="'+(RC.mode===k)+'">'+l+'</button>').join("")+'</div>'
  +'<div class="focusbar" role="group" aria-label="Phạm vi vùng"><button data-rcall="" aria-pressed="'+(!RC.all)+'">Vùng ưu tiên 1, 2</button><button data-rcall="1" aria-pressed="'+RC.all+'">Tất cả</button></div></div>'; }
function rcZoneTasks(zid,skip){
  // mọi việc khác của vùng (ngoài các việc đã hiện ở trên) để đối chiếu
  const t=todayStr(), sk=new Set(skip||[]);
  const L=Object.entries(S.tasks).filter(([id,x])=>x.zone===zid&&x.kind!=="epic"&&!sk.has(id));
  const op=L.filter(([,x])=>x.status!=="done").sort((a,b)=>(a[1].due||"9").localeCompare(b[1].due||"9"));
  const dn=L.filter(([,x])=>x.status==="done").sort((a,b)=>(b[1].doneAt||"").localeCompare(a[1].doneAt||""));
  const all=[...op,...dn], open=(RC.ztOpen||{})[zid];
  const row=([id,x])=>{ const late=x.status!=="done"&&x.due&&x.due<t;
    const pill=x.status==="done"?'<span class="pill good">Xong'+(x.doneAt?' '+dm(x.doneAt.slice(0,10)):'')+'</span>':late?'<span class="pill bad">Trễ '+diffDays(t,x.due)+' ngày</span>':'<span class="pill">'+esc(TSTAT[x.status]||x.status||"Chưa làm")+'</span>';
    return '<div style="border:1px solid var(--line);border-radius:8px;padding:6px 10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap'+(x.status==="done"?';opacity:.75':'')+'"><div style="flex:1;min-width:200px"><div style="font-weight:600;overflow-wrap:anywhere">'+esc(tTitle(x,S.zones[zid]))+'</div><div class="sub">'+(x.due?'Hạn '+dm(x.due):'Chưa có hạn')+' · '+esc(pname(x.R)||"Chưa giao")+'</div></div><div class="row" style="gap:6px">'+pill+'<button class="btn sm" data-rcot="'+id+'">Mở</button></div></div>'; };
  return '<details style="margin-top:6px" data-rczt="'+zid+'"'+(open?' open':'')+'><summary class="sub" style="cursor:pointer">Mọi việc khác của vùng: '+op.length+' chưa xong · '+dn.length+' đã xong</summary>'
    +(all.length?'<div style="display:grid;gap:6px;margin-top:6px">'+all.map(row).join("")+'</div>':'<div class="sub" style="margin-top:6px">Vùng chưa có việc nào khác.</div>')+'</details>';
}
function vDueToday(){
  const t=todayStr(), end=RC.de==="wk"?addDays(wkStart(t),6):t, from=RC.dr==="7"?wkStart(t):RC.dr==="30"?addDays(t,-30):"";
  const all=Object.entries(S.tasks).filter(([id,x])=>x.kind!=="epic"&&!tOpenKids(id)&&x.due&&x.due<=end&&(!from||x.due>=from)&&(!RC.dw||x.R===RC.dw)&&rcTOk(x));
  const dDone=x=>(x.doneAt||"").slice(0,10);
  const open=all.filter(([,x])=>x.status!=="done"), late=open.filter(([,x])=>x.due<t), dueNow=open.filter(([,x])=>x.due===t), soon=open.filter(([,x])=>x.due>t);
  const done=all.filter(([,x])=>x.status==="done"), onTime=done.filter(([,x])=>!dDone(x)||dDone(x)<=x.due), doneLate=done.filter(([,x])=>dDone(x)&&dDone(x)>x.due);
  // giữ nguyên thứ tự khi cập nhật trong trang, chỉ sắp lại khi đổi bộ lọc hoặc bấm Sắp xếp lại
  const sig=[RC.dr,RC.ds,RC.dw,RC.dg,RC.all,RC.de].join("|"); if(!RC.ord||RC.ord.sig!==sig) RC.ord={sig,ids:null,zs:null};
  const pos=(arr,k)=>{ const i=arr?arr.indexOf(k):-1; return i<0?1e9:i; };
  const L0=(RC.ds==="open"?open:RC.ds==="late"?doneLate:all).slice().sort((a,b)=>(a[1].status==="done")-(b[1].status==="done")||a[1].due.localeCompare(b[1].due));
  const L=RC.ord.ids?L0.sort((a,b)=>pos(RC.ord.ids,a[0])-pos(RC.ord.ids,b[0])):L0;
  RC.ord.ids=[...(RC.ord.ids||[]),...L.map(r=>r[0]).filter(k=>!(RC.ord.ids||[]).includes(k))];
  const ppl=[...new Set(Object.values(S.tasks).filter(x=>x.kind!=="epic"&&x.R).map(x=>x.R))].filter(p=>S.people[p]).sort((a,b)=>pname(a).localeCompare(pname(b),"vi"));
  const pct=done.length+open.length?Math.round(onTime.length/(all.length)*100):0;
  let h='<div><h1>'+(RC.de==="wk"?'Việc đến hết tuần':'Việc đến hôm nay')+'</h1><div class="sub">Việc của '+(RC.all?'mọi vùng':'vùng ưu tiên 1, 2')+', có hạn từ '+(from?dm(from):"trước đến nay")+(RC.de==="wk"?' đến hết Chủ nhật '+dm(end):' đến hôm nay '+dm(t))+'. Việc chưa xong mà qua hạn là trễ.</div></div>';
  h+='<div class="row" style="gap:6px;margin-top:10px"><div class="focusbar" role="group" aria-label="Hạn đến">'+[["","Đến hôm nay"],["wk","Đến hết tuần"]].map(([k,l])=>'<button data-rcde="'+k+'" aria-pressed="'+((RC.de||"")===k)+'">'+l+'</button>').join("")+'</div><div class="focusbar" role="group" aria-label="Khoảng hạn">'+[["7","Tuần này"],["30","30 ngày"],["all","Tất cả"]].map(([k,l])=>'<button data-rcdr="'+k+'" aria-pressed="'+(RC.dr===k)+'">'+l+'</button>').join("")+'</div>'
   +'<select id="rcDw" aria-label="Người thực hiện"><option value="">Mọi người</option>'+ppl.map(p=>'<option value="'+p+'"'+(RC.dw===p?" selected":"")+'>'+esc(pname(p))+'</option>').join("")+'</select><div class="focusbar" role="group" aria-label="Cách xem"><button data-rcdg="zone" aria-pressed="'+(RC.dg==="zone")+'">Theo vùng</button><button data-rcdg="" aria-pressed="'+(RC.dg!=="zone")+'">Danh sách</button></div></div>';
  const tile=(v,l,cls,k)=>'<button class="tile '+cls+'" data-rcds="'+k+'"'+(RC.ds===k?' style="outline:2px solid var(--brand)"':'')+'><span class="v">'+v+'</span><span class="l">'+l+'</span></button>';
  h+='<div class="grid kpis" style="margin-top:12px">'+tile(open.length,'Chưa xong'+(late.length?' · '+late.length+' trễ':'')+(dueNow.length?' · '+dueNow.length+' hạn hôm nay':'')+(soon.length?' · '+soon.length+' hạn tới cuối tuần':''),open.length?"bad":"good","open")
   +tile(doneLate.length,'Xong nhưng trễ hạn',doneLate.length?"warn":"good","late")+tile(all.length,'Tổng việc đến hạn · '+pct+'% xong đúng hạn',"","all")+'</div>';
  if(!L.length) return h+'<div class="empty" style="margin-top:12px">Không có việc nào trong bộ lọc này.</div>';
  const st=x=>{ if(x.status!=="done") return x.due<t?'<span class="pill bad">Trễ '+diffDays(t,x.due)+' ngày</span>':x.due===t?'<span class="pill warn">Hạn hôm nay</span>':'<span class="pill">Còn '+diffDays(x.due,t)+' ngày</span>';
    const d=dDone(x); return d&&d>x.due?'<span class="pill warn">Xong trễ '+diffDays(d,x.due)+' ngày</span>':'<span class="pill good">Xong đúng hạn</span>'; };
  const zn=x=>x.zone&&S.zones[x.zone]?zShort(S.zones[x.zone].name):"";
  const card=([id,x],noZone)=>'<div style="border:1px solid var(--line);border-left:4px solid var(--'+(x.status!=="done"?(x.due<t?"bad":x.due===t?"warn":"line"):(dDone(x)>x.due?"warn":"good"))+');border-radius:8px;padding:8px 12px;background:var(--surface);display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
    +'<div style="flex:1;min-width:220px"><div style="font-weight:600;overflow-wrap:anywhere">'+esc(tTitle(x,S.zones[x.zone]))+'</div><div class="sub">Hạn '+dm(x.due)+(!noZone&&zn(x)?' · '+esc(zn(x)):'')+' · '+esc(pname(x.R)||"Chưa giao")+' · '+(TSTAT[x.status]||x.status)+(x.status==="done"&&dDone(x)?' ngày '+dm(dDone(x)):'')+'</div></div>'
    +'<div class="row" style="gap:6px">'+st(x)+'<button class="btn sm" data-rcot="'+id+'">Mở</button>'+(x.status!=="done"?'<button class="btn sm" data-rcdone="'+id+'">Xong</button>':'')+'</div></div>';
  if(RC.dg==="zone"){ const G={}; L.forEach(r=>{ const k=r[1].zone||"_"; (G[k]=G[k]||[]).push(r); });
    const ks=Object.keys(G).sort((a,b)=>{ const la=G[a].filter(([,x])=>x.status!=="done"&&x.due<t).length, lb=G[b].filter(([,x])=>x.status!=="done"&&x.due<t).length; return lb-la||(S.zones[a]?.priority||"9").localeCompare(S.zones[b]?.priority||"9"); });
    if(RC.ord.zs) ks.sort((a,b)=>pos(RC.ord.zs,a)-pos(RC.ord.zs,b)); RC.ord.zs=[...(RC.ord.zs||[]),...ks.filter(k=>!(RC.ord.zs||[]).includes(k))];
    h+='<div class="row between" style="margin:12px 0 6px;gap:6px"><span class="sub">'+L.length+' việc ở '+ks.length+' vùng</span><button class="btn sm" data-rcresort>Sắp xếp lại</button></div>';
    ks.forEach(k=>{ const z=S.zones[k], Lz=G[k], lt=Lz.filter(([,x])=>x.status!=="done"&&x.due<t).length;
      h+='<div class="panel" style="margin-top:8px;padding:10px 12px"><div class="row between" style="gap:6px;margin-bottom:8px"><div style="min-width:0">'+(z?'<button class="btn sm" style="border:0;background:none;padding:0;font-weight:700;font-size:15px;text-align:left" data-rcz="'+k+'">'+esc(zShort(z.name))+'</button><div class="sub">'+esc(PRI[z.priority]||"")+(z.step!=null?' · Bước '+z.step+': '+esc(STEPS[z.step]?.name||""):'')+(z.eta?' · dự kiến mã '+esc(etaShort(z.eta)):'')+' · hồ sơ cứng '+hsStat(z).hard+'/'+hsStat(z).n+'</div>':'<b>Việc chung, không gắn vùng</b>')+'</div>'
        +'<div class="row" style="gap:6px">'+(lt?'<span class="pill bad">'+lt+' việc trễ</span>':'<span class="pill good">Không trễ</span>')+(z?'<button class="btn sm pri" data-rcnew="'+k+'">+ Việc</button>':'')+'</div></div><div style="display:grid;gap:6px">'+Lz.map(r=>card(r,true)).join("")+'</div>'+(z?'<details style="margin-top:8px" data-rchso="'+k+'"'+((RC.hsOpen||{})[k]?' open':'')+'><summary class="sub" style="cursor:pointer">Hồ sơ của vùng: bản cứng '+hsStat(z).hard+'/'+hsStat(z).n+(z.hsNote?' · có ghi chú':'')+'</summary>'+rcHsBlock(k)+'</details>'+rcZoneTasks(k,Lz.map(r=>r[0])):'')+'</div>'; });
    return h; }
  h+='<div class="row between" style="margin:12px 0 6px;gap:6px"><span class="sub">'+L.length+' việc</span><button class="btn sm" data-rcresort>Sắp xếp lại</button></div><div style="display:grid;gap:6px">'+L.map(([id,x])=>'<div style="border:1px solid var(--line);border-left:4px solid var(--'+(x.status!=="done"?(x.due<t?"bad":x.due===t?"warn":"line"):(dDone(x)>x.due?"warn":"good"))+');border-radius:8px;padding:8px 12px;background:var(--surface);display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
    +'<div style="flex:1;min-width:220px"><div style="font-weight:600;overflow-wrap:anywhere">'+esc(tTitle(x,S.zones[x.zone]))+'</div><div class="sub">Hạn '+dm(x.due)+(zn(x)?' · '+esc(zn(x)):'')+' · '+esc(pname(x.R)||"Chưa giao")+' · '+(TSTAT[x.status]||x.status)+(x.status==="done"&&dDone(x)?' ngày '+dm(dDone(x)):'')+'</div></div>'
    +'<div class="row" style="gap:6px">'+st(x)+'<button class="btn sm" data-rcot="'+id+'">Mở</button>'+(x.status!=="done"?'<button class="btn sm" data-rcdone="'+id+'">Xong</button>':'')+'</div></div>').join("")+'</div>';
  return h;
}
function vRecon(){
  if(!canRecon()) return '<div class="panel">Bạn chưa được cấp quyền Đối soát việc. Nhờ owner bật trong trang Tài khoản.</div>';
  if(RC.mode==="due") return rcModeBar()+vDueToday();
  return rcModeBar()+vRecon0();
}
function vRecon0(){
  const st=rcWeekStats(), all=rcIssues(), open=all.filter(i=>!i.ack);
  const pick=all.filter(i=>(RC.showAck||!i.ack)&&(!RC.grp||i.grp===RC.grp)&&(!RC.who||rcPersonOf(i)===RC.who));
  let h='<div class="row between" style="align-items:flex-end;gap:10px"><div><h1>Đối soát việc</h1><div class="sub">Việc xong hay chưa, và chỗ báo cáo nhanh, lịch, công việc, tiến độ vùng, hồ sơ cứng chưa khớp. Kiểm với nhân sự rồi sửa ngay tại đây.</div></div>'
   +'<div class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn sm" id="rcPrev" aria-label="Tuần trước">‹</button><b style="white-space:nowrap">'+dm(st.w0)+' – '+dm(st.w1)+'</b><button class="btn sm" id="rcNext" aria-label="Tuần sau">›</button>'+(st.w0!==wkStart(todayStr())?'<button class="btn sm" id="rcNow">Tuần này</button>':'')+'</div></div>';
  const tile=(v,l,cls,extra,act)=>'<'+(act?'button data-rcg="'+act+'"':'div')+' class="tile '+(cls||"")+'"><span class="v">'+v+'</span><span class="l">'+l+'</span>'+(extra||"")+'</'+(act?'button':'div')+'>';
  h+='<div class="grid kpis" style="margin-top:12px">'
   +tile(st.dueDone.length+'/'+st.due.length,'Việc đến hạn trong tuần đã xong',st.due.length&&st.dueDone.length===st.due.length?"good":"",rcBar(st.dueDone.length,st.due.length))
   +tile(st.late.length,'Việc đang quá hạn',st.late.length?"bad":"good","","task")
   +tile(st.evDone.length+'/'+st.ev.length,'Lịch trong tuần đã chốt',"",rcBar(st.evDone.length,st.ev.length),"ev")
   +tile(st.got+'/'+st.need,'Báo cáo nhanh đã gửi',st.need&&st.got<st.need?"warn":"good",rcBar(st.got,st.need),"daily")
   +tile(open.length,'Điểm cần đối soát',open.length?"warn":"good","","")
   +'</div>';
  // nhân sự trong tuần
  const ppl=[...new Set([...st.reps,...open.map(rcPersonOf).filter(Boolean)])].filter(p=>S.people[p]).sort((a,b)=>pname(a).localeCompare(pname(b),"vi"));
  const PR=ppl.map(p=>{ const du=st.due.filter(([,x])=>x.R===p), dd=du.filter(([,x])=>x.status==="done").length, dw=st.doneW.filter(([,x])=>x.R===p).length, lt=st.late.filter(([,x])=>x.R===p).length;
     const ev=st.ev.filter(([,e])=>e.lead===p||(e.people||[]).includes(p)), ed=ev.filter(([,e])=>e.status==="done").length;
     let need=0,got=0,d=st.w0; if(isReporter(p)) for(let i=0;i<7;i++,d=addDays(d,1)){ if(d>st.past) break; if(new Date(d+"T00:00:00").getDay()===0||onLeave(p,d)) continue; need++; if(S.daily[d+"_"+p]) got++; }
     return {p,du:du.length,dd,dw,lt,ev:ev.length,ed,need,got,n:open.filter(i=>rcPersonOf(i)===p).length}; });
  h+='<style>@media (max-width:700px){.rcT{display:none}}@media (min-width:701px){.rcC{display:none}}</style>';
  h+='<div class="panel rcC" style="margin-top:12px"><h2>Theo nhân sự</h2><div style="display:grid;gap:8px">'+PR.map(r=>'<div style="border:1px solid var(--line);border-radius:8px;padding:8px 10px'+(RC.who===r.p?';background:var(--chip)':'')+'"><div class="row between" style="gap:6px"><button class="btn sm" style="border:0;background:none;padding:0;font-weight:700" data-rcw="'+r.p+'">'+esc(pname(r.p))+'</button>'+(r.n?'<button class="btn sm" data-rcmsg="'+r.p+'">Sao chép tin nhắc</button>':'')+'</div>'
    +'<div class="row" style="gap:4px;margin-top:6px"><span class="pill">Việc tuần '+r.dd+'/'+r.du+'</span><span class="pill'+(r.lt?" bad":"")+'">Quá hạn '+r.lt+'</span><span class="pill">Lịch '+r.ed+'/'+r.ev+'</span>'+(isReporter(r.p)?'<span class="pill'+(r.need&&r.got<r.need?" warn":"")+'">Báo cáo '+r.got+'/'+r.need+'</span>':'')+'<span class="pill '+(r.n?"warn":"good")+'">Lệch '+r.n+'</span></div></div>').join("")+'</div></div>';
  h+='<div class="panel tw rcT" style="margin-top:12px"><h2>Theo nhân sự</h2><table><thead><tr><th>Nhân sự</th><th class="n">Việc tuần xong</th><th class="n">Xong trong tuần</th><th class="n">Quá hạn</th><th class="n">Lịch chốt</th><th class="n">Báo cáo nhanh</th><th class="n">Cần đối soát</th><th></th></tr></thead><tbody>'
   +ppl.map(p=>{ const du=st.due.filter(([,x])=>x.R===p), dd=du.filter(([,x])=>x.status==="done"), dw=st.doneW.filter(([,x])=>x.R===p).length, lt=st.late.filter(([,x])=>x.R===p).length;
     const ev=st.ev.filter(([,e])=>e.lead===p||(e.people||[]).includes(p)), ed=ev.filter(([,e])=>e.status==="done").length;
     let need=0,got=0,d=st.w0; if(isReporter(p)) for(let i=0;i<7;i++,d=addDays(d,1)){ if(d>st.past) break; if(new Date(d+"T00:00:00").getDay()===0||onLeave(p,d)) continue; need++; if(S.daily[d+"_"+p]) got++; }
     const n=open.filter(i=>rcPersonOf(i)===p).length;
     return '<tr'+(RC.who===p?' style="background:var(--chip)"':'')+'><td><button class="btn sm" style="border:0;background:none;padding:0;font-weight:600;text-align:left" data-rcw="'+p+'">'+esc(pname(p))+'</button></td><td class="n">'+dd.length+'/'+du.length+'</td><td class="n">'+dw+'</td><td class="n" style="'+(lt?"color:var(--bad);font-weight:700":"")+'">'+lt+'</td><td class="n">'+ed+'/'+ev.length+'</td><td class="n" style="'+(need&&got<need?"color:var(--warn);font-weight:700":"")+'">'+(isReporter(p)?got+'/'+need:'—')+'</td><td class="n">'+(n?'<span class="pill warn">'+n+'</span>':'<span class="pill good">0</span>')+'</td><td>'+(n?'<button class="btn sm" data-rcmsg="'+p+'">Sao chép tin nhắc</button>':'')+'</td></tr>'; }).join("")+'</tbody></table></div>';
  // danh sách điểm lệch
  const cnt=g=>open.filter(i=>(!g||i.grp===g)&&(!RC.who||rcPersonOf(i)===RC.who)).length;
  h+='<div class="panel" style="margin-top:12px"><div class="row between" style="gap:8px"><h2 style="margin:0">Cần đối soát'+(RC.who?' · '+esc(pname(RC.who))+' <button class="btn sm" id="rcWhoX">Bỏ lọc</button>':'')+'</h2><label class="chk" style="padding:0"><input type="checkbox" id="rcAckT"'+(RC.showAck?" checked":"")+'><span>Hiện mục đã kiểm</span></label></div>'
   +'<div class="focusbar" role="group" aria-label="Loại" style="margin-top:8px;flex-wrap:wrap">'+[["","Tất cả"],...Object.entries(RC_GRP)].map(([k,l])=>'<button data-rcg="'+k+'" aria-pressed="'+(RC.grp===k)+'">'+l+' ('+cnt(k)+')</button>').join("")+'</div>';
  if(!pick.length) h+='<div class="empty" style="margin-top:10px">Không có điểm nào cần đối soát'+(RC.grp||RC.who?' trong bộ lọc này':' trong tuần này')+'.</div>';
  else { const by={}; pick.forEach(i=>{ const k=rcPersonOf(i)||"_"; (by[k]=by[k]||[]).push(i); });
    Object.keys(by).sort((a,b)=>(a==="_")-(b==="_")||pname(a).localeCompare(pname(b),"vi")).forEach(k=>{ const L=by[k].sort((a,b)=>(a.sev==="bad"?0:1)-(b.sev==="bad"?0:1)||(a.date||"").localeCompare(b.date||""));
      h+='<div class="row between" style="margin:14px 0 6px;gap:8px"><b>'+(k==="_"?"Chưa rõ người phụ trách":esc(pname(k)))+' · '+L.filter(i=>!i.ack).length+' điểm</b>'+(k!=="_"&&L.some(i=>!i.ack)?'<button class="btn sm" data-rcmsg="'+k+'">Sao chép tin nhắc</button>':'')+'</div><div style="display:grid;gap:8px">'
       +L.map(i=>'<div class="rcI" style="border:1px solid var(--line);border-left:4px solid var(--'+(i.ack?"line":i.sev)+');border-radius:8px;padding:10px 12px;background:var(--surface);'+(i.ack?"opacity:.6":"")+'"><div class="row" style="gap:6px"><span class="pill '+i.sev+'">'+RC_T[i.type][1]+'</span>'+(i.ack?'<span class="pill good">Đã kiểm'+(i.ack.by?' · '+esc(pname(i.ack.by)||""):"")+'</span>':'')+'</div>'
         +'<div style="margin-top:4px;font-weight:600;overflow-wrap:anywhere">'+esc(i.text)+'</div><div class="sub" style="overflow-wrap:anywhere">'+esc(i.sub||"")+'</div>'
         +'<div class="row" style="gap:6px;margin-top:8px"><button class="btn sm" data-rco="'+esc(i.id)+'">'+({task:"Mở việc",ev:"Mở lịch",hs:"Mở hồ sơ",zone:"Mở vùng",rep:"Xem báo cáo"}[i.open[0]])+'</button>'
         +(i.fix==="done"&&!i.ack?'<button class="btn sm" data-rcf="'+esc(i.id)+'">Đánh dấu xong</button>':'')+(i.fix==="evtasks"&&!i.ack?'<button class="btn sm" data-rcf="'+esc(i.id)+'">Tick xong '+i.tids.length+' việc</button>':'')
         +(i.ack?'<button class="btn sm" data-rcu="'+esc(i.id)+'">Bỏ đã kiểm</button>':'<button class="btn sm" data-rca="'+esc(i.id)+'">Đã kiểm, đúng</button>')+'</div></div>').join("")+'</div>'; }); }
  h+='</div>';
  // tiến độ vùng và hồ sơ
  const zs=Object.entries(S.zones).filter(([id,z])=>z.active!==false&&z.step!=null&&rcZOk(id));
  const flags={}; open.filter(i=>i.grp==="zone"||i.open[0]==="zone").forEach(i=>{ const zid=i.col==="zones"?i.rid:i.open[1]; flags[zid]=(flags[zid]||0)+1; });
  const rows=zs.map(([id,z])=>{ const s=hsStat(z), op=Object.entries(S.tasks).filter(([tid,x])=>x.zone===id&&x.kind!=="epic"&&x.status!=="done"&&!tOpenKids(tid)), lt=op.filter(([,x])=>tLate(x)).length; const last=[z.updatedAt||"",...Object.values(S.tasks).filter(x=>x.zone===id).map(x=>x.updatedAt||"")].sort().pop()||""; return {id,z,s,op:op.length,lt,last,f:flags[id]||0}; }).sort((a,b)=>b.f-a.f||b.lt-a.lt||(b.z.step||0)-(a.z.step||0));
  h+='<details class="panel" style="margin-top:12px"'+(RC.zOpen?" open":"")+' id="rcZ"><summary style="cursor:pointer"><b>Tiến độ và hồ sơ từng vùng</b> <span class="sub">'+zs.length+' vùng'+(RC.all?' đang làm':' ưu tiên 1, 2')+' · '+Object.keys(flags).length+' vùng có điểm lệch</span></summary><div class="sub" style="margin-top:6px">Bấm từng chữ để đổi: C bản cứng (Chưa có → Đủ → Thiếu), D đã lưu Drive, F đã nhập FarmBase. Xanh là có, vàng là thiếu một phần. Người giữ, link, ghi chú từng loại chỉnh trong "Chi tiết hồ sơ".</div><div style="display:grid;gap:8px;margin-top:8px">'
   +rows.map(r=>'<div style="border:1px solid var(--line);border-radius:8px;padding:10px 12px"><div class="row between" style="gap:6px"><div style="min-width:0"><button class="btn sm" style="border:0;background:none;padding:0;font-weight:700;font-size:15px;text-align:left" data-rcz="'+r.id+'">'+esc(zShort(r.z.name))+'</button><div class="sub">'+esc([PRI[r.z.priority],r.z.ward].filter(Boolean).join(" · "))+' · Bước '+r.z.step+': '+esc(STEPS[r.z.step]?.name||"")+'</div></div>'
     +'<div class="row" style="gap:4px"><span class="pill">'+r.op+' việc mở</span>'+(r.lt?'<span class="pill bad">'+r.lt+' trễ</span>':'')+(r.f?'<span class="pill warn">'+r.f+' lệch</span>':'')+'<span class="sub">cập nhật '+(r.last?dm(r.last.slice(0,10)):"—")+'</span><button class="btn sm pri" data-rcnew="'+r.id+'">+ Việc</button></div></div>'+rcHsBlock(r.id)+'</div>').join("")+'</div></details>';
  h+='<div class="sub" style="margin-top:10px">"Đã kiểm, đúng" ghi lại là bạn đã kiểm với nhân sự và dữ liệu đúng. Nếu sau đó dữ liệu thay đổi (đổi hạn, đổi bước, thêm hồ sơ), điểm đó sẽ hiện lại để kiểm tiếp.</div>';
  RC._last=all; return h;
}
function rcMsg(pid){ const L=(RC._last||rcIssues()).filter(i=>!i.ack&&rcPersonOf(i)===pid); if(!L.length) return "";
  return pname(pid)+", nhờ kiểm và cập nhật giúp trên hệ thống BVI Điều hành (tuần "+dm(rcWeek())+"–"+dm(addDays(rcWeek(),6))+"):\n"+L.map((i,n)=>(n+1)+". "+RC_T[i.type][1]+": "+i.text+(i.type==="daily_miss"?" ("+i.sub+")":"")).join("\n")+"\nXong thì báo lại giúp. Cảm ơn."; }
async function rcSetAck(i,on){
  const by=me||"", at=new Date().toISOString();
  if(i.type==="daily_miss"){ if(!canManage()){ toast("Chỉ quản lý đánh dấu được mục báo cáo nhanh."); return false; } const p=S.people[i.rid]; const r={...(p.rcDaily||{})}; i.dates.forEach(d=>{ if(on) r[d]={at,by}; else delete r[d]; }); return upd("people",i.rid,{rcDaily:r}); }
  const rec=S[i.col]?.[i.rid]; if(!rec) return false; const rc={...(rec.rc||{})}; const key=i.akey||i.type;
  if(on) rc[key]={at,by,sig:i.sig}; else delete rc[key]; return upd(i.col,i.rid,{rc}); }
function bindRecon(A){
  A.querySelectorAll("[data-rcm]").forEach(b=>b.addEventListener("click",()=>{ RC.mode=b.dataset.rcm; RC.ord=null; render(); }));
  A.querySelectorAll("[data-rcresort]").forEach(b=>b.addEventListener("click",()=>{ RC.ord=null; render(); }));
  A.querySelectorAll("[data-rcall]").forEach(b=>b.addEventListener("click",()=>{ RC.all=!!b.dataset.rcall; render(); }));
  A.querySelectorAll("[data-rcdg]").forEach(b=>b.addEventListener("click",()=>{ RC.dg=b.dataset.rcdg; render(); }));
  A.querySelectorAll("[data-rcdr]").forEach(b=>b.addEventListener("click",()=>{ RC.dr=b.dataset.rcdr; render(); }));
  A.querySelectorAll("[data-rcde]").forEach(b=>b.addEventListener("click",()=>{ RC.de=b.dataset.rcde; render(); }));
  A.querySelectorAll("[data-rcds]").forEach(b=>b.addEventListener("click",()=>{ RC.ds=b.dataset.rcds; render(); }));
  $("#rcDw")?.addEventListener("change",e=>{ RC.dw=e.target.value; render(); });
  A.querySelectorAll("[data-rcot]").forEach(b=>b.addEventListener("click",()=>openTask(b.dataset.rcot)));
  A.querySelectorAll("[data-rcdone]").forEach(b=>b.addEventListener("click",async()=>{ b.disabled=true; if(await upd("tasks",b.dataset.rcdone,{status:"done",doneAt:new Date().toISOString(),...stamp()})) toast("Đã đánh dấu xong"); }));
  const W=n=>{ RC.w=addDays(rcWeek(),n*7); render(); };
  $("#rcPrev")?.addEventListener("click",()=>W(-1)); $("#rcNext")?.addEventListener("click",()=>W(1)); $("#rcNow")?.addEventListener("click",()=>{ RC.w=null; render(); });
  $("#rcAckT")?.addEventListener("change",e=>{ RC.showAck=e.target.checked; render(); });
  $("#rcWhoX")?.addEventListener("click",()=>{ RC.who=""; render(); });
  $("#rcZ")?.addEventListener("toggle",e=>{ RC.zOpen=e.target.open; });
  A.querySelectorAll("[data-rcg]").forEach(b=>b.addEventListener("click",()=>{ RC.grp=b.dataset.rcg; render(); if(b.classList.contains("tile")) A.querySelector(".focusbar")?.scrollIntoView({behavior:"smooth",block:"start"}); }));
  A.querySelectorAll("[data-rcw]").forEach(b=>b.addEventListener("click",()=>{ RC.who=RC.who===b.dataset.rcw?"":b.dataset.rcw; render(); }));
  A.querySelectorAll("[data-rcz]").forEach(r=>r.addEventListener("click",()=>openZone(r.dataset.rcz)));
  A.querySelectorAll("[data-rchso]").forEach(d=>d.addEventListener("toggle",()=>{ RC.hsOpen=RC.hsOpen||{}; RC.hsOpen[d.dataset.rchso]=d.open; }));
  A.querySelectorAll("[data-rczt]").forEach(d=>d.addEventListener("toggle",()=>{ RC.ztOpen=RC.ztOpen||{}; RC.ztOpen[d.dataset.rczt]=d.open; }));
  A.querySelectorAll("[data-rcnew]").forEach(b=>b.addEventListener("click",()=>{ const id=b.dataset.rcnew, z=S.zones[id]; openTask(null,{zone:id,kind:"task"});
    const own=z?.owner||Object.values(S.tasks).find(x=>x.zone===id&&x.status!=="done"&&x.R)?.R; const r=$("#tR"); if(own&&r&&[...r.options].some(o=>o.value===own)) r.value=own;
    const d=$("#tdue"); if(d&&!d.value) d.value=addDays(todayStr(),3); $("#tt")?.focus(); }));
  A.querySelectorAll("[data-rchd]").forEach(b=>b.addEventListener("click",()=>{ const id=b.dataset.rchd; ui.drawer=()=>drawHs(id); drawHs(id); }));
  A.querySelectorAll("[data-rchc]").forEach(b=>b.addEventListener("click",async()=>{ const [id,k,f]=b.dataset.rchc.split("|"); const z=S.zones[id]; if(!z) return; const x=hsItem(z,k); const nm=HS.find(h=>h[0]===k)[2];
    if(f==="c"){ const nx={"":"ok",ok:"part",part:"",na:""}[x.hard||""]; b.disabled=true; if(await hsSet(id,k,{hard:nx})) toast(nm+": bản cứng "+HSHARD[nx].toLowerCase()); return; }
    if(f==="d"){ if(z.drv){ toast("Vùng đã nối Drive: D tự xanh khi có file trong thư mục. Mở hồ sơ để tải file lên."); ui.drawer=()=>drawHs(id,k); drawHs(id,k); return; } b.disabled=true; if(await hsSet(id,k,{drive:!x.drive})) toast(nm+": Drive "+(!x.drive?"đã có":"chưa có")); return; }
    if(f==="f"){ b.disabled=true; if(await hsSet(id,k,{fb:!x.fb})) toast(nm+": FarmBase "+(!x.fb?"đã nhập":"chưa nhập")); } }));
  A.querySelectorAll("[data-rchn]").forEach(t=>t.addEventListener("change",async()=>{ const id=t.dataset.rchn; if(await upd("zones",id,{hsNote:t.value.trim().slice(0,600),hsNoteAt:new Date().toISOString(),hsNoteBy:me||"",...stamp()})) toast("Đã lưu ghi chú hồ sơ"); }));
  const find=id=>(RC._last||[]).find(i=>i.id===id);
  A.querySelectorAll("[data-rcmsg]").forEach(b=>b.addEventListener("click",()=>{ const t=rcMsg(b.dataset.rcmsg); if(!t) return; navigator.clipboard?.writeText(t).then(()=>toast("Đã chép tin nhắc, dán vào Zalo"),()=>toast("Không chép được")); }));
  A.querySelectorAll("[data-rco]").forEach(b=>b.addEventListener("click",()=>{ const i=find(b.dataset.rco); if(!i) return; const [k,id]=i.open;
    if(k==="task") openTask(id); else if(k==="ev") openEvent(id); else if(k==="zone") openZone(id); else if(k==="hs"){ ui.drawer=()=>drawHs(id); drawHs(id); } else if(k==="rep"){ location.hash="bao-cao"; } }));
  A.querySelectorAll("[data-rcf]").forEach(b=>b.addEventListener("click",async()=>{ const i=find(b.dataset.rcf); if(!i) return; b.disabled=true; const at=new Date().toISOString();
    const ids=i.fix==="done"?[i.rid]:i.tids; let ok=true; for(const id of ids){ ok=await upd("tasks",id,{status:"done",doneAt:at,...stamp()})&&ok; } if(ok) toast("Đã đánh dấu xong "+ids.length+" việc"); }));
  A.querySelectorAll("[data-rca],[data-rcu]").forEach(b=>b.addEventListener("click",async()=>{ const i=find(b.dataset.rca||b.dataset.rcu); if(!i) return; b.disabled=true; if(await rcSetAck(i,!!b.dataset.rca)) toast(b.dataset.rca?"Đã ghi nhận đã kiểm":"Đã bỏ đánh dấu"); }));
}

/* ---------- Sales: dashboard quản lý, dữ liệu ở bảng sales_leads, sales_acts, sales_claims (sales.html là trang làm việc của sales) ---------- */
let SD={st:null}, SDF={own:"",stage:"",q:"",prov:"",ct:"",pri:"",nx:"",seg:"",src:"",tc:"",cs:"",sel:new Set(),lim:100};
const sdMgr=()=>!!PROFILE&&["owner","manager"].includes(PROFILE.role);
const sdOk=()=>!!PROFILE&&["owner","manager","viewer"].includes(PROFILE.role)&&typeof SC!=="undefined";
const sdName=id=>id?((SD.people||{})[id]||"Người khác"):"Kho chung";
const SD_EF=[["name","Tên khách (tổ chức, hộ)"],["contact_name","Người liên hệ"],["contact_title","Chức vụ"],["contact_phone","Số điện thoại"],["contact_zalo","Zalo (nếu khác)"],["contact_email","Email"],["province","Tỉnh thành"],["address","Địa chỉ"],["segment","Nhóm khách"],["source","Nguồn"],["crops","Cây trồng"],["scale","Quy mô"]];
function sdEditRow(l,cols){
  const sel=(id,arr,v,all)=>'<select id="'+id+'"><option value="">'+all+'</option>'+arr.map(([k,t])=>'<option value="'+esc(k)+'"'+(String(v??"")===String(k)?" selected":"")+'>'+esc(t)+'</option>').join("")+'</select>';
  const f=(lab,inp)=>'<label style="display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--muted)">'+lab+inp+'</label>';
  return '<tr class="sd-edit"><td colspan="'+cols+'" style="background:var(--soft,#f6f8f6)"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">'
    +SD_EF.map(([k,t])=>f(t,'<input data-sdef="'+k+'" value="'+esc(l[k]||"")+'">')).join("")
    +f("Giai đoạn",sel("sdeStage",SC.STAGES,l.stage,"—"))+f("Độ ưu tiên",sel("sdePri",SC.PRIOS,SC.prioOf(l),"Chưa xếp"))
    +f("Bước tiếp",sel("sdeNt",SC.NEXT,l.next_type,"Chưa có"))+f("Ngày hẹn",'<input type="date" id="sdeNa" value="'+esc(l.next_at||"")+'">')
    +'</div>'+f("Ghi chú bước tiếp",'<textarea id="sdeNn" rows="2">'+esc(l.next_note||"")+'</textarea>')
    +'<div class="row" style="gap:6px;margin-top:8px"><button class="btn pri sm" id="sdeSave">Lưu</button><button class="btn sm" id="sdeX">Đóng</button><span class="sub" id="sdeMsg"></span></div></td></tr>'; }
async function sdExport(){
  const leads=SD.view||SD.leads, ids=new Set(leads.map(l=>l.id)), nm=id=>id?((SD.people||{})[id]||"Người khác"):"Kho chung";
  const acts=[]; for(let f=0;;f+=1000){ const {data,error}=await SB.from("sales_acts").select("id,lead_id,by,kind,channel,result,stage_after,note,minutes,at").order("at",{ascending:false}).range(f,f+999); if(error) throw error; acts.push(...data); if(data.length<1000||f>=49000) break; }
  const A=acts.filter(a=>ids.has(a.lead_id)), lname={}; leads.forEach(l=>lname[l.id]=l.name);
  const d7=new Date(Date.now()-7*864e5).toISOString(), td=SC.vnToday(), dt=iso=>iso?new Date(Date.parse(iso)+7*36e5).toISOString().slice(0,16).replace("T"," "):"";
  const lastBy={}; A.forEach(a=>{ if(a.kind==="act"&&!lastBy[a.lead_id]) lastBy[a.lead_id]=a; });
  const LR=[["Tên lead","Nhóm khách","Nguồn","Tỉnh thành","Địa chỉ","Người liên hệ","Chức vụ","Số điện thoại","Zalo","Email","Giai đoạn","Ưu tiên","Trạng thái liên hệ","Phụ trách","Số lần chạm","Chạm gần nhất","Người chạm gần nhất","Ghi chú lần chạm gần nhất","Bước tiếp","Ngày hẹn","Quá hạn","Ghi chú bước tiếp"]]
    .concat(leads.map(l=>{ const la=lastBy[l.id]; return [l.name||"",l.segment||"",l.source||"",SC.provKey(l.province)||"",l.address||"",l.contact_name||"",l.contact_title||"",l.contact_phone||l.org_phone||"",l.contact_zalo||"",l.contact_email||"",
      SC.lab(SC.STAGES,l.stage),SC.lab(SC.PRIOS,SC.prioOf(l))||"",l.last_result?SC.lab(SC.CONTACT_STATES,SC.contactState(l)):"Chưa liên hệ",nm(l.owner_id),Number(l.touch_count||0),dt(l.last_touch_at),la?nm(la.by):"",la&&la.note||"",
      SC.lab(SC.NEXT,l.next_type)||"",l.next_at||"",l.next_at&&l.next_at<td&&SC.isOpen(l.stage)?"Có":"",l.next_note||""]; }));
  const AR=[["Thời gian","Nhân sự","Lead","Loại","Kênh","Kết quả","Giai đoạn sau","Phút gọi","Ghi chú"]]
    .concat(A.map(a=>[dt(a.at),nm(a.by),lname[a.lead_id]||"",a.kind==="act"?"Tương tác":a.kind==="assign"?"Giao lead":a.kind==="claim"?"Xin nhận":"Ghi chú",SC.lab(SC.CHANNELS,a.channel)||"",SC.lab(SC.RESULTS,a.result)||"",a.stage_after!=null?SC.lab(SC.STAGES,a.stage_after):"",a.minutes!=null?Number(a.minutes):"",a.note||""]));
  const who=[...new Set(leads.map(l=>l.owner_id).filter(Boolean).concat(A.map(a=>a.by).filter(Boolean)))].sort((x,y)=>nm(x).localeCompare(nm(y),"vi"));
  const PR=[["Nhân sự","Lead đang giữ","Chưa chạm","Đã liên hệ được","Không liên lạc được","Từ chối","Quá hạn hẹn","Ưu tiên cao","Tương tác 7 ngày","Tổng tương tác","Gặp trực tiếp","Đã gửi báo giá, tài liệu","Hoạt động gần nhất"]]
    .concat(who.map(u=>{ const my=leads.filter(l=>l.owner_id===u), ma=A.filter(a=>a.by===u&&a.kind==="act"), cs=k=>my.filter(l=>SC.contactState(l)===k).length;
      return [nm(u),my.length,my.filter(l=>!l.last_touch_at).length,cs("reached"),my.filter(l=>SC.NOREACH.includes(SC.contactState(l))).length,cs("refused"),my.filter(l=>l.next_at&&l.next_at<td&&SC.isOpen(l.stage)).length,my.filter(l=>SC.prioOf(l)==="A").length,
        ma.filter(a=>a.at>=d7).length,ma.length,ma.filter(a=>a.channel==="meet").length,ma.filter(a=>a.result==="sent").length,dt((A.find(a=>a.by===u)||{}).at)]; }));
  const d=SC.vnToday(); xSave(await xXlsx([{name:"Theo nhân sự",rows:PR,hdr:true},{name:"Lead",rows:LR,hdr:true},{name:"Tương tác",rows:AR,hdr:true}]),"BVI_Sales_"+d.slice(8,10)+"-"+d.slice(5,7)+"-"+d.slice(0,4)+".xlsx");
  return [leads.length,A.length]; }
async function loadSales(){
  if(SD.st==="loading") return; SD.st="loading";
  try{
    const leads=[]; for(let f=0;;f+=1000){ const {data,error}=await SB.from("sales_leads").select("*").order("name").range(f,f+999); if(error) throw error; leads.push(...data); if(data.length<1000) break; }
    const since=new Date(SC.addDays(SC.vnToday(),-7)+"T00:00:00+07:00").toISOString();
    const [a,c,p]=await Promise.all([SB.from("sales_acts").select("*").gte("at",since).order("at",{ascending:false}).limit(5000),
      SB.from("sales_claims").select("*").eq("status","pending").order("at"), SB.rpc("sales_people")]);
    const rm=await SB.from("sales_settings").select("value").eq("key","remind").maybeSingle();
    if(a.error) throw a.error;
    const people={}, roles={}; (p.data||[]).forEach(x=>{ people[x.id]=x.name; roles[x.id]=x.role; });
    SD={st:"ok",leads,acts:a.data||[],claims:c.data||[],people,roles,at:Date.now(),week:SD.week,rmOpen:SD.rmOpen,remind:rm.error?null:((rm.data||{}).value||{}),rmErr:!!rm.error};
  }catch(e){ SD={st:"err",err:e.message||String(e)}; }
  if(ui.view==="nhu-cau") softRender();
}
function sdStats(){
  const td=SC.vnToday(), t0=new Date(td+"T00:00:00+07:00").toISOString(), L=SD.leads, A=SD.acts.filter(a=>a.kind==="act");
  const today=A.filter(a=>a.at>=t0), B=SC.buckets(L,null);
  const ids=new Set([...L.map(l=>l.owner_id).filter(Boolean),...A.map(a=>a.by)]);
  const rows=[...ids].map(u=>{ const mine=L.filter(l=>l.owner_id===u), open=mine.filter(l=>SC.isOpen(l.stage)), ma=A.filter(a=>a.by===u);
    const ft=mine.filter(l=>l.first_touch_at&&l.assigned_at).map(l=>(Date.parse(l.first_touch_at)-Date.parse(l.assigned_at))/36e5).filter(h=>h>=0);
    return {u,name:sdName(u),role:SD.roles[u]||"",hold:open.length,today:ma.filter(a=>a.at>=t0).length,week:ma.length,
      min:ma.filter(a=>a.channel==="call").reduce((s,a)=>s+(a.minutes||0),0),over:B.overdue.filter(l=>l.owner_id===u).length,hot:B.hot.filter(l=>l.owner_id===u).length,
      ft:ft.length?Math.round(ft.reduce((s,h)=>s+h,0)/ft.length):null,last:ma[0]?.at||null}; }).sort((a,b)=>b.today-a.today||b.week-a.week||a.name.localeCompare(b.name,"vi"));
  return {td,t0,today,B,rows,calls:today.filter(a=>a.channel==="call").length};
}
function vSales(){
  if(!sdOk()) return '<div class="panel">Mục này dành cho quản lý.</div>';
  if(!SD.st){ setTimeout(loadSales,0); return '<div class="panel">Đang tải dữ liệu sales…</div>'; }
  if(SD.st==="loading") return '<div class="panel">Đang tải dữ liệu sales…</div>';
  if(SD.st==="err") return '<div class="panel"><div class="alert bad">Chưa tải được dữ liệu sales: '+esc(SD.err)+'</div><button class="btn" id="sdReload">Thử lại</button></div>';
  const X=sdStats(), L=SD.leads, mg=sdMgr();
  let h='<div class="row between" style="gap:8px;align-items:flex-end;flex-wrap:wrap"><div style="min-width:0"><h1>Sales</h1><div class="sub">Lead, cuộc gọi và tương tác của đội sales. Sales làm việc ở trang riêng, không thấy trang quản trị.</div></div>'
   +'<div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn" id="sdWeek">Báo cáo tuần</button><button class="btn" id="sdReload">Tải lại</button>'+(PROFILE&&PROFILE.role==="owner"?'<button class="btn" id="sdXlsx">Xuất Excel</button><button class="btn" id="sdRm">Nhắc gọi lại</button>':'')+'<a class="btn" href="bao-gia.html" target="_blank" rel="noopener">Báo giá, HĐ</a><a class="btn pri" href="sales.html" target="_blank" rel="noopener">Mở trang sales</a></div></div>';
  if(SD.week) h+='<div class="panel" id="sdWeekBox" style="margin-top:12px"><div class="row between" style="gap:6px;flex-wrap:wrap"><h3 style="margin:0">Báo cáo tuần</h3><span class="row" style="gap:6px"><button class="btn pri sm" id="sdWeekCopy">Chép gửi Zalo</button><button class="btn sm" id="sdWeekX">Đóng</button></span></div>'
   +'<div class="sub" style="margin:4px 0 6px">7 ngày gần nhất, không có số điện thoại hay nội dung ghi chú. Sửa thêm trước khi gửi nếu cần.</div><textarea id="sdWeekTxt" rows="14" style="width:100%;box-sizing:border-box;font:inherit">'+esc(SC.weekReport(L,SD.acts,SD.people,new Date()))+'</textarea></div>';
  if(SD.rmOpen&&isOwner()){ const R0=SD.remind||{};
    h+='<div class="panel" style="margin-top:12px"><div class="row between" style="gap:6px;flex-wrap:wrap"><h3 style="margin:0">Thiết lập nhắc gọi lại</h3><span class="row" style="gap:6px"><button class="btn pri sm" id="sdRmSave"'+(SD.rmErr?" disabled":"")+'>Lưu</button><button class="btn sm" id="sdRmX">Đóng</button></span></div>'
     +'<div class="sub" style="margin:4px 0 8px">Số ngày sau tương tác thì trang sales tự đặt hẹn gọi lại. Ghi 0 để không nhắc. Khách từ chối, chuyển Không theo hoặc đã ký thì không nhắc.</div>'
     +(SD.rmErr?'<div class="alert warn">Máy chủ chưa có bảng thiết lập. Chạy file sales_letters_remind.sql trong Supabase rồi tải lại.</div>':'')
     +'<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;align-items:end">'+Object.entries(SC.REMIND_KEYS).map(([k,t])=>'<label class="f" style="margin:0"><span class="sub">'+esc(t)+'</span><input type="number" min="0" max="365" inputmode="numeric" data-rm="'+k+'" value="'+esc(String(R0[k]!=null&&R0[k]!==""?R0[k]:SC.REMIND_DEF[k]))+'" style="width:100%;box-sizing:border-box"></label>').join("")+'</div><div class="sub" id="sdRmMsg" style="margin-top:6px"></div></div>'; }
  const tile=(k,v,l,cls)=>'<div class="tile '+(cls||"")+'" data-kpi="'+k+'"><span class="v">'+v+'</span><span class="l">'+l+'</span></div>';
  const open=L.filter(l=>SC.isOpen(l.stage)).length;
  h+='<div class="grid kpis" style="margin-top:12px">'+tile("calls",X.calls,"Cuộc gọi hôm nay")+tile("acts",X.today.length,"Tương tác hôm nay")+tile("open",open,"Lead đang theo")
   +tile("over",X.B.overdue.length,"Quá hạn hẹn",X.B.overdue.length?"bad":"good")+tile("won",L.filter(l=>l.stage===6).length,"Đã ký","good")+tile("find",L.filter(l=>l.stage===0).length,"Cần tìm liên hệ",L.some(l=>l.stage===0)?"warn":"")+'</div>';
  const mx=Math.max(1,...SC.STAGES.map(([k])=>L.filter(l=>l.stage===k).length));
  h+='<div class="panel" style="margin-top:12px"><h3 style="margin:0 0 8px">Phễu theo giai đoạn</h3>'+SC.STAGES.map(([k,t])=>{ const n=L.filter(l=>l.stage===k).length;
    return '<div data-fun="'+k+'" style="display:grid;grid-template-columns:118px 1fr 40px;gap:8px;align-items:center;margin:3px 0"><span class="sub">'+t+'</span><span style="background:var(--sunk);border-radius:4px;height:14px;overflow:hidden"><span style="display:block;height:100%;width:'+Math.round(n*100/mx)+'%;background:var(--'+(k===6?"good":k===7?"bad":k===0?"warn":"brand")+')"></span></span><b class="c" style="text-align:right">'+n+'</b></div>'; }).join("")+'</div>';
  h+='<div class="panel" style="margin-top:12px"><h3 style="margin:0 0 8px">Theo từng sales</h3><div class="tw"><table id="sdTbl"><thead><tr><th>Sales</th><th>Lead đang giữ</th><th>Tương tác hôm nay</th><th>Tương tác 7 ngày</th><th>Phút gọi (7 ngày)</th><th>Quá hạn</th><th>Ưu tiên cao lâu chưa chạm</th><th>Giao đến lần chạm đầu (giờ)</th><th>Hoạt động gần nhất</th></tr></thead><tbody>'
   +(X.rows.length?X.rows.map(r=>'<tr data-u="'+esc(r.u)+'"><td><b>'+esc(r.name)+'</b>'+(r.role==="ctv"?' <span class="pill">CTV</span>':'')+'</td><td>'+r.hold+'</td><td>'+(r.today>=SC.CALL_GOAL?'<b style="color:var(--good)">'+r.today+'</b>':r.today)+'</td><td>'+r.week+'</td><td>'+r.min+'</td><td>'+(r.over?'<b style="color:var(--bad)">'+r.over+'</b>':0)+'</td><td>'+(r.hot?'<b style="color:var(--warn)">'+r.hot+'</b>':0)+'</td><td>'+(r.ft==null?"—":r.ft)+'</td><td class="sub">'+esc(SC.ago(r.last))+'</td></tr>').join(""):'<tr><td colspan="9" class="sub">Chưa có lead nào được giao.</td></tr>')+'</tbody></table></div></div>';
  // Cần can thiệp
  const lid=Object.fromEntries(L.map(l=>[l.id,l])), td=X.td, late3=X.B.overdue.filter(l=>l.next_at<=SC.addDays(td,-3));
  const iv=[]; SD.claims.forEach(c=>iv.push('<div class="row between" style="gap:6px;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--line)"><span style="min-width:0;overflow-wrap:anywhere"><b>'+esc(sdName(c.by))+'</b> xin nhận lead <b>'+esc(lid[c.lead_id]?.name||"(lead)")+'</b> · '+esc(SC.ago(c.at))+'</span>'+(mg?'<span class="row" style="gap:4px"><button class="btn sm pri" data-cok="'+esc(c.id)+'">Duyệt</button><button class="btn sm" data-cno="'+esc(c.id)+'">Từ chối</button></span>':'')+'</div>'));
  late3.slice(0,15).forEach(l=>iv.push('<div style="padding:6px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere"><span class="pill bad">Quá hạn '+Math.round((Date.parse(td)-Date.parse(l.next_at))/864e5)+' ngày</span> <b>'+esc(l.name)+'</b> · '+esc(sdName(l.owner_id))+'</div>'));
  X.B.hot.slice(0,10).forEach(l=>iv.push('<div style="padding:6px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere"><span class="pill warn">Ưu tiên '+esc(SC.lab(SC.PRIOS,SC.prioOf(l)))+' bị bỏ '+esc(SC.ago(l.last_touch_at))+'</span> <b>'+esc(l.name)+'</b> · '+esc(sdName(l.owner_id))+'</div>'));
  X.B.fresh.slice(0,10).forEach(l=>iv.push('<div style="padding:6px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere"><span class="pill">Giao quá 24 giờ chưa chạm</span> <b>'+esc(l.name)+'</b> · '+esc(sdName(l.owner_id))+'</div>'));
  h+='<div class="panel" style="margin-top:12px"><h3 style="margin:0 0 4px">Cần can thiệp</h3>'+(iv.length?iv.join(""):'<div class="sub">Không có việc cần can thiệp.</div>')+'</div>';
  // Dòng hoạt động
  const feed=SD.acts.slice(0,50);
  h+='<div class="panel" style="margin-top:12px"><h3 style="margin:0 0 4px">Hoạt động gần đây</h3><div id="sdFeed">'+(feed.length?feed.map(a=>{ const l=lid[a.lead_id], w=new Date(Date.parse(a.at)+7*36e5).toISOString();
    const what=a.kind==="note"?"Ghi chú: "+esc(String(a.note||"").slice(0,200)):a.kind==="assign"?esc(a.note||"Giao lead"):a.kind==="claim"?"Nhận lead từ kho chung":[SC.lab(SC.CHANNELS,a.channel),SC.lab(SC.RESULTS,a.result)].filter(Boolean).map(esc).join(" · ")+(a.minutes?" · "+a.minutes+" phút":"");
    return '<div class="fi" style="padding:7px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere"><div class="sub">'+w.slice(8,10)+"/"+w.slice(5,7)+" "+w.slice(11,16)+' · <b>'+esc(sdName(a.by))+'</b></div><div><b>'+esc(l?.name||"(lead)")+'</b>: '+what+(a.temp_after?' <span class="pill">'+esc(SC.lab(SC.TEMPS,a.temp_after))+'</span>':'')+'</div>'
     +(a.note&&a.kind==="act"?'<div class="sub">'+esc(a.note)+'</div>':'')+(a.lat!=null?'<div class="sub">📍 <a href="https://www.google.com/maps?q='+a.lat+','+a.lng+'" target="_blank" rel="noopener">Điểm check-in</a></div>':'')
     +((a.photos||[]).length?'<div class="row" style="gap:4px;margin-top:4px;flex-wrap:wrap">'+a.photos.map(p=>'<span data-sdph="'+esc(p)+'"></span>').join("")+'</div>':'')+'</div>'; }).join(""):'<div class="sub">Chưa có hoạt động trong 7 ngày.</div>')+'</div></div>';
  // Giao lead
  let arr=L.filter(l=>SDF.own==="_none"?!l.owner_id:SDF.own?l.owner_id===SDF.own:true);
  if(SDF.stage!=="") arr=arr.filter(l=>String(l.stage)===SDF.stage);
  if(SDF.nx) arr=arr.filter(l=>SDF.nx==="has"?!!l.next_at:SDF.nx==="late"?!!l.next_at&&l.next_at<SC.vnToday(new Date()):!l.next_at);
  if(SDF.q){ const n=SC.norm(SDF.q); arr=arr.filter(l=>SC.norm([l.name,l.province,l.segment,l.contact_name,l.address].join(" ")).includes(n)); }
  const provs=(()=>{ const m=new Map(); L.forEach(l=>{ const k=SC.provKey(l.province); m.set(k,(m.get(k)||0)+1); }); return [...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"vi")); })();
  if(SDF.prov) arr=arr.filter(l=>SC.provKey(l.province)===SDF.prov);
  const cnt=f=>{ const m=new Map(); L.forEach(l=>{ const k=f(l); if(k) m.set(k,(m.get(k)||0)+1); }); return [...m].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),"vi")); };
  const segs=cnt(l=>l.segment);
  if(SDF.seg) arr=arr.filter(l=>l.segment===SDF.seg);
  if(SDF.cs) arr=arr.filter(l=>SC.contactState(l)===SDF.cs);
  if(SDF.src) arr=arr.filter(l=>SC.srcMatch(l,SDF.src));
  if(SDF.tc){ const d14=new Date(Date.now()-14*864e5).toISOString(); arr=arr.filter(l=>SDF.tc==="never"?!l.last_touch_at:SDF.tc==="stale"?!!l.last_touch_at&&l.last_touch_at<d14:!!l.last_touch_at&&l.last_touch_at>=d14); }
  const ctc={}; arr.forEach(l=>{ const c=SC.contactOf(l); SC.CONTACT_F.forEach(([k])=>{ if(SC.contactMatch(c,k)) ctc[k]=(ctc[k]||0)+1; }); });
  if(SDF.pri) arr=arr.filter(l=>SDF.pri==="none"?!SC.prioOf(l):SC.prioOf(l)===SDF.pri);
  if(SDF.ct) arr=arr.filter(l=>SC.contactMatch(SC.contactOf(l),SDF.ct));
  SD.view=arr;
  const ciB=l=>{ const c=SC.contactOf(l); return [["ph","SĐT"],["em","Email"],["ad","Địa chỉ"]].map(([k,t])=>'<span style="font-size:11px;border-radius:6px;padding:0 5px;white-space:nowrap;'+(c[k]?'border:1px solid var(--ok,#2f7d4f);color:var(--ok,#2f7d4f)':'border:1px dashed var(--line,#ccc);color:var(--muted,#888);text-decoration:line-through')+'" title="'+(c[k]?"Có ":"Chưa có ")+t.toLowerCase()+'">'+t+'</span>').join(" "); };
  const sel=[...SDF.sel].filter(id=>lid[id]), ppl=Object.entries(SD.people).filter(([u])=>["owner","manager","staff","ctv"].includes(SD.roles[u])).sort((a,b)=>a[1].localeCompare(b[1],"vi"));
  h+='<div class="panel" style="margin-top:12px"><h3 style="margin:0 0 8px">Danh sách lead'+(mg?' và giao việc':'')+'</h3><div class="filters"><input id="sdQ" placeholder="Tìm tên, tỉnh, địa chỉ, loại khách" value="'+esc(SDF.q)+'" style="flex:1;min-width:160px">'
   +'<select id="sdOwn" aria-label="Phụ trách"><option value="">Mọi người phụ trách</option><option value="_none"'+(SDF.own==="_none"?" selected":"")+'>Kho chung (chưa giao)</option>'+ppl.map(([u,n])=>'<option value="'+esc(u)+'"'+(SDF.own===u?" selected":"")+'>'+esc(n)+'</option>').join("")+'</select>'
   +'<select id="sdStage" aria-label="Giai đoạn"><option value="">Mọi giai đoạn</option>'+SC.STAGES.map(([k,t])=>'<option value="'+k+'"'+(SDF.stage===String(k)?" selected":"")+'>'+t+'</option>').join("")+'</select>'
   +'<select id="sdProv" aria-label="Tỉnh thành"><option value="">Mọi tỉnh thành</option>'+provs.map(([k,n])=>'<option value="'+esc(k)+'"'+(SDF.prov===k?" selected":"")+'>'+esc(k)+' ('+n+')</option>').join("")+'</select>'
   +'<select id="sdSeg" aria-label="Nhóm khách"><option value="">Mọi nhóm khách</option>'+segs.map(([k,n])=>'<option value="'+esc(k)+'"'+(SDF.seg===k?" selected":"")+'>'+esc(k)+' ('+n+')</option>').join("")+'</select>'
   +'<select id="sdSrc" aria-label="Nguồn lead"><option value="">Mọi nguồn</option>'+SC.srcOptions(L).map(([k,t])=>'<option value="'+esc(k)+'"'+(SDF.src===k?" selected":"")+'>'+esc(String(t).slice(0,70))+'</option>').join("")+'</select>'
   +'<select id="sdCs" aria-label="Trạng thái liên hệ"><option value="">Mọi trạng thái liên hệ</option>'+SC.CONTACT_STATES.map(([k,t])=>'<option value="'+k+'"'+(SDF.cs===k?" selected":"")+'>'+t+'</option>').join("")+'</select>'
   +'<select id="sdTc" aria-label="Lần chạm"><option value="">Mọi lần chạm</option>'+[["never","Chưa ai liên hệ"],["stale","Quá 14 ngày chưa chạm"],["recent","Có chạm trong 14 ngày"]].map(([k,t])=>'<option value="'+k+'"'+(SDF.tc===k?" selected":"")+'>'+t+'</option>').join("")+'</select>'
   +'<select id="sdNx" aria-label="Ngày hẹn"><option value="">Mọi ngày hẹn</option>'+[["has","Có ngày hẹn"],["late","Quá hạn hẹn"],["none","Chưa hẹn ngày"]].map(([k,t])=>'<option value="'+k+'"'+(SDF.nx===k?" selected":"")+'>'+t+'</option>').join("")+'</select>'
   +'<select id="sdPri" aria-label="Độ ưu tiên"><option value="">Mọi độ ưu tiên</option>'+SC.PRIOS.concat([["none","Chưa xếp ưu tiên"]]).map(([k,t])=>'<option value="'+k+'"'+(SDF.pri===k?" selected":"")+'>'+t+'</option>').join("")+'</select>'
   +'<select id="sdCt" aria-label="Thông tin liên hệ"><option value="">Mọi thông tin liên hệ</option>'+SC.CONTACT_F.map(([k,t])=>'<option value="'+k+'"'+(SDF.ct===k?" selected":"")+'>'+t+(SDF.ct?'':' ('+(ctc[k]||0)+')')+'</option>').join("")+'</select>'+(['own','stage','q','prov','ct','pri','nx','seg','src','tc','cs'].some(k=>SDF[k])?'<button class="btn sm" id="sdClr">Xóa lọc</button>':'')+'</div>'
   +(mg?'<div class="row" style="gap:6px;flex-wrap:wrap;margin:8px 0"><span class="sub">Đã chọn <b id="sdN">'+sel.length+'</b> lead · giao cho</span><select id="sdTo" aria-label="Giao cho"><option value="">Chọn người</option>'+ppl.map(([u,n])=>'<option value="'+esc(u)+'">'+esc(n)+(SD.roles[u]==="ctv"?" (CTV)":"")+'</option>').join("")+'</select><button class="btn pri sm" id="sdAssign">Giao</button><span class="sub">· hoặc</span><select id="sdSetPri" aria-label="Đặt ưu tiên"><option value="">Đặt ưu tiên</option>'+SC.PRIOS.map(([k,t])=>'<option value="'+k+'">'+t+'</option>').join("")+'</select><button class="btn sm" id="sdNoDate">Bỏ ngày hẹn</button><span class="sub" id="sdMsg"></span></div>'
   +'<div class="row" style="gap:6px;flex-wrap:wrap;margin:0 0 8px;align-items:center"><span class="sub">Chia đều lead đã chọn cho:</span>'+ppl.map(([u,n])=>'<label class="pill" style="cursor:pointer;display:inline-flex;gap:4px;align-items:center"><input type="checkbox" data-sdsplit="'+esc(u)+'">'+esc(n)+(SD.roles[u]==="ctv"?" (CTV)":"")+'</label>').join("")+'<button class="btn pri sm" id="sdSplit">Chia đều</button><span class="sub" id="sdSplitMsg"></span></div>':'')
   +'<div class="sub" style="margin:4px 0">'+arr.length+' lead</div><div class="tw"><table><thead><tr>'+(mg?'<th><input type="checkbox" id="sdAll" aria-label="Chọn tất cả đang hiện"></th>':'')+'<th>Lead</th><th>Liên hệ</th><th>Giai đoạn</th><th>Ưu tiên</th><th>Phụ trách</th><th>Hẹn</th><th>Liên hệ gần nhất</th></tr></thead><tbody>'
   +arr.slice(0,SDF.lim).map(l=>'<tr>'+(mg?'<td><input type="checkbox" data-sdsel="'+esc(l.id)+'"'+(SDF.sel.has(l.id)?" checked":"")+'></td>':'')+'<td style="min-width:160px"><b>'+esc(l.name)+'</b>'+(mg?' <button class="btn sm" data-sdedit="'+esc(l.id)+'" aria-label="Sửa lead">✎ Sửa</button>':'')+'<div class="sub">'+esc([SC.provKey(l.province),l.segment].filter(Boolean).join(" · "))+'</div></td><td style="white-space:nowrap">'+ciB(l)+'</td><td>'+esc(SC.lab(SC.STAGES,l.stage))+'</td><td>'+(SC.prioOf(l)?'<span class="pill'+(SC.prioOf(l)==="A"?" bad":SC.prioOf(l)==="B"?" warn":"")+'">'+esc(SC.lab(SC.PRIOS,SC.prioOf(l)))+'</span>':'')+'</td><td>'+esc(sdName(l.owner_id))+'</td><td'+(l.next_at&&l.next_at<td&&SC.isOpen(l.stage)?' style="color:var(--bad);font-weight:600"':'')+'>'+(l.next_at?dm(l.next_at):"—")+'</td><td>'+(l.last_result?'<span class="pill'+(SC.contactState(l)==="reached"?"":" bad")+'">'+esc(SC.lab(SC.CONTACT_STATES,SC.contactState(l)))+'</span> ':'')+'<span class="sub">'+esc(SC.ago(l.last_touch_at))+'</span></td></tr>'+(mg&&SDF.edit===l.id?sdEditRow(l,mg?8:7):'')).join("")+'</tbody></table></div>'
   +(arr.length>SDF.lim?'<button class="btn sm" id="sdMore" style="margin-top:6px">Xem thêm</button>':'')+'</div>';
  return h;
}
function bindSales(A){
  $("#sdReload")?.addEventListener("click",()=>{ SD={st:null}; render(); });
  $("#sdWeek")?.addEventListener("click",()=>{ SD.week=!SD.week; render(); if(SD.week) $("#sdWeekBox")?.scrollIntoView({block:"nearest"}); });
  $("#sdWeekX")?.addEventListener("click",()=>{ SD.week=false; render(); });
  $("#sdRm")?.addEventListener("click",()=>{ SD.rmOpen=!SD.rmOpen; render(); });
  $("#sdRmX")?.addEventListener("click",()=>{ SD.rmOpen=false; render(); });
  $("#sdRmSave")?.addEventListener("click",async e=>{ if(!isOwner()) return; const v={...SC.REMIND_DEF,...(SD.remind||{})};
    A.querySelectorAll("[data-rm]").forEach(i=>{ const n=parseInt(i.value,10); v[i.dataset.rm]=Number.isFinite(n)?Math.min(365,Math.max(0,n)):SC.REMIND_DEF[i.dataset.rm]; });
    const b=e.currentTarget; b.disabled=true; const {error}=await SB.from("sales_settings").upsert({key:"remind",value:v,updated_at:new Date().toISOString(),updated_by:PROFILE.id});
    if(error){ $("#sdRmMsg").textContent="Chưa lưu được: "+error.message; b.disabled=false; return; } SD.remind=v; toast("Đã lưu thiết lập nhắc gọi lại"); logEv("sales","sửa thiết lập nhắc gọi lại"); render(); });
  $("#sdWeekCopy")?.addEventListener("click",()=>{ const t=$("#sdWeekTxt").value; navigator.clipboard?.writeText(t).then(()=>toast("Đã chép báo cáo, dán vào Zalo"),()=>{ $("#sdWeekTxt").select(); toast("Không chép được, bôi đen rồi chép tay"); }); });
  if(SD.st!=="ok") return;
  const ph=[...A.querySelectorAll("[data-sdph]")];
  if(ph.length) SB.storage.from("sales").createSignedUrls(ph.map(e=>e.dataset.sdph),3600).then(({data})=>{ const m={}; (data||[]).forEach(x=>m[x.path]=x.signedUrl);
    ph.forEach(e=>{ const u=m[e.dataset.sdph]; if(u) e.innerHTML='<a href="'+esc(u)+'" target="_blank" rel="noopener"><img src="'+esc(u)+'" alt="Ảnh check-in" style="width:64px;height:64px;object-fit:cover;border-radius:6px"></a>'; }); });
  const q=$("#sdQ"); q?.addEventListener("input",()=>{ SDF.q=q.value; clearTimeout(q._t); q._t=setTimeout(()=>{ render(); const n=$("#sdQ"); if(n){ n.focus(); n.setSelectionRange(n.value.length,n.value.length); } },250); });
  $("#sdOwn")?.addEventListener("change",e=>{ SDF.own=e.target.value; SDF.lim=100; render(); });
  $("#sdStage")?.addEventListener("change",e=>{ SDF.stage=e.target.value; SDF.lim=100; render(); });
  $("#sdProv")?.addEventListener("change",e=>{ SDF.prov=e.target.value; SDF.lim=100; render(); });
  $("#sdClr")?.addEventListener("click",()=>{ ["own","stage","q","prov","ct","pri","nx","seg","src","tc","cs"].forEach(k=>SDF[k]=""); SDF.lim=100; render(); });
  [["sdSeg","seg"],["sdSrc","src"],["sdTc","tc"],["sdCs","cs"]].forEach(([i,k])=>$("#"+i)?.addEventListener("change",e=>{ SDF[k]=e.target.value; SDF.lim=100; render(); }));
  $("#sdNx")?.addEventListener("change",e=>{ SDF.nx=e.target.value; SDF.lim=100; render(); });
  const sdBulk=async(patch,label)=>{ if(!sdMgr()) return; const ids=[...SDF.sel].filter(id=>SD.leads.some(l=>l.id===id));
    if(!ids.length){ $("#sdMsg").textContent="Chọn lead trước."; return; } $("#sdMsg").textContent="Đang lưu…";
    let err=null; for(let i=0;i<ids.length&&!err;i+=200){ const r=await SB.from("sales_leads").update(patch).in("id",ids.slice(i,i+200)); err=r.error; }
    if(err){ $("#sdMsg").textContent="Chưa lưu được: "+err.message; return; }
    toast(label+" cho "+ids.length+" lead"); logEv("sales",label.toLowerCase()+" "+ids.length+" lead"); SDF.sel=new Set(); SD={st:null}; render(); };
  $("#sdNoDate")?.addEventListener("click",()=>sdBulk({next_at:null},"Đã bỏ ngày hẹn"));
  $("#sdSetPri")?.addEventListener("change",e=>{ const v=e.target.value; if(v) sdBulk({priority:v},"Đã đặt ưu tiên "+SC.lab(SC.PRIOS,v)); });
  $("#sdPri")?.addEventListener("change",e=>{ SDF.pri=e.target.value; SDF.lim=100; render(); });
  $("#sdCt")?.addEventListener("change",e=>{ SDF.ct=e.target.value; SDF.lim=100; render(); });
  $("#sdMore")?.addEventListener("click",()=>{ SDF.lim+=200; render(); });
  $("#sdXlsx")?.addEventListener("click",async e=>{ const b=e.currentTarget; b.disabled=true; b.textContent="Đang tạo file…"; try{ const [n,m]=await sdExport(); toast("Đã xuất "+n+" lead, "+m+" tương tác"); }catch(er){ toast("Chưa xuất được: "+(er.message||er)); } b.disabled=false; b.textContent="Xuất Excel"; });
  A.querySelectorAll("[data-sdedit]").forEach(b=>b.addEventListener("click",()=>{ SDF.edit=SDF.edit===b.dataset.sdedit?null:b.dataset.sdedit; render(); }));
  $("#sdeX")?.addEventListener("click",()=>{ SDF.edit=null; render(); });
  $("#sdeSave")?.addEventListener("click",async()=>{ if(!sdMgr()) return; const l=SD.leads.find(x=>x.id===SDF.edit); if(!l) return; const p={};
    A.querySelectorAll("[data-sdef]").forEach(i=>{ p[i.dataset.sdef]=i.value.trim()||null; }); if(!p.name){ $("#sdeMsg").textContent="Cần tên khách"; return; }
    const st=$("#sdeStage").value; if(st!=="") p.stage=+st; p.priority=$("#sdePri").value||null; p.next_type=$("#sdeNt").value||null; p.next_at=$("#sdeNa").value||null; p.next_note=$("#sdeNn").value.trim()||null;
    if(l.stage===0&&p.stage===0&&(SC.normPhones([p.contact_phone,p.contact_zalo].join(",")).length||p.contact_email)) p.stage=1;
    $("#sdeSave").disabled=true; const {error}=await SB.from("sales_leads").update(p).eq("id",l.id); $("#sdeSave").disabled=false;
    if(error){ $("#sdeMsg").textContent="Chưa lưu được: "+error.message; return; } Object.assign(l,p); SDF.edit=null; toast("Đã lưu lead"); render(); });
  A.querySelectorAll("[data-sdsel]").forEach(c=>c.addEventListener("change",()=>{ c.checked?SDF.sel.add(c.dataset.sdsel):SDF.sel.delete(c.dataset.sdsel); const n=$("#sdN"); if(n) n.textContent=SDF.sel.size; }));
  $("#sdAll")?.addEventListener("change",e=>{ A.querySelectorAll("[data-sdsel]").forEach(c=>{ c.checked=e.target.checked; e.target.checked?SDF.sel.add(c.dataset.sdsel):SDF.sel.delete(c.dataset.sdsel); }); const n=$("#sdN"); if(n) n.textContent=SDF.sel.size; });
  A.querySelectorAll("[data-cok],[data-cno]").forEach(b=>b.addEventListener("click",async()=>{ if(!sdMgr()) return; b.disabled=true; const ok=!!b.dataset.cok;
    const {error}=await SB.rpc("sales_claim_decide",{p_claim:b.dataset.cok||b.dataset.cno,p_ok:ok});
    if(error){ b.disabled=false; toast("Chưa xử lý được: "+error.message); return; } toast(ok?"Đã duyệt, lead đã giao":"Đã từ chối"); logEv("sales",ok?"duyệt yêu cầu nhận lead":"từ chối yêu cầu nhận lead"); SD={st:null}; render(); }));
  const sdGive=async(ids,to)=>{ for(let i=0;i<ids.length;i+=200){ const part=ids.slice(i,i+200); const r=await SB.from("sales_leads").update({owner_id:to,next_at:null}).in("id",part); if(r.error) return r.error;
      const r2=await SB.from("sales_acts").insert(part.map(id=>({lead_id:id,kind:"assign",note:"Giao cho "+sdName(to)}))); if(r2.error) return r2.error; } return null; };
  const splitUpd=()=>{ const n=A.querySelectorAll("[data-sdsplit]:checked").length, m=$("#sdSplitMsg"); if(m) m.textContent=n>=2&&SDF.sel.size?"mỗi người khoảng "+Math.ceil(SDF.sel.size/n)+" lead":""; };
  A.querySelectorAll("[data-sdsplit]").forEach(c=>c.addEventListener("change",splitUpd));
  A.querySelectorAll("[data-sdsel]").forEach(c=>c.addEventListener("change",splitUpd)); $("#sdAll")?.addEventListener("change",splitUpd);
  $("#sdSplit")?.addEventListener("click",async()=>{ if(!sdMgr()) return; const who=[...A.querySelectorAll("[data-sdsplit]:checked")].map(c=>c.dataset.sdsplit), ids=[...SDF.sel].filter(id=>SD.leads.some(l=>l.id===id));
    const m=$("#sdSplitMsg"); if(!ids.length){ m.textContent="Chọn lead trước."; return; } if(who.length<2){ m.textContent="Chọn ít nhất 2 người."; return; }
    const b=$("#sdSplit"); b.disabled=true; m.textContent="Đang chia…"; const done=[];
    for(let k=0;k<who.length;k++){ const g=ids.filter((_,i)=>i%who.length===k); const err=await sdGive(g,who[k]); if(err){ b.disabled=false; m.textContent="Dừng giữa chừng: "+err.message+(done.length?". Đã giao xong: "+done.join(", "):""); SD={st:null}; return; } done.push(sdName(who[k])+" "+g.length); }
    toast("Đã chia: "+done.join(", ")); logEv("sales","chia đều "+ids.length+" lead cho "+who.length+" người"); SDF.sel=new Set(); SD={st:null}; render(); });
  $("#sdAssign")?.addEventListener("click",async()=>{ if(!sdMgr()) return; const to=$("#sdTo").value, ids=[...SDF.sel].filter(id=>SD.leads.some(l=>l.id===id));
    if(!ids.length){ $("#sdMsg").textContent="Chọn lead trước."; return; } if(!to){ $("#sdMsg").textContent="Chọn người nhận."; return; }
    const b=$("#sdAssign"); b.disabled=true; $("#sdMsg").textContent="Đang giao…";
    let err=null; for(let i=0;i<ids.length&&!err;i+=200){ const part=ids.slice(i,i+200); const r=await SB.from("sales_leads").update({owner_id:to,next_at:null}).in("id",part); err=r.error;
      if(!err){ const r2=await SB.from("sales_acts").insert(part.map(id=>({lead_id:id,kind:"assign",note:"Giao cho "+sdName(to)}))); err=r2.error; } }
    if(err){ b.disabled=false; $("#sdMsg").textContent="Chưa giao được: "+err.message; return; }
    toast("Đã giao "+ids.length+" lead cho "+sdName(to)); logEv("sales","giao "+ids.length+" lead"); SDF.sel=new Set(); SD={st:null}; render(); });
}
/* ---------- Đồng bộ một chiều từ extension FarmBase (chỉ owner): extension gửi 12 tiêu chí hồ sơ vùng, app lưu ở z.fbId, z.fbs ---------- */
const FB12=["Thiếu địa chỉ","Thiếu thị trường","Thiếu tiêu chuẩn áp dụng","Chưa chọn nông dân đại diện","Thiếu ảnh bảng tên vùng trồng","Thiếu ảnh flycam","Thiếu ảnh kho thuốc","Thiếu ảnh quy trình thu hoạch","Thiếu ảnh bẫy côn trùng","DN thiếu CCCD mặt trước","DN thiếu CCCD mặt sau","DN thiếu giấy phép kinh doanh"];
// loại hồ sơ của app (ô F) ứng với tiêu chí FarmBase nào
const FB_HS={fly:[5],kho:[6,8]};
const FBS_OLD=14; // ngày
let FBS=null, FBSERR="";
function fbDays(iso){ return iso?Math.floor((Date.now()-new Date(iso))/864e5):null; }
function fbWhen(iso){ if(!iso) return "—"; const d=new Date(iso), p=n=>String(n).padStart(2,"0"); return p(d.getDate())+"/"+p(d.getMonth()+1)+" "+p(d.getHours())+":"+p(d.getMinutes()); }
// trạng thái đồng bộ của một vùng: none (chưa ghép), old (quá 14 ngày), ok
function fbsState(z){ const f=z?.fbs; if(!z?.fbId||!f) return "none"; return fbDays(f.syncedAt)>FBS_OLD?"old":"ok"; }
function fbsLine(z){ const f=z?.fbs, st=fbsState(z);
  if(st==="none") return '<div class="sub" style="margin-top:4px">FarmBase (extension): <span class="pill">Chưa ghép</span></div>';
  const miss=(f.flags||[]).map((x,i)=>x===1?FB12[i]:"").filter(Boolean), unk=(f.flags||[]).filter(x=>x===-1).length;
  return '<div class="sub" style="margin-top:4px">FarmBase (extension): <span class="pill '+(st==="old"||miss.length?"warn":"good")+'">'+(st==="old"?"Cũ, ":"")+(miss.length?"thiếu "+miss.length+"/12":"đủ 12 mục")+'</span>'
   +(unk?' · '+unk+' mục chưa kiểm tra':'')+' · KT hồ sơ '+(f.checkedAt?dm(f.checkedAt.slice(0,10)):"chưa")+' · đồng bộ '+fbWhen(f.syncedAt)
   +(miss.length?'<div style="margin-top:2px">'+esc(miss.join(", "))+'</div>':'')+'</div>'; }
// ô F của app lệch với FarmBase: [mã hồ sơ, "tick" (app tick nhưng FarmBase thiếu) | "untick" (FarmBase đủ nhưng app chưa tick)]
function fbsDiff(z){ const f=z?.fbs; if(!f||fbsState(z)==="none") return []; const out=[];
  Object.entries(FB_HS).forEach(([k,ix])=>{ const v=ix.map(i=>f.flags?.[i]); if(v.some(x=>x!==0&&x!==1)) return; const x=hsItem(z,k); if(x.hard==="na") return;
    const fbOk=v.every(y=>y===0); if(x.fb&&!fbOk) out.push([k,"tick"]); else if(!x.fb&&fbOk) out.push([k,"untick"]); });
  return out; }
async function loadFbs(){ const r=await callApiAdmin({action:"fb_status"}); if(r.error){ FBSERR=String(r.error); FBS={}; } else { FBSERR=""; FBS=r.last||{}; } if(ui.view==="api") render(); }
function fbsPanel(){ if(!isOwner()) return "";
  if(FBS===null){ loadFbs(); return '<div class="panel" style="margin-bottom:12px"><h2>Đồng bộ FarmBase từ extension</h2><div class="sub">Đang tải…</div></div>'; }
  const zs=Object.values(S.zones).filter(z=>z.active!==false), n=zs.length, paired=zs.filter(z=>z.fbId).length, old=zs.filter(z=>fbsState(z)==="old").length;
  const zk=new Set(Object.values(S.zones).filter(z=>!z.fbId).map(z=>zkey(z.name))), c=FBS.counts||{};
  const L=(FBS.unmatched||[]).slice().sort((a,b)=>(zk.has(zkey(b.name))-zk.has(zkey(a.name)))||String(a.name||"").localeCompare(String(b.name||""),"vi")); // vùng trùng tên với app lên đầu
  let h='<div class="panel" style="margin-bottom:12px"><h2>Đồng bộ FarmBase từ extension</h2><div class="sub">Chỉ đi một chiều: extension đọc admin.farmbase.vn, owner bấm "Đồng bộ lên BVI" trên trang quản lý của extension. App lưu vào danh sách Vùng FarmBase riêng (12 mục hồ sơ, số đếm nông hộ, lô), không ghép và không sửa vùng trồng hiện có. Tạo khóa bằng "Tạo khóa mới", chọn mẫu "Extension FarmBase".</div>';
  if(FBSERR) h+='<div class="alert bad" style="margin-top:8px">'+esc(FBSERR)+'</div>';
  h+='<div class="row" style="gap:6px 16px;flex-wrap:wrap;margin-top:8px"><span>Lần gần nhất: <b>'+(FBS.syncedAt?fbWhen(FBS.syncedAt):"chưa có")+'</b>'+(FBS.ranAt?' <span class="sub">(dữ liệu lấy lúc '+fbWhen(FBS.ranAt)+')</span>':'')+'</span>'
   +(FBS.sent?'<span>Gửi '+FBS.sent+' vùng: cập nhật '+(c.updated||0)+', giữ nguyên '+(c.same||0)+(c.old?', bỏ qua bản cũ '+c.old:'')+'</span>':'')
   +'<span>Xem ở trang <a href="#vung-fb" style="color:var(--brand)">Vùng FarmBase</a></span><button class="btn sm" id="fbsRe">Tải lại</button></div>';
  if(L.length){ const zopts=Object.entries(S.zones).filter(([,z])=>z.active!==false&&!z.fbId).sort((a,b)=>(a[1].name||"").localeCompare(b[1].name||"","vi"));
    h+='<details style="margin-top:8px"'+(ui.fbsOpen?" open":"")+' id="fbsDet"><summary style="cursor:pointer"><b>'+L.length+' vùng FarmBase chưa ghép</b> <span class="sub">chọn vùng tương ứng trên app, lần đồng bộ sau tự khớp</span></summary><div style="display:grid;gap:6px;margin-top:6px">'
     +L.slice(0,300).map(r=>'<div style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;min-width:0"><div style="overflow-wrap:anywhere"><b>'+esc(r.name||r.id)+'</b> <span class="sub">'+esc([r.code,r.ward,r.province,r.vendor].filter(Boolean).join(" · "))+' · thiếu '+(r.missing||0)+'/12</span></div>'
       +'<div class="row" style="gap:6px;flex-wrap:nowrap;margin-top:4px"><select data-fbsz="'+esc(r.id)+'" style="flex:1;min-width:0"><option value="">Chọn vùng trên app…</option>'+zopts.map(([k,z])=>'<option value="'+esc(k)+'"'+(zkey(z.name)===zkey(r.name)?" selected":"")+'>'+esc(z.name)+(z.ward?' · '+esc(z.ward):'')+'</option>').join("")+'</select><button class="btn sm" data-fbsp="'+esc(r.id)+'">Ghép</button></div></div>').join("")
     +(L.length>300?'<div class="sub">Còn '+(L.length-300)+' vùng, ghép xong đợt này rồi tải lại.</div>':'')+'</div></details>'; }
  return h+'</div>'; }
function bindFbs(A){
  $("#fbsRe")?.addEventListener("click",()=>{ FBS=null; render(); });
  $("#fbsDet")?.addEventListener("toggle",e=>{ ui.fbsOpen=e.target.open; });
  A.querySelectorAll("[data-fbsp]").forEach(b=>b.addEventListener("click",async()=>{ const id=b.dataset.fbsp, sel=A.querySelector('[data-fbsz="'+CSS.escape(id)+'"]'), zone=sel?.value;
    if(!zone){ toast("Chọn vùng trên app trước"); return; } b.disabled=true;
    const r=await callApiAdmin({action:"fb_pair",fbId:id,zone}); if(r.error){ b.disabled=false; toast(r.error); return; }
    toast("Đã ghép với "+(S.zones[zone]?.name||zone)); FBS=null; render(); })); }

/* ---------- Trang "Vùng FarmBase": mọi vùng FarmBase đồng bộ từ extension (owner, quản lý xem) ---------- */
const FB_STL={ACTIVE:["Đang hoạt động","good"],PENDING:["Chờ duyệt","warn"],INACTIVE:["Đã ngừng",""]};
const FB_DP=[["fNoId","Nông hộ thiếu số CCCD","NH: số CCCD"],["fNoImg","Nông hộ thiếu ảnh CCCD","NH: ảnh CCCD"],["pNoImg","Lô thiếu ảnh sổ đỏ","Lô: ảnh sổ đỏ"],["pNoPage","Lô thiếu số tờ bản đồ","Lô: số tờ"],["pNoPlot","Lô thiếu số thửa","Lô: số thửa"],["pNoTrees","Lô thiếu số cây","Lô: số cây"],["pNoArea","Lô thiếu diện tích","Lô: diện tích"],["pZero","Lô diện tích bằng 0","Lô: DT = 0"],["dup","Trùng tờ, thửa trong vùng","Trùng thửa"]];
let FBU=null, FBUERR="", FBUL=false, FBN={}; // FBN: ghi chú, ngày vụ, bước tiếp theo, tiến độ hồ sơ giấy theo id vùng FarmBase (API /api/fb, lưu app_secrets fbsync:notes)
async function fbPost(body){ const {data}=await SB.auth.getSession(); const res=await fetch(SB_URL+"/functions/v1/api/fb",{method:"POST",headers:{"Content-Type":"application/json",apikey:SB_KEY,Authorization:"Bearer "+(data.session?.access_token||"")},body:JSON.stringify(body||{})});
  const j=await res.json().catch(()=>null); return j||{error:"Lỗi "+res.status}; }
// Bước tiếp theo: [{d: ngày, act: làm gì, res: kết quả cần đạt, done}]
const fbToday=()=>new Date(Date.now()+7*3600e3).toISOString().slice(0,10);
function fbNextStep(n){ const L=(n?.steps||[]).filter(x=>!x.done); if(!L.length) return null; return L.slice().sort((a,b)=>(a.d||"9999").localeCompare(b.d||"9999"))[0]; }
function fbStepCell(u){ const n=FBN[u.id]||{}, all=n.steps||[], x=fbNextStep(n); if(!all.length) return '<span class="fn">Chưa có</span>';
  if(!x) return fbBadge("Xong "+all.length+" bước","ok");
  const late=x.d&&x.d<fbToday(); return (x.d?fbBadge((late?"Trễ · ":"")+fbDate(x.d),late?"err":""):'')+'<div style="overflow-wrap:anywhere">'+esc(x.act||"")+'</div>'+(x.res?'<div class="sub" style="font-size:12px">→ '+esc(x.res)+'</div>':'')+(all.filter(y=>!y.done).length>1?'<div class="sub" style="font-size:12px">+'+(all.filter(y=>!y.done).length-1)+' bước nữa</div>':''); }
// Hồ sơ scan: lấy từ FarmBase qua extension (file tên chứa "scan_hoso" trong thư viện vùng), chỉ cần có hay chưa
function fbScanCell(u){ return u.scan>0?fbBadge("Có"+(u.scan>1?" ("+u.scan+" file)":""),"ok"):u.scan===0?fbBadge("Chưa có","err"):u.scan===-1?fbBadge("Lỗi đọc thư viện","err"):'<span class="fn">Chưa kiểm tra</span>'; }
const fbDate=s=>s?s.slice(8,10)+"/"+s.slice(5,7)+"/"+s.slice(0,4):"";
function openFbNote(id){ const u=(FBU?.units||[]).find(x=>x.id===id); if(!u) return; const n=FBN[id]||{};
  showDrawer('<div class="dh"><div style="min-width:0"><h2 style="overflow-wrap:anywhere">'+esc(u.name||id)+'</h2><div class="sub">'+esc([u.code,u.vendor].filter(Boolean).join(" · "))+'</div></div><button class="btn sm" data-close>Đóng</button></div>'
   +'<div class="db"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px"><label>Ngày thu hoạch<input type="date" id="fbnH" value="'+esc(n.harvest||"")+'" style="width:100%"></label><label>Ngày kết thúc vụ<input type="date" id="fbnE" value="'+esc(n.seasonEnd||"")+'" style="width:100%"></label></div>'
   +'<label style="display:block;margin-top:8px">Ghi chú<textarea id="fbnN" rows="5" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--surface)" placeholder="Tình trạng hồ sơ, việc cần làm, người phụ trách…">'+esc(n.note||"")+'</textarea></label>'
   +'<h3 style="margin:12px 0 4px;font-size:14px">Bước tiếp theo</h3><div class="sub" style="font-size:12px">Ngày nào, làm gì, ra kết quả gì.</div><div id="fbnL"></div><button class="btn sm" id="fbnA" style="margin-top:6px">+ Thêm bước</button>'
   +'<div class="sub" style="font-size:12px;margin-top:8px">Không ghi số CCCD, số điện thoại nông hộ.'+(n.updatedAt?' Sửa lần cuối '+fbWhen(n.updatedAt)+'.':'')+'</div>'
   +'<div class="row" style="gap:6px;margin-top:8px"><button class="btn pri" id="fbnS">Lưu</button><span class="sub" id="fbnM"></span></div></div>');
  const IN='width:100%;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--surface);font:inherit';
  const stepRow=x=>'<div class="fbst" style="border:1px solid var(--line);border-radius:8px;padding:8px;margin-top:6px;display:grid;gap:6px">'
    +'<div class="row between" style="gap:6px;flex-wrap:nowrap"><input type="date" class="fbsD" value="'+esc(x.d||"")+'" style="'+IN+';max-width:170px"><label class="row" style="gap:4px;white-space:nowrap"><input type="checkbox" class="fbsX"'+(x.done?' checked':'')+'> Xong</label><button class="btn sm fbsR" title="Xóa bước">Xóa</button></div>'
    +'<input class="fbsA" maxlength="300" placeholder="Làm gì" value="'+esc(x.act||"")+'" style="'+IN+'"><input class="fbsK" maxlength="300" placeholder="Kết quả cần đạt" value="'+esc(x.res||"")+'" style="'+IN+'"></div>';
  const box=$("#fbnL"), add=x=>{ box.insertAdjacentHTML("beforeend",stepRow(x)); box.lastElementChild.querySelector(".fbsR").addEventListener("click",e=>e.target.closest(".fbst").remove()); };
  (n.steps||[]).forEach(add); if(!(n.steps||[]).length) add({d:fbToday()});
  $("#fbnA").addEventListener("click",()=>{ add({d:fbToday()}); box.lastElementChild.querySelector(".fbsA").focus(); });
  $("#fbnS").addEventListener("click",async()=>{ const steps=[...box.querySelectorAll(".fbst")].map(r=>({d:r.querySelector(".fbsD").value||"",act:r.querySelector(".fbsA").value.trim(),res:r.querySelector(".fbsK").value.trim(),done:r.querySelector(".fbsX").checked})).filter(x=>x.act||x.res);
    const d={harvest:$("#fbnH").value||"",seasonEnd:$("#fbnE").value||"",note:$("#fbnN").value.trim().slice(0,2000),steps,name:u.name||""};
    if(d.harvest&&d.seasonEnd&&d.seasonEnd<d.harvest){ $("#fbnM").textContent="Ngày kết thúc vụ đang trước ngày thu hoạch."; return; }
    $("#fbnS").disabled=true; $("#fbnM").textContent="Đang lưu…";
    const r=await fbPost({action:"note",id,data:d}).catch(()=>({error:"Không kết nối được máy chủ"})); if(r.error){ $("#fbnS").disabled=false; $("#fbnM").textContent="Chưa lưu được: "+r.error; return; }
    FBN[id]=r.note||d; toast("Đã lưu"); closeDrawer(); render(); }); }
let FBF={q:"",st:"",ven:"",hs:"",dp:"",crit:"",n:60,view:""};
const FB12S=["Địa chỉ","Thị trường","Tiêu chuẩn","ND đại diện","Ảnh bảng tên","Ảnh flycam","Ảnh kho thuốc","Ảnh thu hoạch","Ảnh bẫy côn trùng","DN: CCCD trước","DN: CCCD sau","DN: GPKD"];
const FBT_CSS='<style>.fbt{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--surface);margin-top:4px}.fbt table{border-collapse:collapse;width:100%;font-size:13px}.fbt th,.fbt td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;white-space:nowrap;vertical-align:top}.fbt th{position:sticky;top:0;background:var(--sunk);font-weight:600;z-index:1}.fbt th.v{writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;padding:8px 3px;vertical-align:bottom;text-align:left}.fbt td.c{text-align:center;padding:6px 2px}.fbt td.nm{white-space:normal;min-width:220px}.fbt td.w{white-space:normal;min-width:150px}.fbt .f1{color:#fff;background:var(--bad);border-radius:4px;padding:1px 5px;font-size:11px}.fbt .f0{color:var(--good)}.fbt .fn{color:var(--muted);font-size:11px}.fbt .n1{color:var(--warn);font-weight:600}.fbt .n2{color:var(--bad);font-weight:600}.fbt tr:hover td{background:var(--chip)}</style>';
const FBB='display:inline-block;border-radius:4px;padding:1px 6px;font-size:11px;white-space:nowrap;margin:2px 3px 0 0;';
const fbBadge=(t,k)=>'<span style="'+FBB+(k==="err"?'background:#fee2e2;color:#b91c1c':k==="ok"?'background:#dcfce7;color:#15803d':'background:#fef3c7;color:#92400e')+'">'+esc(t)+'</span>';
function fbMissCell(u){ const d=u.deep, ok=d&&!d.error, fl=u.flags||[], m=fl.filter(x=>x===1).length, unk=fl.filter(x=>x===-1).length;
  let h='<span style="color:var(--brand);text-decoration:underline">'+(ok?d.f+' hộ · '+d.p+' lô':'Xem chi tiết')+'</span>'+(u.areaM2!=null?' <span class="sub" style="font-size:12px">'+fmtHa(u.areaM2/10000)+' ha</span>':'')+'<br>';
  h+=m?fbBadge("Hồ sơ vùng: "+m+"/12","err"):unk?fbBadge("Hồ sơ vùng: "+unk+" chưa KT",""):fbBadge("Hồ sơ vùng đủ","ok");
  if(!d) h+=fbBadge("Chưa KT nông hộ, lô",""); else if(d.error) h+=fbBadge("Lỗi đọc nông hộ, lô","err");
  else { const bad=FB_DP.filter(([k])=>d[k]>0); h+=bad.length?bad.map(([k,,sh])=>fbBadge(sh+" "+d[k],k==="dup"||k==="pZero"?"err":"")).join(""):fbBadge("Nông hộ, lô đủ","ok"); }
  return h; }
function openFbDetail(id){ const u=(FBU?.units||[]).find(x=>x.id===id); if(!u) return; const d=u.deep, ok=d&&!d.error, fl=u.flags||[], st=FB_STL[u.status]||[u.status||"",""], n=FBN[id]||{};
  const tile=(v,l,warn)=>'<div class="panel" style="padding:8px 10px;min-width:0"><b style="font-size:18px'+(warn&&v?';color:var(--bad)':'')+'">'+v+'</b><div class="sub" style="font-size:12px">'+esc(l)+'</div></div>';
  let h='<div class="dh"><div style="min-width:0"><h2 style="overflow-wrap:anywhere">'+esc(u.name||id)+'</h2><div class="sub">'+esc([u.code,u.vendor,st[0]].filter(Boolean).join(" · "))+'</div></div><button class="btn sm" data-close>Đóng</button></div><div class="db">';
  if(ok) h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px">'+tile(d.f,"Nông hộ")+tile(d.p,"Lô")+FB_DP.map(([k,l])=>tile(d[k]||0,l,true)).join("")+'</div>';
  else h+='<div class="alert'+(d?.error?' bad':'')+'">'+(d?.error?'Extension không đọc được nông hộ, lô của vùng này.':'Lần đồng bộ này chưa kiểm tra nông hộ, lô (bật "Kiểm tra nông hộ và lô" trên extension).')+'</div>';
  h+='<div style="margin-top:10px">'+(u.scan>0?fbBadge("Có "+u.scan+" file scan hồ sơ trong thư viện","ok"):u.scan===0?fbBadge("Chưa có file scan hồ sơ (tên chứa scan_hoso) trong thư viện","err"):u.scan===-1?fbBadge("Không đọc được thư viện vùng","err"):fbBadge("Chưa kiểm tra file scan hồ sơ (cần extension 2.4.0)",""))+'</div>';
  // chi tiết ai thiếu, lô nào (extension 2.7.0 trở lên)
  const X='<span style="'+FBB+'background:#fee2e2;color:#b91c1c;margin:0">Thiếu</span>', V='<span style="color:var(--good)">✓</span>', yn=v=>v?X:V;
  const TB='<div style="overflow-x:auto;flex-shrink:0;border:1px solid var(--line);border-radius:8px"><table style="border-collapse:collapse;width:100%;font-size:13px">', TH='padding:6px 8px;text-align:left;background:var(--sunk);font-weight:600;white-space:nowrap', TD='padding:6px 8px;border-top:1px solid var(--line);white-space:nowrap';
  if(ok&&d.farmers?.length) h+='<h3 style="margin:12px 0 4px;font-size:14px">Nông hộ còn thiếu ('+d.farmers.length+')</h3>'+TB+'<tr><th style="'+TH+'">Nông hộ</th><th style="'+TH+'">Số CCCD</th><th style="'+TH+'">Ảnh trước</th><th style="'+TH+'">Ảnh sau</th></tr>'
    +d.farmers.map(f=>'<tr><td style="'+TD+';white-space:normal;min-width:140px">'+esc(f.n||"(không tên)")+'</td><td style="'+TD+'">'+yn(f.i)+'</td><td style="'+TD+'">'+yn(f.f)+'</td><td style="'+TD+'">'+yn(f.b)+'</td></tr>').join("")+'</table></div>';
  if(ok&&d.dupG?.length) h+='<h3 style="margin:12px 0 4px;font-size:14px">Lô trùng tờ, thửa ('+d.dupG.length+' nhóm)</h3>'+d.dupG.map(g=>'<div style="margin-top:3px">'+g.map(c=>fbBadge(c,"err")).join("")+'</div>').join("");
  else if(ok&&d.dupPlots?.length) h+='<h3 style="margin:12px 0 4px;font-size:14px">Lô trùng tờ, thửa</h3><div>'+d.dupPlots.map(c=>fbBadge(c,"err")).join("")+'</div>';
  if(ok&&d.plots?.length) h+='<h3 style="margin:12px 0 4px;font-size:14px">Lô còn thiếu hoặc cần xem lại ('+d.plots.length+')</h3>'+TB+'<tr><th style="'+TH+'">Lô</th><th style="'+TH+'">Nông hộ</th><th style="'+TH+'">Ảnh sổ đỏ</th><th style="'+TH+'">Số tờ</th><th style="'+TH+'">Số thửa</th><th style="'+TH+'">Số cây</th><th style="'+TH+'">Diện tích (m²)</th></tr>'
    +d.plots.map(p=>'<tr><td style="'+TD+'">'+esc(p.c||"")+(p.d?' '+fbBadge("Trùng","err"):'')+'</td><td style="'+TD+';white-space:normal;min-width:120px">'+esc(p.o||"")+'</td><td style="'+TD+'">'+yn(p.img)+'</td><td style="'+TD+'">'+yn(p.pg)+'</td><td style="'+TD+'">'+yn(p.pl)+'</td><td style="'+TD+'">'+(p.t?X:esc(String(p.trees??"")))+'</td><td style="'+TD+'">'+(p.a?X:p.z?fbBadge("0","err"):esc(String(p.area??"")))+'</td></tr>').join("")+'</table></div>';
  if(ok&&!d.farmers&&(d.fNoId||d.fNoImg||d.pNoImg||d.pNoPage||d.pNoPlot||d.pNoTrees||d.pNoArea||d.pZero)) h+='<div class="sub" style="margin-top:8px">Cập nhật extension 2.7.0 và đồng bộ lại để xem tên từng nông hộ, mã từng lô còn thiếu.</div>';
  h+='<h3 style="margin:12px 0 4px;font-size:14px">Hồ sơ vùng (12 mục)'+(u.checkedAt?' <span class="sub" style="font-weight:400">kiểm tra trên FarmBase '+fbDate(u.checkedAt.slice(0,10))+'</span>':'')+'</h3><div style="border:1px solid var(--line);border-radius:8px">'
   +FB12S.map((l,i)=>'<div class="row between" style="padding:6px 10px;gap:8px;'+(i?'border-top:1px solid var(--line)':'')+'"><span>'+esc(FB12[i].replace(/^(Thiếu|Chưa chọn) /,"").replace(/^DN thiếu /,"Doanh nghiệp: ").replace(/^./,c=>c.toUpperCase()))+'</span>'+(fl[i]===1?fbBadge("Thiếu","err"):fl[i]===0?'<span style="color:var(--good)">✓</span>':fbBadge("Chưa kiểm tra",""))+'</div>').join("")+'</div>';
  if(n.steps?.length) h+='<h3 style="margin:12px 0 4px;font-size:14px">Bước tiếp theo</h3><div style="border:1px solid var(--line);border-radius:8px">'+n.steps.slice().sort((a,b)=>(a.done-b.done)||(a.d||"9999").localeCompare(b.d||"9999")).map((x,i)=>'<div style="padding:6px 10px;'+(i?'border-top:1px solid var(--line)':'')+(x.done?';opacity:.6':'')+'"><div>'+(x.done?fbBadge("Xong","ok"):x.d&&x.d<fbToday()?fbBadge("Trễ","err"):'')+'<b>'+(x.d?fbDate(x.d):'Chưa có ngày')+'</b></div><div style="overflow-wrap:anywhere">'+esc(x.act||"")+'</div>'+(x.res?'<div class="sub" style="overflow-wrap:anywhere">Kết quả: '+esc(x.res)+'</div>':'')+'</div>').join("")+'</div>';
  if(n.harvest||n.seasonEnd||n.note) h+='<h3 style="margin:12px 0 4px;font-size:14px">Ghi chú</h3><div class="sub">Thu hoạch: '+(n.harvest?fbDate(n.harvest):'–')+' · Kết thúc vụ: '+(n.seasonEnd?fbDate(n.seasonEnd):'–')+'</div>'+(n.note?'<div style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:4px">'+esc(n.note)+'</div>':'');
  h+='<div class="sub" style="font-size:12px;margin-top:10px">Không lưu số CCCD, số tờ, số thửa; xem trên FarmBase hoặc báo cáo extension. Đồng bộ '+fbWhen(u.syncedAt)+'.</div><div class="row" style="margin-top:8px"><button class="btn sm" data-fbn2="'+esc(id)+'">Sửa ghi chú, bước tiếp theo</button></div></div>';
  showDrawer(h); $("#layer [data-fbn2]")?.addEventListener("click",()=>openFbNote(id)); }
function fbTable(L){
  const cell=f=>f===1?'<span class="f1">Thiếu</span>':f===0?'<span class="f0">✓</span>':'<span class="fn">?</span>';
  const head='<tr><th>#</th><th>Tên vùng trồng</th><th>Doanh nghiệp</th><th>Tỉnh / Xã</th><th>Trạng thái</th><th>Thiếu</th><th>Hồ sơ scan</th><th>Bước tiếp theo</th><th>Thu hoạch</th><th>Kết thúc vụ</th><th>Ghi chú</th>'
    +FB12S.map((l,i)=>'<th class="v" title="'+esc(FB12[i])+'">'+esc(l)+'</th>').join("")
    +FB_DP.map(([,l,sh])=>'<th class="v" title="'+esc(l)+'">'+esc(sh)+'</th>').join("")+'</tr>';
  const rows=L.map((u,i)=>{ const st=FB_STL[u.status]||[u.status||"?",""], d=u.deep, ok=d&&!d.error;
    const dl=ok?FB_DP.filter(([k])=>d[k]>0):[];
    return '<tr><td class="sub">'+(i+1)+'</td><td class="nm"><b>'+esc(u.name||u.id)+'</b>'+(u.code?'<div class="sub" style="font-size:12px">'+esc(u.code)+'</div>':'')+'</td>'
     +'<td class="w">'+esc(u.vendor||"")+'</td><td>'+esc(u.province||"")+'<div class="sub" style="font-size:12px">'+esc(u.ward||"")+'</div></td>'
     +'<td><span class="pill '+st[1]+'" style="font-size:12px">'+esc(st[0])+'</span></td>'
     +'<td class="w" data-fbd="'+esc(u.id)+'" title="Bấm để xem ai thiếu, lô nào" style="min-width:190px;max-width:280px;cursor:pointer">'+fbMissCell(u)+'</td>'
     +'<td>'+fbScanCell(u)+'</td>'
     +'<td class="w" style="min-width:170px;max-width:260px"><button data-fbn="'+esc(u.id)+'" title="Nhập bước tiếp theo" style="border:0;padding:0;background:none;text-align:left;cursor:pointer;font:inherit;color:inherit;width:100%">'+fbStepCell(u)+'</button></td>'
     +(()=>{ const n=FBN[u.id]||{}; return '<td>'+(n.harvest?fbDate(n.harvest):'<span class="fn">–</span>')+'</td><td>'+(n.seasonEnd?fbDate(n.seasonEnd):'<span class="fn">–</span>')+'</td>'
       +'<td class="w" style="max-width:260px"><div style="display:flex;gap:6px;align-items:flex-start"><span style="flex:1;min-width:0;overflow-wrap:anywhere">'+(n.note?esc(n.note.length>90?n.note.slice(0,90)+"…":n.note):'<span class="fn">Chưa có</span>')+'</span><button class="btn sm" data-fbn="'+esc(u.id)+'" title="Nhập ghi chú, ngày thu hoạch, ngày kết thúc vụ">Sửa</button></div></td>'; })()
     +(u.flags||[]).map(f=>'<td class="c">'+cell(f)+'</td>').join("")
     +FB_DP.map(([k])=>'<td class="c"'+(k==="dup"&&d?.dupPlots?.length?' title="Lô trùng: '+esc(d.dupPlots.join(", "))+'"':'')+'>'+(!ok?'<span class="fn">–</span>':d[k]>0?'<span class="'+(k==="dup"||k==="pZero"?"n2":"n1")+'">'+d[k]+'</span>':'<span class="f0">✓</span>')+'</td>').join("")+'</tr>'; }).join("");
  return FBT_CSS+'<div class="fbt"><table>'+head+rows+'</table></div>'; }
async function loadFbu(){ if(FBUL) return; FBUL=true;
  try{ const {data}=await SB.auth.getSession(); const res=await fetch(SB_URL+"/functions/v1/api/fb",{method:"POST",headers:{"Content-Type":"application/json",apikey:SB_KEY,Authorization:"Bearer "+(data.session?.access_token||"")},body:"{}"});
    const j=await res.json().catch(()=>null); if(!j||j.error){ FBUERR=String(j?.error||("Lỗi "+res.status)); FBU={units:[]}; } else { FBUERR=""; FBU=j; }
    FBN=(j&&!j.error&&j.notes)||{}; }
  catch(e){ FBUERR="Không kết nối được máy chủ"; FBU={units:[]}; }
  FBUL=false; if(ui.view==="vung-fb") render(); }
const fbDeepOk=u=>u.deep&&!u.deep.error&&!(u.deep.issues>0);
function fbuList(){ const F=FBF, n=norm(F.q||"");
  return (FBU?.units||[]).filter(u=>(!n||norm([u.name,u.code,u.vendor,u.ward,u.province,FBN[u.id]?.note,...(FBN[u.id]?.steps||[]).map(x=>x.act+" "+x.res)].join(" ")).includes(n))
    &&(!F.st||u.status===F.st)&&(!F.ven||u.vendor===F.ven)
    &&(!F.hs||(F.hs==="ok"?u.missing===0&&(u.flags||[]).every(x=>x===0):F.hs==="miss"?u.missing>0:!(u.flags||[]).length||(u.flags||[]).some(x=>x===-1)))
    &&(!F.dp||(F.dp==="ok"?fbDeepOk(u):F.dp==="miss"?u.deep&&!u.deep.error&&u.deep.issues>0:F.dp==="err"?u.deep?.error:!u.deep))
    &&(!F.crit||(F.crit==="s:1"?u.scan>0:F.crit==="s:0"?u.scan===0:F.crit.startsWith("d:")?(u.deep?.[F.crit.slice(2)]||0)>0:(u.flags||[])[+F.crit]===1)))
   .sort((a,b)=>((b.missing||0)+(b.deep?.issues||0))-((a.missing||0)+(a.deep?.issues||0))||String(a.name).localeCompare(String(b.name),"vi")); }
// Lịch bước tiếp theo: các bước của những vùng đang lọc, theo tháng
function fbCal(L){
  const td=fbToday(), mon=FBF.mon||td.slice(0,7), [y,m]=mon.split("-").map(Number);
  const items=[]; L.forEach(u=>(FBN[u.id]?.steps||[]).forEach(x=>items.push({u,x})));
  const nm=u=>(u.name||u.id).replace(/^v[uù]ng\s+tr[oồ]ng\s+(s[aầ]u\s+ri[eê]ng\s+)?/i,"");
  const it=(o,full)=>{ const late=!o.x.done&&o.x.d&&o.x.d<td, k=o.x.done?"ok":late?"err":"";
    return '<button data-fbn="'+esc(o.u.id)+'" title="'+esc(nm(o.u)+": "+(o.x.act||"")+(o.x.res?" → "+o.x.res:""))+'" style="display:block;width:100%;text-align:left;border:0;border-radius:6px;padding:3px 6px;margin-top:3px;cursor:pointer;font:inherit;font-size:12px;line-height:1.35;'
      +(k==="ok"?'background:#dcfce7;color:#15803d;text-decoration:line-through':k==="err"?'background:#fee2e2;color:#b91c1c':'background:var(--chip);color:inherit')+'"><b>'+esc(full?nm(o.u):(nm(o.u).length>22?nm(o.u).slice(0,22)+"…":nm(o.u)))+'</b> '+esc(full?(o.x.act||""):((o.x.act||"").length>40?o.x.act.slice(0,40)+"…":o.x.act||""))
      +(full&&o.x.res?'<div style="opacity:.8">→ '+esc(o.x.res)+'</div>':'')+'</button>'; };
  const late=items.filter(o=>!o.x.done&&o.x.d&&o.x.d<td).sort((a,b)=>a.x.d.localeCompare(b.x.d)), nod=items.filter(o=>!o.x.d&&!o.x.done);
  let h='';
  if(!items.length) return h+'<div class="alert">Chưa có vùng nào có bước tiếp theo. Bấm Sửa ở một vùng để thêm bước (ngày, làm gì, kết quả).</div>';
  if(late.length) h+='<details class="panel" style="padding:8px 10px;margin-bottom:8px" open><summary style="cursor:pointer;color:var(--bad);font-weight:600">Trễ hạn, chưa xong ('+late.length+')</summary>'+late.map(o=>'<div style="display:flex;gap:6px;align-items:flex-start"><span class="sub" style="font-size:12px;min-width:44px;padding-top:5px">'+fbDate(o.x.d).slice(0,5)+'</span><div style="flex:1;min-width:0">'+it(o,true)+'</div></div>').join("")+'</details>';
  if(nod.length) h+='<details class="panel" style="padding:8px 10px;margin-bottom:8px"><summary style="cursor:pointer;font-weight:600">Chưa có ngày ('+nod.length+')</summary>'+nod.map(o=>it(o,true)).join("")+'</details>';
  h+='<div class="row between" style="gap:6px;margin:6px 0;flex-wrap:nowrap"><div class="row" style="gap:4px"><button class="btn sm" data-fbm="-1">‹</button><b style="min-width:110px;text-align:center">Tháng '+m+'/'+y+'</b><button class="btn sm" data-fbm="1">›</button></div><button class="btn sm" data-fbm="0">Hôm nay</button></div>';
  const days=new Date(Date.UTC(y,m,0)).getUTCDate(), ds=d=>mon+"-"+String(d).padStart(2,"0"), by={};
  items.forEach(o=>{ if(o.x.d&&o.x.d.startsWith(mon)) (by[o.x.d]=by[o.x.d]||[]).push(o); });
  const WD=["CN","T2","T3","T4","T5","T6","T7"];
  if(innerWidth<760){ const ks=Object.keys(by).sort();
    h+=ks.length?ks.map(k=>'<div class="panel" style="padding:8px 10px;margin-top:6px'+(k===td?';border-color:var(--brand)':'')+'"><div style="font-weight:600">'+WD[new Date(k+"T00:00:00Z").getUTCDay()]+' '+fbDate(k).slice(0,5)+(k===td?' <span class="sub">· hôm nay</span>':'')+'</div>'+by[k].map(o=>it(o,true)).join("")+'</div>').join(""):'<div class="sub" style="margin-top:6px">Tháng này chưa có bước nào.</div>';
    return h; }
  const first=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7; // tuần bắt đầu thứ Hai
  let g='<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px">'+["T2","T3","T4","T5","T6","T7","CN"].map(w=>'<div class="sub" style="font-size:12px;text-align:center">'+w+'</div>').join("");
  for(let i=0;i<first;i++) g+='<div></div>';
  for(let d=1;d<=days;d++){ const k=ds(d), L2=by[k]||[];
    g+='<div style="min-height:92px;border:1px solid '+(k===td?'var(--brand)':'var(--line)')+';border-radius:8px;padding:4px;background:var(--surface);min-width:0"><div style="font-size:12px;'+(k===td?'color:var(--brand);font-weight:700':'color:var(--muted)')+'">'+d+'</div>'+L2.slice(0,4).map(o=>it(o,false)).join("")+(L2.length>4?'<div class="sub" style="font-size:11px;margin-top:2px">+'+(L2.length-4)+' bước</div>':'')+'</div>'; }
  return h+g+'</div>'; }
function vFbUnits(){
  if(!canManage()) return '<div class="alert bad">Chỉ owner, quản lý xem trang này.</div>';
  if(FBU===null){ loadFbu(); return '<div class="empty">Đang tải vùng FarmBase…</div>'; }
  const U=FBU.units||[], L=fbuList(), F=FBF;
  const dk=U.filter(u=>u.deep&&!u.deep.error), cnt=f=>U.filter(f).length, sum=k=>dk.reduce((s,u)=>s+(u.deep[k]||0),0);
  const old=FBU.syncedAt?fbDays(FBU.syncedAt):null;
  let h='<div class="row between" style="gap:8px;flex-wrap:wrap;align-items:flex-end"><div style="min-width:0"><h1>Vùng FarmBase</h1><div class="sub">Danh sách vùng trồng trên FarmBase do owner đồng bộ từ extension (một chiều), độc lập với danh sách Vùng trồng. Chỉ có số đếm đủ/thiếu, không có CCCD, số tờ, số thửa. Chi tiết từng nông hộ, lô xem trên extension.</div></div><div class="row" style="gap:6px"><button class="btn" id="fbuHelp">Hướng dẫn</button><button class="btn" id="fbuRe">Tải lại</button><button class="btn" id="fbuCsv">Tải CSV</button><button class="btn" id="fbuPdf">Xuất PDF</button></div></div>';
  if(FBUERR) h+='<div class="alert bad" style="margin-top:8px">'+esc(FBUERR)+'</div>';
  h+='<div class="sub" style="margin-top:6px">Đồng bộ gần nhất: <b>'+(FBU.syncedAt?fbWhen(FBU.syncedAt):"chưa có")+'</b>'+(old>FBS_OLD?' <span style="color:var(--warn)">(đã '+old+' ngày)</span>':'')+'</div>';
  if(!U.length) return h+'<div class="empty" style="margin-top:12px">Chưa có dữ liệu. Owner mở extension FarmBase, bấm "Đồng bộ lên BVI".</div>';
  const tile=(v,l,k,warn)=>'<button class="panel" data-fbk="'+k+'" style="text-align:left;padding:8px 10px;cursor:pointer;min-width:0'+(F.crit===k&&k?';outline:2px solid var(--brand)':'')+'"><b style="font-size:18px'+(warn&&v?';color:var(--bad)':'')+'">'+v+'</b><div class="sub" style="font-size:12px">'+esc(l)+'</div></button>';
  h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:10px">'
   +tile(U.length,"Vùng FarmBase","")+tile(cnt(u=>u.status==="ACTIVE"),"Đang hoạt động","")+tile(cnt(u=>u.status==="PENDING"),"Chờ duyệt","")+tile(cnt(u=>u.status==="INACTIVE"),"Đã ngừng","")
   +tile(cnt(u=>u.missing===0&&(u.flags||[]).every(x=>x===0)),"Đủ 12 mục hồ sơ","")+tile(cnt(fbDeepOk)+"/"+dk.length,"Đủ nông hộ, lô","")+tile(sum("f"),"Nông hộ","")+tile(sum("p"),"Lô","")
   +FB_DP.map(([k,l])=>tile(cnt(u=>(u.deep?.[k]||0)>0),l+" ("+sum(k)+")","d:"+k,true)).join("")
   +tile(cnt(u=>u.scan>0),"Có file scan hồ sơ","s:1")+tile(cnt(u=>u.scan===0),"Chưa có file scan hồ sơ","s:0",true)
   +'</div><details style="margin-top:8px"'+(/^\d+$/.test(F.crit)?" open":"")+'><summary style="cursor:pointer" class="sub">Chi tiết 12 mục hồ sơ vùng</summary><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:6px">'
   +FB12.map((l,i)=>tile(cnt(u=>(u.flags||[])[i]===1),l,String(i),true)).join("")+'</div></details>';
  const vens=[...new Set(U.map(u=>u.vendor).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"vi"));
  const sel=(id,opts,v)=>'<select id="'+id+'" style="min-width:0;max-width:100%">'+opts.map(([k,l])=>'<option value="'+esc(k)+'"'+(k===v?" selected":"")+'>'+esc(l)+'</option>').join("")+'</select>';
  h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px;margin-top:10px"><input id="fbuQ" placeholder="Tìm tên, mã, tổ chức, xã" value="'+esc(F.q)+'" style="min-width:0">'
   +sel("fbuSt",[["","Mọi trạng thái"],["ACTIVE","Đang hoạt động"],["PENDING","Chờ duyệt"],["INACTIVE","Đã ngừng"]],F.st)
   +sel("fbuVen",[["","Mọi tổ chức"],...vens.map(v=>[v,v])],F.ven)
   +sel("fbuHs",[["","Hồ sơ 12 mục: tất cả"],["miss","Hồ sơ còn thiếu"],["ok","Hồ sơ đủ"],["unk","Có mục chưa kiểm tra"]],F.hs)
   +sel("fbuDp",[["","Nông hộ, lô: tất cả"],["miss","Nông hộ, lô còn thiếu"],["ok","Nông hộ, lô đủ"],["err","Lỗi đọc"],["none","Chưa kiểm tra"]],F.dp)
   +(()=>{ const o=(k,l,c)=>'<option value="'+esc(k)+'"'+(k===F.crit?" selected":"")+'>'+esc(l)+(c!=null?" ("+c+")":"")+'</option>';
     return '<select id="fbuCrit" style="min-width:0;max-width:100%">'+o("","Thiếu gì: tất cả")
      +'<optgroup label="Hồ sơ vùng">'+FB12.map((l,i)=>o(String(i),l,cnt(u=>(u.flags||[])[i]===1))).join("")+o("s:0","Chưa có file scan",cnt(u=>u.scan===0))+'</optgroup>'
      +'<optgroup label="Nông hộ, lô">'+FB_DP.map(([k,l])=>o("d:"+k,l,cnt(u=>(u.deep?.[k]||0)>0))).join("")+'</optgroup></select>'; })()
+'</div>';
  const view=F.view||(innerWidth>=760?"tbl":"card");
  h+='<div class="row between" style="gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0"><div class="sub">'+L.length+' vùng'+(F.crit?' · đang lọc theo "'+esc(F.crit==="s:1"?"Có file scan hồ sơ":F.crit==="s:0"?"Chưa có file scan hồ sơ":F.crit.startsWith("d:")?(FB_DP.find(x=>x[0]===F.crit.slice(2))||[])[1]:FB12[+F.crit])+'" <button class="btn sm" id="fbuNoCrit">Bỏ lọc</button>':'')+'</div><div class="row" style="gap:4px"><button class="btn sm'+(view==="tbl"?" pri":"")+'" data-fbv="tbl">Bảng</button><button class="btn sm'+(view==="card"?" pri":"")+'" data-fbv="card">Thẻ</button><button class="btn sm'+(view==="cal"?" pri":"")+'" data-fbv="cal">Lịch</button></div></div>';
  if(view==="cal") return h+fbCal(L);
  if(view==="tbl"){ h+=fbTable(L.slice(0,F.n)); if(L.length>F.n) h+='<div class="row" style="margin-top:8px"><button class="btn" id="fbuMore">Xem thêm ('+(L.length-F.n)+' vùng)</button></div>'; return h; }
  h+='<div style="display:grid;gap:8px">'+L.slice(0,F.n).map(u=>{ const st=FB_STL[u.status]||[u.status||"?",""];
    const miss=(u.flags||[]).map((x,i)=>x===1?FB12[i]:"").filter(Boolean), d=u.deep;
    const dl=d&&!d.error?FB_DP.filter(([k])=>d[k]>0):[];
    return '<div class="panel" style="padding:10px 12px;min-width:0"><div class="row between" style="gap:6px;align-items:flex-start;flex-wrap:nowrap"><div style="min-width:0;overflow-wrap:anywhere"><b>'+esc(u.name||u.id)+'</b><div class="sub">'+esc([u.code,u.vendor,u.ward,u.province].filter(Boolean).join(" · "))+'</div><button class="btn sm" data-fbd="'+esc(u.id)+'" style="margin-top:4px">Xem chi tiết</button></div><span class="pill '+st[1]+'" style="white-space:nowrap">'+esc(st[0])+'</span></div>'
     +'<div class="row" style="gap:4px 8px;flex-wrap:wrap;margin-top:6px;font-size:13px">'
     +'<span class="pill '+(miss.length?"warn":(u.flags||[]).some(x=>x===-1)?"":"good")+'">Hồ sơ '+(miss.length?"thiếu "+miss.length+"/12":(u.flags||[]).some(x=>x===-1)?"chưa kiểm tra đủ":"đủ 12 mục")+'</span>'
     +(d?(d.error?'<span class="pill bad">Lỗi đọc nông hộ, lô</span>':'<span class="pill '+(dl.length?"warn":"good")+'">'+d.f+' nông hộ · '+d.p+' lô'+(dl.length?'':' · đủ')+'</span>'):'<span class="pill">Chưa kiểm tra nông hộ, lô</span>')
     +(u.areaM2!=null?'<span class="sub">'+fmtHa(u.areaM2/10000)+' ha</span>':'')+'</div>'
     +'<div style="margin-top:4px"><span class="sub">Hồ sơ scan:</span> '+fbScanCell(u)+'</div>'
     +(miss.length?'<div class="sub" style="margin-top:4px">Thiếu: '+esc(miss.join(", "))+'</div>':'')
     +(dl.length?'<div class="row" style="gap:4px;flex-wrap:wrap;margin-top:4px">'+dl.map(([k,,sh])=>'<span class="pill '+(k==="dup"||k==="pZero"?"bad":"warn")+'" style="font-size:12px">'+esc(sh)+' '+d[k]+'</span>').join("")+'</div>'+(d.dupPlots?.length?'<div class="sub" style="font-size:12px;margin-top:2px">Lô trùng thửa: '+esc(d.dupPlots.join(", "))+'</div>':''):'')
     +(()=>{ const n=FBN[u.id]||{}; return '<div style="margin-top:6px;padding:6px 8px;background:var(--chip);border-radius:8px;font-size:13px"><div class="row between" style="gap:6px;flex-wrap:nowrap;align-items:flex-start"><div style="min-width:0;overflow-wrap:anywhere">'
       +'<span class="sub">Thu hoạch:</span> '+(n.harvest?fbDate(n.harvest):'–')+' · <span class="sub">Kết thúc vụ:</span> '+(n.seasonEnd?fbDate(n.seasonEnd):'–')+(n.note?'<div style="margin-top:2px">'+esc(n.note)+'</div>':'')+(n.steps?.length?'<div style="margin-top:4px"><span class="sub">Bước tiếp theo:</span> '+fbStepCell(u)+'</div>':'')+'</div><button class="btn sm" data-fbn="'+esc(u.id)+'">Sửa</button></div></div>'; })()
     +'<div class="sub" style="font-size:12px;margin-top:4px">Đồng bộ '+fbWhen(u.syncedAt)+(u.checkedAt?' · KT hồ sơ '+dm(u.checkedAt.slice(0,10)):'')+'</div></div>'; }).join("")+'</div>';
  if(L.length>F.n) h+='<div class="row" style="margin-top:8px"><button class="btn" id="fbuMore">Xem thêm ('+(L.length-F.n)+' vùng)</button></div>';
  return h; }
// Ghim hàng tiêu đề của bảng Vùng FarmBase khi cuộn trang (bảng cuộn ngang nên position:sticky không bám theo trang được)
function fbStickyHead(A){
  document.getElementById("fbtFloat")?.remove(); if(fbStickyHead.off) fbStickyHead.off();
  const box=A.querySelector(".fbt"), tbl=box?.querySelector("table"), hr=tbl?.rows[0]; if(!hr) return;
  const fl=document.createElement("div"); fl.id="fbtFloat"; fl.className="fbt"; fl.style.cssText="position:fixed;z-index:15;overflow:hidden;display:none;margin:0;border-top:0;border-radius:0;box-shadow:0 3px 6px rgba(0,0,0,.08)";
  const t2=document.createElement("table"); t2.style.tableLayout="fixed"; const r2=hr.cloneNode(true); t2.appendChild(r2); fl.appendChild(t2); document.body.appendChild(fl);
  const size=()=>{ t2.style.width=tbl.offsetWidth+"px"; [...hr.cells].forEach((c,i)=>{ const w=c.getBoundingClientRect().width+"px", x=r2.cells[i]; x.style.width=x.style.minWidth=x.style.maxWidth=w; x.style.boxSizing="border-box"; x.style.height=c.getBoundingClientRect().height+"px"; }); };
  const upd=()=>{ if(!document.body.contains(box)){ off(); return; }
    const top=document.querySelector("header.top")?.getBoundingClientRect().bottom||0, b=box.getBoundingClientRect(), hh=hr.getBoundingClientRect().height;
    const show=b.top<top&&b.bottom>top+hh*1.5; fl.style.display=show?"block":"none";
    if(show){ fl.style.top=top+"px"; fl.style.left=b.left+"px"; fl.style.width=box.clientWidth+"px"; t2.style.transform="translateX("+(-box.scrollLeft)+"px)"; } };
  const rs=()=>{ size(); upd(); };
  const off=()=>{ removeEventListener("scroll",upd); removeEventListener("resize",rs); box.removeEventListener("scroll",upd); fl.remove(); fbStickyHead.off=null; };
  fbStickyHead.off=off; size(); addEventListener("scroll",upd,{passive:true}); addEventListener("resize",rs); box.addEventListener("scroll",upd,{passive:true}); upd();
  r2.querySelectorAll("[data-fbn],[data-fbd]").forEach(x=>x.removeAttribute("data-fbn")); }
// Báo cáo ngắn các vùng đang lọc còn thiếu gì: mở trang in, người dùng chọn "Lưu thành PDF"
function fbPdf(L){
  const td=fbToday(), e=esc, fn=[];
  const z=L.map(u=>{ const d=u.deep, ok=d&&!d.error, fl=u.flags||[], n=FBN[u.id]||{}, x=[];
    const h12=fl.map((f,i)=>f===1?FB12S[i]:null).filter(Boolean); if(h12.length) x.push('<li><b>Hồ sơ vùng ('+h12.length+'/12):</b> '+e(h12.join(", "))+'</li>');
    if(u.scan===0) x.push('<li><b>Chưa có file scan hồ sơ</b> (tên chứa scan_hoso)</li>'); else if(u.scan===-1) x.push('<li>Không đọc được thư viện vùng</li>');
    if(ok){ const fm=(d.farmers||[]).map(f=>e(f.n||"?")+' ('+[f.i?"số CCCD":"",f.f&&f.b?"ảnh CCCD 2 mặt":f.f?"ảnh CCCD trước":f.b?"ảnh CCCD sau":""].filter(Boolean).join(", ")+')');
      if(fm.length) x.push('<li><b>Nông hộ thiếu ('+fm.length+'):</b> '+fm.join("; ")+'</li>'); else if(d.fNoId||d.fNoImg) x.push('<li><b>Nông hộ:</b> '+d.fNoId+' thiếu số CCCD, '+d.fNoImg+' thiếu ảnh CCCD</li>');
      const pm=(d.plots||[]).filter(p=>p.img||p.pg||p.pl||p.t||p.a||p.z).map(p=>e(p.c||"?")+(p.o?' – '+e(p.o):'')+' ('+[p.img?"ảnh sổ đỏ":"",p.pg?"số tờ":"",p.pl?"số thửa":"",p.t?"số cây":"",p.a?"diện tích":"",p.z?"diện tích 0":""].filter(Boolean).join(", ")+')');
      if(pm.length) x.push('<li><b>Lô thiếu ('+pm.length+'):</b> '+pm.join("; ")+'</li>'); else if(!d.plots&&(d.pNoImg||d.pNoPage||d.pNoPlot||d.pNoTrees||d.pNoArea||d.pZero)) x.push('<li><b>Lô:</b> '+FB_DP.slice(2,8).filter(([k])=>d[k]).map(([k,,sh])=>sh+" "+d[k]).join(", ")+'</li>');
      const dg=d.dupG?.length?d.dupG.map(g=>g.join(" = ")):(d.dupPlots||[]).length?[d.dupPlots.join(", ")]:[]; if(dg.length) x.push('<li><b>Lô trùng tờ, thửa:</b> '+e(dg.join("; "))+'</li>'); }
    else if(d?.error) x.push('<li>Không đọc được nông hộ, lô</li>'); else x.push('<li>Chưa kiểm tra nông hộ, lô</li>');
    const ns=fbNextStep(n); if(ns) x.push('<li><b>Bước tiếp theo:</b> '+(ns.d?fbDate(ns.d)+(ns.d<td?' (trễ)':'')+' · ':'')+e(ns.act||"")+(ns.res?' → '+e(ns.res):'')+'</li>');
    const bad=x.some(s=>!s.startsWith('<li><b>Bước')); if(!bad) fn.push(u.name); return bad?'<section><h3>'+e(u.name||u.id)+'</h3><div class="m">'+e([u.code,u.vendor,[u.ward,u.province].filter(Boolean).join(", "),(FB_STL[u.status]||[u.status||""])[0],ok?d.f+" hộ · "+d.p+" lô":"",u.areaM2!=null?fmtHa(u.areaM2/10000)+" ha":""].filter(Boolean).join(" · "))+'</div><div class="st">'+[fl.length?(u.missing>0?'<span class="b">Hồ sơ vùng: thiếu '+u.missing+'/12</span>':'<span class="g">Hồ sơ vùng: đủ</span>'):'<span>Hồ sơ vùng: chưa kiểm tra</span>',u.scan>0?'<span class="g">Có file scan</span>':u.scan===0?'<span class="b">Chưa có file scan</span>':'',ok?(d.issues>0?'<span class="b">Nông hộ, lô: '+d.issues+' chỗ thiếu</span>':'<span class="g">Nông hộ, lô: đủ</span>'):''].filter(Boolean).join(" · ")+'</div><ul>'+x.join("")+'</ul></section>':''; }).join("");
  // Tổng quan: mỗi mục thiếu → số vùng → tên vùng
  const nm=u=>e(u.name||u.id), rows=[];
  FB12.forEach((l,i)=>{ const v=L.filter(u=>(u.flags||[])[i]===1); rows.push(["Hồ sơ vùng",FB12S[i],v.length,"",v.map(nm)]); });
  { const v=L.filter(u=>u.scan===0); rows.push(["Hồ sơ vùng","File scan hồ sơ",v.length,"",v.map(nm)]); }
  FB_DP.forEach(([k,l])=>{ const v=L.filter(u=>u.deep&&!u.deep.error&&(u.deep[k]||0)>0); rows.push(["Nông hộ, lô",l,v.length,v.reduce((a,u)=>a+u.deep[k],0),v.map(u=>nm(u)+' ('+u.deep[k]+')')]); });
  rows.sort((a,b)=>b[2]-a[2]);
  const has=rows.filter(r=>r[2]), none=rows.filter(r=>!r[2]);
  const dk=L.filter(u=>u.deep&&!u.deep.error), c=(v,l,w)=>'<div class="t"><b'+(w&&v?' class="b"':'')+'>'+v+'</b><span>'+l+'</span></div>';
  const ov='<h2>1. Tổng quan</h2><div class="ts">'+c(L.length,"Vùng")+c(L.length-fn.length,"Vùng còn thiếu",1)+c(fn.length,"Vùng đủ hết")
   +c(L.filter(u=>(u.flags||[]).length&&u.missing===0).length+"/"+L.length,"Đủ 12 mục hồ sơ")+c(L.filter(u=>u.scan>0).length+"/"+L.length,"Có file scan")+c(dk.filter(u=>!u.deep.issues).length+"/"+dk.length,"Đủ nông hộ, lô")+'</div>'
   +(has.length?'<table class="ov"><thead><tr><th>Mục thiếu</th><th class="n">Số vùng</th><th>Vùng thiếu</th></tr></thead><tbody>'+has.map(r=>'<tr><td><b>'+e(r[1])+'</b>'+(r[3]?' <span class="m">('+r[3]+(r[1].startsWith("Nông hộ")?" hộ":r[1].startsWith("Trùng")?" nhóm":" lô")+')</span>':'')+'</td><td class="n"><b class="b">'+r[2]+'</b></td><td>'+r[4].join(", ")+'</td></tr>').join("")+'</tbody></table>':'')
   +(none.length?'<p class="ok"><b>Không vùng nào thiếu:</b> '+e(none.map(r=>r[1]).join(", "))+'</p>':'');
  const f=FBF, fl=[f.q&&'tìm "'+f.q+'"',f.st&&(FB_STL[f.st]||[f.st])[0],f.ven,f.crit&&"lọc: "+(f.crit==="s:1"?"Có file scan":f.crit==="s:0"?"Chưa có file scan":f.crit.startsWith("d:")?(FB_DP.find(x=>x[0]===f.crit.slice(2))||[])[1]:FB12[+f.crit])].filter(Boolean).join(", ");
  const html='<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vùng FarmBase còn thiếu '+td+'</title><style>body{font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2937;margin:24px;max-width:900px}h1{font-size:20px;margin:0 0 4px}h3{font-size:14px;margin:0 0 2px}.s{color:#6b7280}section{border-top:1px solid #e5e7eb;padding:8px 0;break-inside:avoid}.m{color:#6b7280;font-size:12px}ul{margin:4px 0 0;padding-left:18px}li{margin:2px 0}.ok{margin-top:10px;color:#15803d}h2{font-size:16px;margin:16px 0 8px}.b{color:#b91c1c}.g{color:#15803d}.st{font-size:12px;margin-top:2px}.ts{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin-bottom:10px}.t{border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px}.t b{display:block;font-size:17px}.t span{font-size:12px;color:#6b7280}table.ov{border-collapse:collapse;width:100%}.ov th,.ov td{border-top:1px solid #e5e7eb;padding:3px 6px;text-align:left;vertical-align:top}.ov th{font-size:12px;color:#6b7280;border-top:0}.ov td:first-child{width:34%}.ov .n{text-align:center;width:56px}.ov tr{break-inside:avoid}.dt{break-before:page}.bar{position:sticky;top:0;background:#fff;padding:8px 0;margin-bottom:6px}.bar button{font:inherit;padding:6px 12px;border:1px solid #d1d5db;border-radius:8px;background:#1f5135;color:#fff}@media print{.bar{display:none}body{margin:12mm}}</style></head><body>'
   +'<div class="bar"><button onclick="print()">Lưu PDF / In</button> <span class="s">Chọn máy in "Lưu thành PDF" (Save as PDF).</span></div>'
   +'<h1>Vùng FarmBase còn thiếu thông tin</h1><div class="s">Xuất ngày '+fbDate(td)+(FBU?.syncedAt?' · dữ liệu FarmBase đồng bộ '+e(fbWhen(FBU.syncedAt)):'')+' · '+L.length+' vùng'+(fl?' ('+e(fl)+')':'')+' · '+(L.length-fn.length)+' vùng còn thiếu, '+fn.length+' vùng đủ</div>'
   +ov+'<h2 class="dt">2. Chi tiết từng vùng</h2>'+(z||'<p class="ok">Tất cả vùng trong danh sách đã đủ thông tin.</p>')+(fn.length&&z?'<p class="ok"><b>Đã đủ ('+fn.length+'):</b> '+e(fn.join("; "))+'</p>':'')
   +'<p class="s" style="margin-top:14px">Báo cáo nội bộ, không có số CCCD, số tờ, số thửa. Không gửi ra ngoài công ty.</p><script>setTimeout(()=>print(),400)<\/script></body></html>';
  const w=window.open("","_blank"); if(!w){ toast("Trình duyệt chặn cửa sổ mới, hãy cho phép rồi bấm lại"); return; } w.document.open(); w.document.write(html); w.document.close(); }
function bindFbUnits(A){
  $("#fbuPdf")?.addEventListener("click",()=>fbPdf(fbuList()));
  setTimeout(()=>fbStickyHead(A),0);
  $("#fbuRe")?.addEventListener("click",()=>{ FBU=null; render(); });
  $("#fbuHelp")?.addEventListener("click",()=>{ window.open("huong-dan/vung-farmbase.html","_blank"); });
  const set=(id,k,ev)=>$(id)?.addEventListener(ev||"change",e=>{ FBF[k]=e.target.value; FBF.n=60; if(ev==="input"){ clearTimeout(set.t); set.t=setTimeout(()=>{ render(); const q=$("#fbuQ"); if(q){ q.focus(); q.setSelectionRange(q.value.length,q.value.length); } },250); } else render(); });
  set("#fbuQ","q","input"); set("#fbuSt","st"); set("#fbuVen","ven"); set("#fbuHs","hs"); set("#fbuDp","dp"); set("#fbuCrit","crit");
  A.querySelectorAll("[data-fbk]").forEach(b=>b.addEventListener("click",()=>{ const k=b.dataset.fbk; FBF.crit=FBF.crit===k?"":k; FBF.n=60; render(); }));
  $("#fbuNoCrit")?.addEventListener("click",()=>{ FBF.crit=""; render(); });
  $("#fbuMore")?.addEventListener("click",()=>{ FBF.n+=100; render(); });
  A.querySelectorAll("[data-fbn]").forEach(b=>b.addEventListener("click",()=>openFbNote(b.dataset.fbn)));
  A.querySelectorAll("[data-fbd]").forEach(b=>b.addEventListener("click",()=>openFbDetail(b.dataset.fbd)));
  A.querySelectorAll("[data-fbv]").forEach(b=>b.addEventListener("click",()=>{ FBF.view=b.dataset.fbv; render(); }));
  A.querySelectorAll("[data-fbm]").forEach(b=>b.addEventListener("click",()=>{ const k=+b.dataset.fbm; if(!k){ FBF.mon=""; } else { const [y,m]=(FBF.mon||fbToday().slice(0,7)).split("-").map(Number), d=new Date(Date.UTC(y,m-1+k,1)); FBF.mon=d.toISOString().slice(0,7); } render(); }));
  $("#fbuCsv")?.addEventListener("click",()=>{ const L=fbuList(), q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
    const head=["Tên vùng","Mã","Trạng thái","Tổ chức","Xã","Tỉnh","Diện tích (ha)","Số mục hồ sơ thiếu",...FB12,"Số nông hộ","Số lô",...FB_DP.map(x=>x[1]),"Lô trùng thửa","File scan hồ sơ","Ngày thu hoạch","Ngày kết thúc vụ","Ghi chú","Bước tiếp theo","Đồng bộ lúc"];
    const rows=L.map(u=>[u.name,u.code,(FB_STL[u.status]||[u.status])[0],u.vendor,u.ward,u.province,u.areaM2!=null?(u.areaM2/10000).toFixed(2):"",u.missing,...(u.flags||[]).map(x=>x===1?"Thiếu":x===0?"Đủ":"Chưa kiểm tra"),u.deep?.f??"",u.deep?.p??"",...FB_DP.map(([k])=>u.deep?.error?"Lỗi":u.deep?.[k]??""),(u.deep?.dupPlots||[]).join(" "),u.scan==null?"":u.scan===-1?"Lỗi":u.scan,FBN[u.id]?.harvest||"",FBN[u.id]?.seasonEnd||"",FBN[u.id]?.note||"",(()=>{ const x=fbNextStep(FBN[u.id]); return x?[fbDate(x.d),x.act,x.res].filter(Boolean).join(" · "):""; })(),u.syncedAt]);
    const blob=new Blob(["﻿"+[head,...rows].map(r=>r.map(q).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="vung-farmbase_"+todayStr()+".csv"; a.click(); });
}
