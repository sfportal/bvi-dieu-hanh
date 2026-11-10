/* ---------- ứng dụng độc lập: Supabase ---------- */
window.__APP=true;
const SB_URL="https://pkckduidwfcncipwzdxa.supabase.co", SB_KEY="sb_publishable_ZHvz0flMvyIsxmT-tKS_Hw_q_Vz_7RF";
const COLS=["zones","people","tasks","contracts","daily","units","events","leaves","faqs","supports","contacts"];
let SB=null, PROFILE=null, FIN={}, RAW={};
const ROLE_L={owner:"Owner",manager:"Quản lý",staff:"Nhân viên",viewer:"Chỉ xem"};
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
   +'<div class="f"><label>Tính năng</label><label class="chk"><input type="checkbox" id="a_pl"'+(u?.role==="owner"||(u?.person_id&&S.people[u.person_id]?.canPlan)?" checked":"")+(u?.role==="owner"?" disabled":"")+'><span>Kế hoạch tuần: dán lịch, bảng tuần, rà soát công việc</span></label><label class="chk"><input type="checkbox" id="a_lv"'+(u?.role==="owner"||(u?.person_id&&S.people[u.person_id]?.canLeave)?" checked":"")+(u?.role==="owner"?" disabled":"")+'><span>Duyệt đơn nghỉ phép, về sớm</span></label><label class="chk"><input type="checkbox" id="a_ex"'+(u?.role==="owner"||(u?.person_id&&S.people[u.person_id]?.canExpense)?" checked":"")+(u?.role==="owner"?" disabled":"")+'><span>Ghi thu chi: chụp chứng từ thanh toán (chỉ thấy phiếu của mình)</span></label><div class="sub">Cần gắn với nhân sự. Người không có quyền vẫn thấy "Lịch hôm nay của tôi" ở Tổng quan.</div></div>'
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
  const OP={zones:openZone,tasks:id=>openTask(id),contracts:openContract,events:openEvent,units:openUnit,people:openPerson,faqs:openFaq,leaves:openLeave,supports:id=>openSupport(id),contacts:id=>openContact(id)};
  A.querySelectorAll("[data-lgo]").forEach(a=>a.addEventListener("click",e=>{ e.preventDefault(); const [c,id]=a.dataset.lgo.split("|"); const f=OP[c]; if(f) f(id); else toast("Mục này không mở chi tiết được"); }));
}
/* ---------- API cho đối tác (chỉ owner) ---------- */
const API_BASE=SB_URL+"/functions/v1/api/v1";
const API_RES={zones:"Vùng trồng",tasks:"Công việc",events:"Lịch công tác",leaves:"Lịch nghỉ",daily:"Báo cáo ngày",units:"Công ty, khách hàng",people:"Nhân sự",faqs:"Hỏi đáp",supports:"Yêu cầu hỗ trợ",contracts:"Hợp đồng (không có số tiền)"};
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
  let h='<div class="row between"><div><h1>API cho đối tác</h1><div class="sub">Chỉ owner thấy trang này. Đối tác dùng khóa để <b>đọc</b> dữ liệu, không sửa được gì. API không bao giờ trả CCCD, sổ đỏ, số điện thoại, số tiền hợp đồng, link Drive.</div></div><div class="row"><button class="btn" id="apiRe">Tải lại</button><button class="btn pri" id="apiAdd">Tạo khóa mới</button></div></div>';
  if(APIERR) h+='<div class="alert bad" style="margin-top:8px">'+esc(APIERR)+'</div>';
  if(!APIK.length) h+='<div class="empty" style="margin-top:12px">Chưa có khóa nào. Bấm "Tạo khóa mới" để cấp cho một đối tác.</div>';
  else h+='<div class="tw panel" style="margin-top:12px"><table><thead><tr><th>Đối tác</th><th>Khóa</th><th>Dữ liệu được đọc</th><th>Tạo</th><th>Hết hạn</th><th>Dùng gần nhất</th><th>Lượt gọi</th><th>Trạng thái</th><th></th></tr></thead><tbody>'
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
   +Object.entries(API_RES).map(([k,l])=>'<tr><td class="mono">GET /v1/'+k+'</td><td>'+esc(l)+'</td></tr>').join("")
   +'<tr><td class="mono">GET /v1/&lt;loại&gt;/&lt;id&gt;</td><td>Một bản ghi</td></tr></tbody></table></div>'
   +'<div class="sub" style="margin-top:8px">Tham số: <code>limit</code> (1 đến 1000, mặc định 500), <code>offset</code>, <code>updated_since</code> (ISO 8601, chỉ lấy bản ghi sửa từ thời điểm đó). Kết quả có <code>total</code> và <code>next_offset</code> để lấy trang tiếp. Tối đa 120 lượt mỗi phút cho mỗi khóa.</div>'
   +'<textarea id="apiEx" readonly rows="6" class="mono" style="width:100%;margin-top:8px">curl -H "X-API-Key: bvi_..." "'+esc(ex)+'"\n\n// JavaScript\nconst r = await fetch("'+esc(ex)+'", { headers: { "X-API-Key": "bvi_..." } });\nconst { data, total, next_offset } = await r.json();</textarea>'
   +'<div class="row" style="margin-top:6px"><button class="btn sm" id="apiCpEx">Sao chép ví dụ</button></div>'
   +'<div class="sub" style="margin-top:8px">Mã lỗi: 401 thiếu khóa, khóa sai, đã thu hồi hoặc hết hạn; 403 khóa không được đọc loại dữ liệu đó; 404 không có; 429 gọi quá nhanh.</div></div>';
  return h;
}
function apiScopeBoxes(sel){ return '<div class="row" style="flex-wrap:wrap;gap:6px 14px;margin-top:4px">'+Object.entries(API_RES).map(([k,l])=>'<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-apis="'+k+'"'+(sel.includes(k)?" checked":"")+'> '+esc(l)+'</label>').join("")+'</div>'; }
function apiPicked(){ return [...$("#layer").querySelectorAll("[data-apis]")].filter(x=>x.checked).map(x=>x.dataset.apis); }
function openApiNew(){
  showDrawer('<div class="dh"><div><h2>Tạo khóa API</h2><div class="sub">Khóa chỉ hiện một lần sau khi tạo. Hãy gửi cho đối tác qua kênh riêng.</div></div><button class="btn sm" data-close>Đóng</button></div><div class="db">'
   +'<label>Tên đối tác hoặc mục đích<input id="apiN" maxlength="80" placeholder="Ví dụ: Yanning Hải Nam, đồng bộ báo cáo"></label>'
   +'<div style="margin-top:10px"><b>Dữ liệu được đọc</b>'+apiScopeBoxes(["zones","tasks","events"])+'</div>'
   +'<label style="margin-top:10px">Thời hạn<select id="apiD"><option value="30">30 ngày</option><option value="90" selected>90 ngày</option><option value="365">1 năm</option><option value="0">Không hạn</option></select></label>'
   +'<div class="row" style="margin-top:14px"><button class="btn pri" id="apiGo">Tạo khóa</button><span class="sub" id="apiMsg"></span></div></div>');
  $("#apiGo").addEventListener("click",async()=>{ const b=$("#apiGo"); const name=$("#apiN").value.trim(), scopes=apiPicked();
    if(!name){ $("#apiMsg").textContent="Cần nhập tên"; return; } if(!scopes.length){ $("#apiMsg").textContent="Chọn ít nhất một loại dữ liệu"; return; }
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
   +'<label>Tên<input id="apiN" maxlength="80" value="'+esc(k.name)+'"></label><div style="margin-top:10px"><b>Dữ liệu được đọc</b>'+apiScopeBoxes(k.scopes||[])+'</div>'
   +'<div class="row" style="margin-top:14px"><button class="btn pri" id="apiSave">Lưu</button><span class="sub" id="apiMsg"></span></div></div>');
  $("#apiSave").addEventListener("click",async()=>{ const scopes=apiPicked(); if(!scopes.length){ $("#apiMsg").textContent="Chọn ít nhất một loại dữ liệu"; return; }
    $("#apiMsg").textContent="Đang lưu…"; const r=await callApiAdmin({action:"update",id,name:$("#apiN").value.trim(),scopes}); if(r.error){ $("#apiMsg").textContent=r.error; return; }
    closeDrawer(); toast("Đã lưu"); loadApiKeys(); });
}
function bindApi(A){
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

/* ---------- Đối soát tuần: một trang cho quản lý thấy việc xong/chưa và chỗ lệch giữa báo cáo nhanh, lịch, công việc, tiến độ vùng, hồ sơ cứng ---------- */
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
  return '<div style="margin-top:8px"><div class="row between" style="gap:6px"><span class="sub">Hồ sơ: bản cứng '+s.hard+'/'+s.n+' · Drive '+s.drive+'/'+s.n+' · FarmBase '+s.fb+'/'+s.n+'</span><button class="btn sm" data-rchd="'+zid+'">Chi tiết hồ sơ</button></div>'
   +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px;margin-top:6px">'+HS.map(([k,l,sh])=>{ const x=hsItem(z,k), h=x.hard||"";
     const on={c:h==="ok"||h==="na",d:!!x.drive||h==="na",f:!!x.fb||h==="na"}, part=h==="part";
     const bt=(f,lab,tip)=>'<button type="button" data-rchc="'+zid+'|'+k+'|'+f+'" aria-label="'+esc(sh+": "+tip)+'" title="'+esc(tip)+'" style="width:32px;height:30px;border-radius:6px;border:1px solid '+(on[f]?"var(--good)":f==="c"&&part?"var(--warn)":"var(--line)")+';background:'+(on[f]?"var(--good)":f==="c"&&part?"var(--warn)":"var(--surface)")+';color:'+(on[f]||(f==="c"&&part)?"#fff":"var(--muted)")+';font:700 13px/1 ui-monospace,monospace;cursor:pointer;padding:0">'+lab+'</button>';
     return '<div title="'+esc(l+(x.holder?" · "+hsHolder(x.holder)+" giữ":""))+'" style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;min-width:0;background:'+(hsDone(x)?"color-mix(in srgb,var(--good) 10%,transparent)":"var(--surface)")+'"><div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(sh)+'</div>'
      +'<div class="row" style="gap:4px;flex-wrap:nowrap;margin-top:4px">'+bt("c","C","Bản cứng: "+HSHARD[h]+". Bấm để đổi")+bt("d","D","Drive: "+(on.d?"đã có":"chưa có"))+bt("f","F","FarmBase: "+(on.f?"đã nhập":"chưa nhập"))+'</div>'
      +'<div class="sub" style="font-size:11px;margin-top:3px">'+esc(h==="na"?"Không cần":"Cứng: "+HSHARD[h].toLowerCase())+'</div></div>'; }).join("")+'</div>'
   +'<textarea data-rchn="'+zid+'" rows="2" maxlength="600" placeholder="Ghi chú hồ sơ: thiếu gì, ai đang giữ, hẹn ngày bổ sung…" style="width:100%;margin-top:6px;box-sizing:border-box">'+esc(z.hsNote||"")+'</textarea>'
   +(z.hsNoteAt?'<div class="sub" style="font-size:11px">Ghi chú sửa '+dm(z.hsNoteAt.slice(0,10))+(z.hsNoteBy?' bởi '+esc(pname(z.hsNoteBy)):'')+'</div>':'')+'</div>'; }
