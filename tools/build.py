import re,sys
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))  # chạy được từ bất kỳ thư mục nào
src=open('source.html').read(); core=open('core.js').read()
s=src
def R(a,b,cnt=1):
    global s; assert s.count(a)==cnt,(s.count(a),a[:70]); s=s.replace(a,b)
# document skeleton
s='<!doctype html>\n<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow">\n'+s
R('<header class="top">','</head><body>\n<header class="top">')
s=s.rstrip()+'\n</body></html>\n'
# user menu instead of "Tôi là"
R('<div class="me"><span class="lbl sub">Tôi là</span><select id="meSel" aria-label="Chọn tên của bạn"></select></div>','<div class="me" id="meBox"><button class="btn sm" id="meBtn" style="max-width:220px;overflow:hidden;text-overflow:ellipsis">Tài khoản</button><select id="meSel" hidden></select></div>')
R('$("#meSel").addEventListener("change",e=>{me=e.target.value||null;saveUi();render();});','$("#meBtn").addEventListener("click",()=>{ if(PROFILE) openMe(); });')
R('try{const s=JSON.parse(localStorage.getItem("bvi-ui")||"{}"); if(s.me)me=s.me;','try{const s=JSON.parse(localStorage.getItem("bvi-ui")||"{}");')
# libraries
R('<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>','<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>\n<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>')
# replace claude-based boot + data helpers with core
a=s.index('/* ---------- db ---------- */'); b=s.index('const stamp=()=>')
s=s[:a]+core+'\n'+s[b:]
R('function renderMe(){\n  const ps=Object.entries(S.people).sort((a,b)=>a[1].name.localeCompare(b[1].name,"vi"));\n  $("#meSel").innerHTML=\'<option value="">Chọn tên…</option>\'+ps.map(([k,p])=>\'<option value="\'+k+\'"\'+(k===me?" selected":"")+\'>\'+esc(p.name)+\'</option>\').join("");\n}\n','')
# roles
R('function canManage(){ const p=S.people[me]; return userCan || !!(p&&(p.team==="lead"||p.team==="dieuphoi")); }','function canManage(){ return !!PROFILE&&["owner","manager"].includes(PROFILE.role); }')
# finance hiding
R('const fmtVnd=n=>(Number(n)||0).toLocaleString("vi-VN")+" đ";','const fmtVnd=n=>canFin()?(Number(n)||0).toLocaleString("vi-VN")+" đ":"••• (ẩn)";')
R('''<input type="number" data-it="'+i+'" data-k="price" value="'+esc(it.price)+'" style="width:110px">''','''<input type="number" data-it="'+i+'" data-k="price" value="'+(canFin()?esc(it.price):"")+'"'+(canFin()?'':' disabled placeholder="Ẩn"')+' style="width:110px">''')
R('''<input type="checkbox" data-pay="'+i+'"'+(p.paid?" checked":"")+'>''','''<input type="checkbox" data-pay="'+i+'"'+(p.paid?" checked":"")+(canFin()?'':' disabled')+'>''')
R('''(pm.paid?'<span class="pill good">Đã thu</span>':ok?''','''(pm.paid&&canFin()?'<span class="pill good">Đã thu</span>':ok?''')
# routes: accounts page
R('ui.view=VIEWS.some(v=>v[0]===h)||h==="khach"?h:"tong-quan";','ui.view=VIEWS.some(v=>v[0]===h)||h==="khach"||h==="tai-khoan"||h==="nhat-ky"||h==="api"||h==="thu-chi"?h:"tong-quan";')
R('  else if(v==="thong-ke") el.innerHTML=vStats();','  else if(v==="thong-ke") el.innerHTML=vStats();\n  else if(v==="tai-khoan") el.innerHTML=vAccounts();\n  else if(v==="nhat-ky") el.innerHTML=vLog();\n  else if(v==="api") el.innerHTML=vApi();\n  else if(v==="thu-chi") el.innerHTML=vExp();')
R('  if(ui.view==="thong-ke") bindStats(A);','''  if(ui.view==="thong-ke") bindStats(A);
  if(ui.view==="nhat-ky") bindLog(A);
  if(ui.view==="api") bindApi(A);
  if(ui.view==="thu-chi") bindExp(A);
  if(ui.view==="tai-khoan"){ $("#accAdd")?.addEventListener("click",()=>openAcc(null)); $("#accBulk")?.addEventListener("click",openBulk); A.querySelectorAll("[data-acc]").forEach(r=>r.addEventListener("click",()=>openAcc(r.dataset.acc))); $("#impJson")?.addEventListener("change",e=>{ const f=e.target.files[0]; e.target.value=""; if(f) importJson(f); }); }''')
# texts that referenced claude.ai
s=s.replace('Hãy mở trang khi đã đăng nhập claude.ai; nếu vẫn vậy, tải lại trang.','Tải lại trang.')
R('Bạn chưa có quyền tải tệp lên trang này. Nhờ quản lý cấp quyền Contributor trở lên.','Tài khoản chỉ xem không tải tệp lên được.')
# Drive direct upload needs Claude connector: hide in app (keep "Dán link")
R('.faqq{','label:has(> input[data-drive]){display:none}\na.btn{color:inherit;text-decoration:none}\n.faqq{')
# FarmBase import: owner only in app
R("""(canManage()?'<label class="btn" style="cursor:pointer">Nhập từ FarmBase""","""(isOwner()?'<label class="btn" style="cursor:pointer">Nhập từ FarmBase""")
R('async function startImport(file){','async function startImport(file){ if(!isOwner()){ toast("Chỉ owner được nhập từ FarmBase"); return; }')
assert 'claude.use' not in s, [m.start() for m in re.finditer('claude.use',s)]
# link công khai cho khách
R("  const {zs,G,ha,multi}=custData();\n  h+='<div class=\"panel custhead\"","  h+=shPanel(); if(ui.shEdit) return h+shEditor();\n  const {zs,G,ha,multi}=custData();\n  h+='<div class=\"panel custhead\"")
R('    $("#docxRep")?.addEventListener("click",exportCustDocx);','    $("#docxRep")?.addEventListener("click",exportCustDocx); bindShare();')
R('  if(v==="tong-quan") el.innerHTML=vOverview();','  if(v==="tong-quan") el.innerHTML=exQuick()+vOverview();')
R('  if(ui.view==="tong-quan"){ bindTaskLinks(A); maybeNudge(); }','  if(ui.view==="tong-quan"){ bindTaskLinks(A); maybeNudge(); bindExpFile(A); }')
import os
out=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
open(out,'w').write(s); print('built',len(s),'->',os.path.normpath(out))

