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
    startSession(); });
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
async function callAdmin(body,anon){
  try{ const h={"Content-Type":"application/json",apikey:SB_KEY}; if(!anon){ const {data}=await SB.auth.getSession(); h.Authorization="Bearer "+(data.session?.access_token||""); }
    const res=await fetch(SB_URL+"/functions/v1/admin-users",{method:"POST",headers:h,body:JSON.stringify(body)}); return await res.json(); }catch(e){ return {error:"Không kết nối được máy chủ"}; } }
function showChangePw(first){
  const html='<h1 style="margin-top:0">'+(first?'Đổi mật khẩu lần đầu':'Đổi mật khẩu')+'</h1><div class="sub" style="margin-bottom:10px">'+esc(PROFILE?.email||"")+(first?' · mật khẩu được cấp chỉ dùng một lần':'')+'</div><form id="cpf" class="grid" style="gap:8px"><div class="f"><label for="np1">Mật khẩu mới (từ 8 ký tự)</label><input id="np1" type="password" minlength="8" required autocomplete="new-password"></div><div class="f"><label for="np2">Nhập lại</label><input id="np2" type="password" minlength="8" required autocomplete="new-password"></div><button class="btn pri">Lưu mật khẩu</button><div class="sub" id="cpm"></div></form>'+(first?'<div style="margin-top:8px"><a href="#" id="lo2" class="sub">Đăng xuất</a></div>':'');
  if(first) authCard(html); else showDrawer('<div class="dh"><h2>Đổi mật khẩu</h2><button class="btn sm" data-close>Đóng</button></div><div class="db">'+html.replace(/<h1[^]*?<\/h1>/,"")+'</div>');
  $("#lo2")?.addEventListener("click",async e=>{e.preventDefault(); await SB.auth.signOut(); location.reload();});
  $("#cpf").addEventListener("submit",async e=>{ e.preventDefault(); const a=$("#np1").value; if(a!==$("#np2").value){ $("#cpm").textContent="Hai mật khẩu chưa khớp."; return; } if(a.length<8){ $("#cpm").textContent="Cần ít nhất 8 ký tự."; return; }
    $("#cpm").textContent="Đang lưu…"; const {error}=await SB.auth.updateUser({password:a}); if(error){ $("#cpm").textContent=/same/i.test(error.message)?"Mật khẩu mới phải khác mật khẩu cũ.":error.message; return; }
    await SB.from("profiles").update({must_change_pw:false}).eq("id",PROFILE.id); PROFILE.must_change_pw=false; toast("Đã đổi mật khẩu"); if(first) startSession(); else closeDrawer(); });
}
async function startSession(){
  const {data:{session}}=await SB.auth.getSession(); if(!session){ showLogin(); return; }
  const {data:prof,error}=await SB.from("profiles").select("*").eq("id",session.user.id).maybeSingle();
  if(error||!prof){ await SB.auth.signOut(); showLogin("Tài khoản chưa được cấp quyền. Liên hệ owner."); return; }
  if(!prof.active){ await SB.auth.signOut(); showLogin("Tài khoản đã bị khóa."); return; }
  PROFILE=prof; if(prof.must_change_pw){ showChangePw(true); return; }
  userCan=["owner","manager"].includes(prof.role); me=prof.person_id||null; viewerName=prof.name||prof.email;
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
   +'<div class="sub">Nhân sự gắn với tài khoản: <b>'+esc(pname(me)||"chưa gắn")+'</b></div><div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="btn" id="mePw">Đổi mật khẩu</button>'+(isOwner()?'<a class="btn" href="#tai-khoan" id="meAcc">Quản lý tài khoản</a>':'')+'<button class="btn" id="meOut">Đăng xuất</button></div></div>');
  $("#mePw").addEventListener("click",()=>showChangePw(false)); $("#meAcc")?.addEventListener("click",()=>closeDrawer());
  $("#meOut").addEventListener("click",async()=>{ await SB.auth.signOut(); location.hash=""; location.reload(); });
}
/* ---------- quản lý tài khoản (owner) ---------- */
let ACC=null;
async function loadAcc(){ const r=await callAdmin({action:"list"}); if(r.error){ toast(r.error==="owner_only"?"Chỉ owner xem được":r.error); ACC=[]; } else ACC=r.users; if(ui.view==="tai-khoan") render(); }
function vAccounts(){
  if(!isOwner()) return '<div class="alert bad">Chỉ owner quản lý tài khoản.</div>';
  if(ACC===null){ loadAcc(); return '<div class="empty">Đang tải danh sách tài khoản…</div>'; }
  let h='<div class="row between"><div><h1>Tài khoản, phân quyền</h1><div class="sub">'+ACC.length+' tài khoản. Owner: toàn quyền, cấp tài khoản. Quản lý: sửa mọi dữ liệu, duyệt phép, FAQ. Nhân viên: ghi việc, vùng, lịch, báo cáo. Chỉ xem: không sửa. Tài chính bật riêng từng người.</div></div><button class="btn pri" id="accAdd">Thêm tài khoản</button></div>';
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
  for(let i=0;i<rows.length;i+=200){ m.textContent="Đang ghi "+Math.min(i+200,rows.length)+"/"+rows.length+"…"; const {error}=await SB.from("docs").upsert(rows.slice(i,i+200)); if(error){ m.textContent="Lỗi: "+error.message; return; } }
  if(fins.length){ const {error}=await SB.from("contract_fin").upsert(fins); if(error){ m.textContent="Đã ghi dữ liệu, nhưng lỗi phần tài chính: "+error.message; return; } }
  await loadAll(); m.textContent="Đã chuyển "+rows.length+" bản ghi."; render();
}