function rcModeBar(){ return '<div class="row between" style="gap:8px;margin-bottom:12px"><div class="focusbar" role="group" aria-label="Chế độ xem">'+[["","Đối soát tuần"],["due","Việc đến hôm nay"]].map(([k,l])=>'<button data-rcm="'+k+'" aria-pressed="'+(RC.mode===k)+'">'+l+'</button>').join("")+'</div>'
  +'<div class="focusbar" role="group" aria-label="Phạm vi vùng"><button data-rcall="" aria-pressed="'+(!RC.all)+'">Vùng ưu tiên 1, 2</button><button data-rcall="1" aria-pressed="'+RC.all+'">Tất cả</button></div></div>'; }
function vDueToday(){
  const t=todayStr(), from=RC.dr==="7"?wkStart(t):RC.dr==="30"?addDays(t,-30):"";
  const all=Object.entries(S.tasks).filter(([id,x])=>x.kind!=="epic"&&!tOpenKids(id)&&x.due&&x.due<=t&&(!from||x.due>=from)&&(!RC.dw||x.R===RC.dw)&&rcTOk(x));
  const dDone=x=>(x.doneAt||"").slice(0,10);
  const open=all.filter(([,x])=>x.status!=="done"), late=open.filter(([,x])=>x.due<t), dueNow=open.filter(([,x])=>x.due===t);
  const done=all.filter(([,x])=>x.status==="done"), onTime=done.filter(([,x])=>!dDone(x)||dDone(x)<=x.due), doneLate=done.filter(([,x])=>dDone(x)&&dDone(x)>x.due);
  // giữ nguyên thứ tự khi cập nhật trong trang, chỉ sắp lại khi đổi bộ lọc hoặc bấm Sắp xếp lại
  const sig=[RC.dr,RC.ds,RC.dw,RC.dg,RC.all].join("|"); if(!RC.ord||RC.ord.sig!==sig) RC.ord={sig,ids:null,zs:null};
  const pos=(arr,k)=>{ const i=arr?arr.indexOf(k):-1; return i<0?1e9:i; };
  const L0=(RC.ds==="open"?open:RC.ds==="late"?doneLate:all).slice().sort((a,b)=>(a[1].status==="done")-(b[1].status==="done")||a[1].due.localeCompare(b[1].due));
  const L=RC.ord.ids?L0.sort((a,b)=>pos(RC.ord.ids,a[0])-pos(RC.ord.ids,b[0])):L0;
  RC.ord.ids=[...(RC.ord.ids||[]),...L.map(r=>r[0]).filter(k=>!(RC.ord.ids||[]).includes(k))];
  const ppl=[...new Set(Object.values(S.tasks).filter(x=>x.kind!=="epic"&&x.R).map(x=>x.R))].filter(p=>S.people[p]).sort((a,b)=>pname(a).localeCompare(pname(b),"vi"));
  const pct=done.length+open.length?Math.round(onTime.length/(all.length)*100):0;
  let h='<div><h1>Việc đến hôm nay</h1><div class="sub">Việc của '+(RC.all?'mọi vùng':'vùng ưu tiên 1, 2')+', có hạn từ '+(from?dm(from):"trước đến nay")+' đến hôm nay '+dm(t)+'. Việc chưa xong mà qua hạn là trễ.</div></div>';
  h+='<div class="row" style="gap:6px;margin-top:10px"><div class="focusbar" role="group" aria-label="Khoảng hạn">'+[["7","Tuần này"],["30","30 ngày"],["all","Tất cả"]].map(([k,l])=>'<button data-rcdr="'+k+'" aria-pressed="'+(RC.dr===k)+'">'+l+'</button>').join("")+'</div>'
   +'<select id="rcDw" aria-label="Người thực hiện"><option value="">Mọi người</option>'+ppl.map(p=>'<option value="'+p+'"'+(RC.dw===p?" selected":"")+'>'+esc(pname(p))+'</option>').join("")+'</select><div class="focusbar" role="group" aria-label="Cách xem"><button data-rcdg="zone" aria-pressed="'+(RC.dg==="zone")+'">Theo vùng</button><button data-rcdg="" aria-pressed="'+(RC.dg!=="zone")+'">Danh sách</button></div></div>';
  const tile=(v,l,cls,k)=>'<button class="tile '+cls+'" data-rcds="'+k+'"'+(RC.ds===k?' style="outline:2px solid var(--brand)"':'')+'><span class="v">'+v+'</span><span class="l">'+l+'</span></button>';
  h+='<div class="grid kpis" style="margin-top:12px">'+tile(open.length,'Chưa xong'+(late.length?' · '+late.length+' trễ':'')+(dueNow.length?' · '+dueNow.length+' hạn hôm nay':''),open.length?"bad":"good","open")
   +tile(doneLate.length,'Xong nhưng trễ hạn',doneLate.length?"warn":"good","late")+tile(all.length,'Tổng việc đến hạn · '+pct+'% xong đúng hạn',"","all")+'</div>';
  if(!L.length) return h+'<div class="empty" style="margin-top:12px">Không có việc nào trong bộ lọc này.</div>';
  const st=x=>{ if(x.status!=="done") return x.due<t?'<span class="pill bad">Trễ '+diffDays(t,x.due)+' ngày</span>':'<span class="pill warn">Hạn hôm nay</span>';
    const d=dDone(x); return d&&d>x.due?'<span class="pill warn">Xong trễ '+diffDays(d,x.due)+' ngày</span>':'<span class="pill good">Xong đúng hạn</span>'; };
  const zn=x=>x.zone&&S.zones[x.zone]?zShort(S.zones[x.zone].name):"";
  const card=([id,x],noZone)=>'<div style="border:1px solid var(--line);border-left:4px solid var(--'+(x.status!=="done"?(x.due<t?"bad":"warn"):(dDone(x)>x.due?"warn":"good"))+');border-radius:8px;padding:8px 12px;background:var(--surface);display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
    +'<div style="flex:1;min-width:220px"><div style="font-weight:600;overflow-wrap:anywhere">'+esc(tTitle(x,S.zones[x.zone]))+'</div><div class="sub">Hạn '+dm(x.due)+(!noZone&&zn(x)?' · '+esc(zn(x)):'')+' · '+esc(pname(x.R)||"Chưa giao")+' · '+(TSTAT[x.status]||x.status)+(x.status==="done"&&dDone(x)?' ngày '+dm(dDone(x)):'')+'</div></div>'
    +'<div class="row" style="gap:6px">'+st(x)+'<button class="btn sm" data-rcot="'+id+'">Mở</button>'+(x.status!=="done"?'<button class="btn sm" data-rcdone="'+id+'">Xong</button>':'')+'</div></div>';
  if(RC.dg==="zone"){ const G={}; L.forEach(r=>{ const k=r[1].zone||"_"; (G[k]=G[k]||[]).push(r); });
    const ks=Object.keys(G).sort((a,b)=>{ const la=G[a].filter(([,x])=>x.status!=="done"&&x.due<t).length, lb=G[b].filter(([,x])=>x.status!=="done"&&x.due<t).length; return lb-la||(S.zones[a]?.priority||"9").localeCompare(S.zones[b]?.priority||"9"); });
    if(RC.ord.zs) ks.sort((a,b)=>pos(RC.ord.zs,a)-pos(RC.ord.zs,b)); RC.ord.zs=[...(RC.ord.zs||[]),...ks.filter(k=>!(RC.ord.zs||[]).includes(k))];
    h+='<div class="row between" style="margin:12px 0 6px;gap:6px"><span class="sub">'+L.length+' việc ở '+ks.length+' vùng</span><button class="btn sm" data-rcresort>Sắp xếp lại</button></div>';
    ks.forEach(k=>{ const z=S.zones[k], Lz=G[k], lt=Lz.filter(([,x])=>x.status!=="done"&&x.due<t).length;
      h+='<div class="panel" style="margin-top:8px;padding:10px 12px"><div class="row between" style="gap:6px;margin-bottom:8px"><div style="min-width:0">'+(z?'<button class="btn sm" style="border:0;background:none;padding:0;font-weight:700;font-size:15px;text-align:left" data-rcz="'+k+'">'+esc(zShort(z.name))+'</button><div class="sub">'+esc(PRI[z.priority]||"")+(z.step!=null?' · Bước '+z.step+': '+esc(STEPS[z.step]?.name||""):'')+(z.eta?' · dự kiến mã '+esc(etaShort(z.eta)):'')+' · hồ sơ cứng '+hsStat(z).hard+'/'+hsStat(z).n+'</div>':'<b>Việc chung, không gắn vùng</b>')+'</div>'
        +'<div class="row" style="gap:6px">'+(lt?'<span class="pill bad">'+lt+' việc trễ</span>':'<span class="pill good">Không trễ</span>')+(z?'<button class="btn sm pri" data-rcnew="'+k+'">+ Việc</button>':'')+'</div></div><div style="display:grid;gap:6px">'+Lz.map(r=>card(r,true)).join("")+'</div>'+(z?'<details style="margin-top:8px" data-rchso="'+k+'"'+((RC.hsOpen||{})[k]?' open':'')+'><summary class="sub" style="cursor:pointer">Hồ sơ của vùng: bản cứng '+hsStat(z).hard+'/'+hsStat(z).n+(z.hsNote?' · có ghi chú':'')+'</summary>'+rcHsBlock(k)+'</details>':'')+'</div>'; });
    return h; }
  h+='<div class="row between" style="margin:12px 0 6px;gap:6px"><span class="sub">'+L.length+' việc</span><button class="btn sm" data-rcresort>Sắp xếp lại</button></div><div style="display:grid;gap:6px">'+L.map(([id,x])=>'<div style="border:1px solid var(--line);border-left:4px solid var(--'+(x.status!=="done"?(x.due<t?"bad":"warn"):(dDone(x)>x.due?"warn":"good"))+');border-radius:8px;padding:8px 12px;background:var(--surface);display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
    +'<div style="flex:1;min-width:220px"><div style="font-weight:600;overflow-wrap:anywhere">'+esc(tTitle(x,S.zones[x.zone]))+'</div><div class="sub">Hạn '+dm(x.due)+(zn(x)?' · '+esc(zn(x)):'')+' · '+esc(pname(x.R)||"Chưa giao")+' · '+(TSTAT[x.status]||x.status)+(x.status==="done"&&dDone(x)?' ngày '+dm(dDone(x)):'')+'</div></div>'
    +'<div class="row" style="gap:6px">'+st(x)+'<button class="btn sm" data-rcot="'+id+'">Mở</button>'+(x.status!=="done"?'<button class="btn sm" data-rcdone="'+id+'">Xong</button>':'')+'</div></div>').join("")+'</div>';
  return h;
}
function vRecon(){
  if(!canManage()) return '<div class="panel">Trang này dành cho quản lý.</div>';
  if(RC.mode==="due") return rcModeBar()+vDueToday();
  return rcModeBar()+vRecon0();
}
function vRecon0(){
  const st=rcWeekStats(), all=rcIssues(), open=all.filter(i=>!i.ack);
  const pick=all.filter(i=>(RC.showAck||!i.ack)&&(!RC.grp||i.grp===RC.grp)&&(!RC.who||rcPersonOf(i)===RC.who));
  let h='<div class="row between" style="align-items:flex-end;gap:10px"><div><h1>Đối soát tuần</h1><div class="sub">Việc xong hay chưa, và chỗ báo cáo nhanh, lịch, công việc, tiến độ vùng, hồ sơ cứng chưa khớp. Kiểm với nhân sự rồi sửa ngay tại đây.</div></div>'
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
  if(i.type==="daily_miss"){ const p=S.people[i.rid]; const r={...(p.rcDaily||{})}; i.dates.forEach(d=>{ if(on) r[d]={at,by}; else delete r[d]; }); return upd("people",i.rid,{rcDaily:r}); }
  const rec=S[i.col]?.[i.rid]; if(!rec) return false; const rc={...(rec.rc||{})}; const key=i.akey||i.type;
  if(on) rc[key]={at,by,sig:i.sig}; else delete rc[key]; return upd(i.col,i.rid,{rc}); }
function bindRecon(A){
  A.querySelectorAll("[data-rcm]").forEach(b=>b.addEventListener("click",()=>{ RC.mode=b.dataset.rcm; RC.ord=null; render(); }));
  A.querySelectorAll("[data-rcresort]").forEach(b=>b.addEventListener("click",()=>{ RC.ord=null; render(); }));
  A.querySelectorAll("[data-rcall]").forEach(b=>b.addEventListener("click",()=>{ RC.all=!!b.dataset.rcall; render(); }));
  A.querySelectorAll("[data-rcdg]").forEach(b=>b.addEventListener("click",()=>{ RC.dg=b.dataset.rcdg; render(); }));
  A.querySelectorAll("[data-rcdr]").forEach(b=>b.addEventListener("click",()=>{ RC.dr=b.dataset.rcdr; render(); }));
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
