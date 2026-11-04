/* ---------- ứng dụng độc lập: Supabase ---------- */
window.__APP=true;
const SB_URL="https://pkckduidwfcncipwzdxa.supabase.co", SB_KEY="sb_publishable_ZHvz0flMvyIsxmT-tKS_Hw_q_Vz_7RF";
const COLS=["zones","people","tasks","contracts","daily","units","events","leaves","faqs"];
let SB=null, PROFILE=null, FIN={}, RAW={};
const ROLE_L={owner:"Owner",manager:"Quản lý",staff:"Nhân viên",viewer:"Chỉ xem"};
function canFin(){ return !!PROFILE&&(PROFILE.role==="owner"||PROFILE.can_finance); }
function isOwner(){ return PROFILE?.role==="owner"; }
function finSplit(d){ // tách số tiền khỏi hợp đồng
  const items=(d.items||[]).map(it=>{ const {price,...r}=it; return r; });
  const payments=(d.payments||[]).map(p=>{ const {paid,paidDate,...r}=p; return r; });
  const fin={prices:(d.items||[]).map(it=>+it.price||0),paid:(d.payments||[]).map(p=>!!p.paid),paidDate:(d.payments||[]).map(p=>p.paidDate||null)};
  return {pub:{...d,items,payments},fin}; }
function finJoin(id){ const d=RAW.contracts?.[id]; if(!d) return null; const f=FIN[id]||{}; const o={...d};
  o.items=(d.items||[]).map((it,i)=>({...it,price:f.prices?f.prices[i]:undefined}));
  o.payments=(d.payments||[]).map((p,i)=>({...p,paid:f.paid?!!f.paid[i]:false,paidDate:f.paidDate?f.paidDate[i]:null}));
  return o; }
function rebuild(col){ if(col==="contracts"){ const o={}; Object.keys(RAW.contracts||{}).forEach(k=>o[k]=finJoin(k)); S.contracts=o; } else S[col]=RAW[col]||{}; }
let rT=null; function softRender(){ clearTimeout(rT); rT=setTimeout(()=>{ if(ready) render(); },120); }
function errMsg(e){ const m=(e?.message||e?.code||"")+""; if(/row-level security|permission|not allowed|42501/i.test(m)) return "Bạn không có quyền thao tác này"; return "Chưa lưu được: "+m; }
async function put(col,id,data){
  try{ if(col==="contracts"){ const {pub,fin}=finSplit(data); const {error}=await SB.from("docs").upsert({col,id,data:pub}); if(error) throw error; RAW.contracts={...RAW.contracts,[id]:pub};
      if(canFin()&&["owner","manager"].includes(PROFILE.role)){ const {error:e2}=await SB.from("contract_fin").upsert({id,data:fin}); if(e2) throw e2; FIN[id]=fin; } rebuild("contracts"); softRender(); return true; }
    const {error}=await SB.from("docs").upsert({col,id,data}); if(error) throw error; RAW[col]={...RAW[col],[id]:data}; rebuild(col); softRender(); return true;
  }catch(e){ toast(errMsg(e)); return false; } }
async function upd(col,id,patch){
  try{ if(col==="contracts"&&(patch.items||patch.payments)){ const cur=S.contracts[id]||{}; return await put(col,id,{...cur,...patch}); }
    const {error}=await SB.rpc("doc_merge",{p_col:col,p_id:id,p_patch:patch}); if(error) throw error;
    RAW[col]={...RAW[col],[id]:{...(RAW[col]?.[id]||{}),...patch}}; rebuild(col); softRender(); return true;
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
  logEv("open"); userCan=["owner","manager"].includes(prof.role); me=prof.person_id||null; viewerName=prof.name||prof.email;
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
async function loadAcc(){ const r=await callAdmin({action:"list"}); if(r.error){ toast(r.error==="owner_only"?"Chỉ owner xem được":r.error); ACC=[]; } else ACC=r.users; if(ui.view==="tai-khoan") render(); }
function vAccounts(){
  if(!isOwner()) return '<div class="alert bad">Chỉ owner quản lý tài khoản.</div>';
  if(ACC===null){ loadAcc(); return '<div class="empty">Đang tải danh sách tài khoản…</div>'; }
  let h='<div class="row between"><div><h1>Tài khoản, phân quyền</h1><div class="sub">'+ACC.length+' tài khoản. Owner: toàn quyền, cấp tài khoản. Quản lý: sửa mọi dữ liệu, duyệt phép, FAQ. Nhân viên: ghi việc, vùng, lịch, báo cáo. Chỉ xem: không sửa. Tài chính bật riêng từng người.</div></div><div class="row"><a class="btn" href="#nhat-ky">Nhật ký</a><button class="btn" id="accBulk">Tạo tài khoản cho nhân sự</button><button class="btn pri" id="accAdd">Thêm tài khoản</button></div></div>';
  h+='<div class="tw panel" style="margin-top:12px"><table><thead><tr><th>Tài khoản</th><th>Nhân sự</th><th>Vai trò</th><th>Tài chính</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th></tr></thead><tbody>'
   +ACC.map(u=>'<tr data-acc="'+u.id+'" style="cursor:pointer"><td><b>'+esc(u.name||"")+'</b><div class="sub">'+esc(u.email)+'</div></td><td>'+esc(pname(u.person_id)||"—")+'</td><td>'+ROLE_L[u.role]+'</td><td>'+(u.role==="owner"||u.can_finance?'<span class="pill good">Được xem</span>':'<span class="pill">Không</span>')+'</td><td>'+(u.active?(u.must_change_pw?'<span class="pill warn">Chờ đổi mật khẩu</span>':'<span class="pill good">Hoạt động</span>'):'<span class="pill bad">Đã khóa</span>')+'</td><td class="sub">'+(u.last_sign_in_at?dmy(u.last_sign_in_at.slice(0,10)):"Chưa")+'</td></tr>').join("")+'</tbody></table></div>';
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
const LOG_COL={zones:"Vùng",people:"Nhân sự",tasks:"Việc",contracts:"Hợp đồng",daily:"Báo cáo",units:"Đơn vị",events:"Lịch",leaves:"Nghỉ phép",faqs:"FAQ",accounts:"Tài khoản"};
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
  const OP={zones:openZone,tasks:id=>openTask(id),contracts:openContract,events:openEvent,units:openUnit,people:openPerson,faqs:openFaq,leaves:openLeave};
  A.querySelectorAll("[data-lgo]").forEach(a=>a.addEventListener("click",e=>{ e.preventDefault(); const [c,id]=a.dataset.lgo.split("|"); const f=OP[c]; if(f) f(id); else toast("Mục này không mở chi tiết được"); }));
}
