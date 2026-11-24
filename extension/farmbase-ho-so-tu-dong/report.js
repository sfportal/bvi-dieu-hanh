const $ = id => document.getElementById(id);
let DATA = null;
let SYNC = { map: {}, last: null };
let PICK = new Set();
// bộ lọc chọn nhiều: doanh nghiệp (null = tất cả), trạng thái vùng
let FILT = { vendors: null, statuses: ['ACTIVE'], init: false };
let SENDING = false;

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fillSelect(sel, values) {
  const cur = sel.value;
  sel.length = 1;
  values.forEach(v => { const o = document.createElement('option'); o.value = o.textContent = v; sel.appendChild(o); });
  sel.value = cur;
}

function filtered() {
  if (!DATA) return [];
  const q = $('q').value.trim().toLowerCase();
  const prov = $('fProv').value, ven = FILT.vendors ? new Set(FILT.vendors) : null, sts = new Set(FILT.statuses), crit = $('fCrit').value, st = $('fState').value, bv = $('fBvi').value, dp = $('fDeep').value, sc = $('fScan').value;
  return DATA.rows.filter(r =>
    (!q || [r.name, r.code, r.vendor, r.ward].join(' ').toLowerCase().includes(q)) &&
    (!prov || r.province === prov) && (!ven || ven.has(r.vendor)) && (!sts.size || !r.status || sts.has(r.status)) &&
    (crit === '' || (crit.startsWith('d:') ? (r.deep?.sum?.[crit.slice(2)] || 0) > 0 : r.flags[Number(crit)] === 1)) &&
    (!dp || (dp === 'ok' && FB.deepOk(r)) || (dp === 'missing' && r.deep?.sum?.issues > 0) || (dp === 'error' && r.deep?.error) || (dp === 'none' && !r.deep)) &&
    (!bv || FB.bviState(r, SYNC.map) === bv) &&
    (!sc || String(FB.scanState(r)) === sc) &&
    (!st || (st === 'missing' && r.missing > 0) || (st === 'complete' && r.flags.every(f => f === 0)) || (st === 'unchecked' && !r.checkedAt)));
}

function renderTable() {
  const rows = filtered();
  $('count').textContent = `${rows.length} vùng`;
  const head = `<tr><th><input type="checkbox" id="pickAll" title="Chọn tất cả vùng đang lọc"></th><th>#</th><th>Tên vùng trồng</th><th>Doanh nghiệp</th><th>Tỉnh / Xã</th><th>Trạng thái</th><th>Ngày KT</th><th>Thiếu</th><th>Nông hộ, lô</th><th title="File tên chứa scan_hoso trong thư viện vùng">Scan hồ sơ</th><th>BVI</th>${FB.SHORT.map((l, i) => `<th class="c" title="${esc(FB.LABELS[i])}">${esc(l)}</th>`).join('')}</tr>`;
  const cell = f => f === 1 ? '<span class="f1">Thiếu</span>' : f === 0 ? '<span class="f0">✓</span>' : '<span class="fn">?</span>';
  const bvCell = r => {
    const k = FB.bviState(r, SYNC.map), st = SYNC.map[r.id] || {}, [l, c] = FB.BVI_ST[k];
    return `<span class="b ${c}" title="${esc(st.msg || '')}">${esc(l)}</span>${st.zoneName ? `<div class="muted">${esc(st.zoneName)}</div>` : ''}`;
  };
  $('tbl').innerHTML = head + rows.map((r, i) => `<tr>
    <td><input type="checkbox" data-pick="${esc(r.id)}"${PICK.has(r.id) ? ' checked' : ''}></td>
    <td class="muted">${i + 1}</td>
    <td class="name">${esc(r.name)}${r.code ? `<div class="muted">${esc(r.code)}</div>` : ''}</td>
    <td>${esc(r.vendor)}</td>
    <td>${esc(r.province)}<div class="muted">${esc(r.ward)}</div></td>
    <td>${esc(FB.STATUS[r.status] || r.status || '')}</td>
    <td>${r.checkedAt ? r.checkedAt.slice(0, 10) : '<span class="fn">Chưa kiểm tra</span>'}</td>
    <td class="miss">${r.missing}</td>
    <td class="dp">${deepCell(r)}</td>
    <td>${scanCell(r)}</td>
    <td class="bv">${bvCell(r)}</td>
    ${r.flags.map(f => `<td class="c">${cell(f)}</td>`).join('')}
  </tr>`).join('');
  $('tbl').querySelectorAll('[data-deep]').forEach(b => b.onclick = () => openDeep(b.dataset.deep));
  $('tbl').querySelectorAll('[data-scan]').forEach(b => b.onclick = () => openScan(b.dataset.scan));
  $('tbl').querySelectorAll('[data-pick]').forEach(c => c.onchange = () => { c.checked ? PICK.add(c.dataset.pick) : PICK.delete(c.dataset.pick); renderBvi(); });
  const all = $('pickAll');
  if (all) { all.checked = rows.length > 0 && rows.every(r => PICK.has(r.id)); all.onchange = () => { rows.forEach(r => all.checked ? PICK.add(r.id) : PICK.delete(r.id)); renderTable(); renderBvi(); }; }
}

// ---------- File scan hồ sơ ----------
function scanCell(r) {
  const s = FB.scanState(r);
  if (s === null) return '<span class="fn">Chưa kiểm tra</span>';
  if (s === -1) return `<span class="b b-err" title="${esc(r.scan.error)}">Lỗi đọc</span>`;
  return s ? `<button class="lnk" data-scan="${esc(r.id)}">Có ${r.scan.n} file</button>` : '<span class="f1">Chưa có</span>';
}
function openScan(id) {
  const r = DATA?.rows.find(x => x.id === id); if (!r?.scan?.files) return;
  $('dlgBody').innerHTML = `<div class="dh"><div><b>${esc(r.name)}</b> <span class="muted">File scan hồ sơ (tên chứa scan_hoso)</span></div><button id="dlgX">Đóng</button></div>` +
    `<table><tr><th>Tên file</th><th>Nhóm trong thư viện</th><th>Ngày tải lên</th></tr>${r.scan.files.map(f => `<tr><td>${esc(f.name)}</td><td>${esc(f.set)}</td><td>${f.at ? FB.fmtTime(f.at) : ''}</td></tr>`).join('')}</table>`;
  $('dlg').showModal(); $('dlgX').onclick = () => $('dlg').close();
}

// ---------- Nông hộ và lô ----------
function deepCell(r) {
  if (!r.deep) return '<span class="fn">Chưa kiểm tra</span>';
  if (r.deep.error) return `<span class="b b-err" title="${esc(r.deep.error)}">Lỗi đọc</span>`;
  const d = r.deep.sum, bad = FB.DEEP.filter(([k]) => d[k] > 0);
  return `<button class="lnk" data-deep="${esc(r.id)}">${d.f} hộ · ${d.p} lô</button><br>` +
    (bad.length ? bad.map(([k, , sh]) => `<span class="b ${k === 'dup' || k === 'pZero' ? 'b-err' : 'b-chg'}">${esc(sh)} ${d[k]}</span>`).join(' ') : '<span class="b b-ok">Đủ</span>');
}
function openDeep(id) {
  const r = DATA?.rows.find(x => x.id === id); if (!r?.deep?.sum) return;
  const d = r.deep, yes = v => v ? '<span class="f1">Thiếu</span>' : '<span class="f0">✓</span>';
  let h = `<div class="dh"><div><b>${esc(r.name)}</b> <span class="muted">${esc([r.code, r.vendor, FB.STATUS[r.status]].filter(Boolean).join(' · '))}</span></div><button id="dlgX">Đóng</button></div>`;
  h += `<div class="kpis">${[['', d.sum.f, 'Nông hộ'], ['', d.sum.p, 'Lô'], ...FB.DEEP.map(([k, l]) => [k, d.sum[k], l])].map(([k, v, l]) => `<div class="kpi${v && k ? ' warn' : ''}"><b>${v}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
  if (d.dups.length) h += `<h3>Trùng tờ, thửa</h3><table><tr><th>Tờ</th><th>Thửa</th><th>Các lô</th></tr>${d.dups.map(x => `<tr><td>${esc(x.page)}</td><td>${esc(x.plot)}</td><td>${esc(x.plots.join(', '))}</td></tr>`).join('')}</table>`;
  if (d.farmers.length) h += `<h3>Nông hộ còn thiếu (${d.farmers.length})</h3><table><tr><th>Nông hộ</th><th>Số CCCD</th><th>Ảnh mặt trước</th><th>Ảnh mặt sau</th></tr>${d.farmers.map(f => `<tr><td>${esc(f.name)}</td><td class="c">${yes(f.noId)}</td><td class="c">${yes(f.noFront)}</td><td class="c">${yes(f.noBack)}</td></tr>`).join('')}</table>`;
  if (d.plots.length) h += `<h3>Lô còn thiếu hoặc cần xem lại (${d.plots.length})</h3><table><tr><th>Lô</th><th>Nông hộ</th><th>Ảnh bìa</th><th>Tờ</th><th>Thửa</th><th>Số cây</th><th>Diện tích (m²)</th></tr>${d.plots.map(p => `<tr><td>${esc(p.code)}${p.dup ? ' <span class="b b-err">Trùng</span>' : ''}</td><td>${esc(p.farmer)}</td><td class="c">${yes(p.noImg)}</td><td>${p.noPage ? yes(1) : esc(p.page)}</td><td>${p.noPlot ? yes(1) : esc(p.plot)}</td><td>${p.noTrees ? yes(1) : esc(p.trees)}</td><td>${p.noArea ? yes(1) : p.zero ? '<span class="b b-err">0</span>' : esc(p.area)}</td></tr>`).join('')}</table>`;
  if (!d.dups.length && !d.farmers.length && !d.plots.length) h += '<p class="ok">Nông hộ và lô của vùng này đã đủ.</p>';
  $('dlgBody').innerHTML = h; $('dlg').showModal(); $('dlgX').onclick = () => $('dlg').close();
}

// ---------- Phạm vi lấy dữ liệu: trạng thái vùng, tổ chức ----------
let SCOPE = null, VENDORS = [];
function renderScope() {
  if (!SCOPE) return;
  document.querySelectorAll('[data-st]').forEach(c => c.checked = SCOPE.statuses.includes(c.dataset.st));
  $('scDeep').checked = SCOPE.deep !== false;
  // phạm vi mặc định theo tên: khi đã có danh sách tổ chức thì đổi thành chọn cụ thể
  if (!SCOPE.vendors.length && SCOPE.vendorKeys?.length && VENDORS.length) {
    const M = VENDORS.filter(v => FB.vendorMatch(v.name, SCOPE.vendorKeys)); SCOPE.vendors = M.map(v => v.id); SCOPE.vendorNames = M.map(v => v.name); SCOPE.vendorKeys = [];
  }
  const q = $('scVq').value.trim().toLowerCase(), sel = new Set(SCOPE.vendors);
  const L = VENDORS.length ? VENDORS : SCOPE.vendors.map((id, i) => ({ id, name: SCOPE.vendorNames[i] || id }));
  $('scVlist').innerHTML = L.filter(v => !q || v.name.toLowerCase().includes(q) || sel.has(v.id))
    .sort((a, b) => (sel.has(b.id) - sel.has(a.id)) || a.name.localeCompare(b.name, 'vi'))
    .map(v => `<label><input type="checkbox" data-ven="${esc(v.id)}"${sel.has(v.id) ? ' checked' : ''}> ${esc(v.name)}</label>`).join('') || '<span class="muted">Bấm "Tải danh sách tổ chức" để chọn.</span>';
  $('scVsum').textContent = SCOPE.vendors.length ? `Đã chọn ${SCOPE.vendors.length} tổ chức` : SCOPE.vendorKeys?.length ? 'Mặc định: Song Toàn Phát, Quyết Tiến, Diệp Minh Anh, Yanning, 37, Greens, Hồng Thuận, Mai Anh Tuấn' : 'Tất cả tổ chức';
  $('scVlist').querySelectorAll('[data-ven]').forEach(c => c.onchange = () => {
    const v = L.find(x => x.id === c.dataset.ven);
    SCOPE.vendorKeys = [];
    if (c.checked) { SCOPE.vendors.push(v.id); SCOPE.vendorNames.push(v.name); }
    else { const i = SCOPE.vendors.indexOf(v.id); SCOPE.vendors.splice(i, 1); SCOPE.vendorNames.splice(i, 1); }
    renderScope();
  });
}
function scopeText(sc) {
  if (!sc) return '';
  return (sc.statuses || []).map(s => FB.STATUS[s]).join(', ') + ' · ' + (sc.vendors?.length ? sc.vendors.length + ' tổ chức' : sc.vendorKeys?.length ? 'doanh nghiệp mặc định' : 'tất cả tổ chức') + (sc.deep === false ? ' · không kiểm tra nông hộ, lô' : '');
}
async function saveScope(run) {
  const statuses = [...document.querySelectorAll('[data-st]')].filter(c => c.checked).map(c => c.dataset.st);
  if (!statuses.length) { $('scMsg').innerHTML = '<span class="err">Chọn ít nhất một trạng thái vùng trồng.</span>'; return; }
  SCOPE = { ...SCOPE, statuses, deep: $('scDeep').checked };
  await chrome.runtime.sendMessage({ type: 'saveSettings', settings: { scope: SCOPE } });
  $('scMsg').innerHTML = '<span class="ok">Đã lưu phạm vi. Lịch tự động cũng dùng phạm vi này.</span>';
  if (run) $('run').click();
}

// ---------- Bộ lọc chọn nhiều: doanh nghiệp, trạng thái vùng ----------
const allVendors = () => [...new Set((DATA?.rows || []).map(r => r.vendor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
function defaultVendors() { const d = allVendors().filter(v => FB.vendorMatch(v)); return d.length ? d : null; }
async function initFilt() {
  const { filt } = await chrome.storage.local.get('filt');
  FILT = { vendors: filt ? filt.vendors : defaultVendors(), statuses: filt?.statuses || ['ACTIVE'], init: true };
  renderMs(); pickFiltered(); if (DATA) renderKpis(); renderTable(); renderBvi();
}
function saveFilt() { chrome.storage.local.set({ filt: { vendors: FILT.vendors, statuses: FILT.statuses } }); }
function pickFiltered() { PICK = new Set(filtered().map(r => r.id)); }
function onFilter() { pickFiltered(); if (DATA) renderKpis(); renderTable(); renderBvi(); }
function renderMs() {
  const V = allVendors(), sel = FILT.vendors ? new Set(FILT.vendors) : null, q = ($('msVenQ').value || '').trim().toLowerCase();
  $('msVenS').textContent = !sel ? 'Tất cả doanh nghiệp' : sel.size === 1 ? [...sel][0] : `${sel.size} doanh nghiệp`;
  $('msVenL').innerHTML = V.filter(v => !q || v.toLowerCase().includes(q)).map(v => `<label><input type="checkbox" data-fven="${esc(v)}"${!sel || sel.has(v) ? ' checked' : ''}> ${esc(v)}</label>`).join('') || '<span class="muted">Không có</span>';
  $('msVenL').querySelectorAll('[data-fven]').forEach(c => c.onchange = () => {
    const s = new Set(FILT.vendors || V); c.checked ? s.add(c.dataset.fven) : s.delete(c.dataset.fven);
    FILT.vendors = s.size === V.length ? null : [...s]; saveFilt(); renderMs(); onFilter();
  });
  document.querySelectorAll('[data-fst]').forEach(c => c.checked = FILT.statuses.includes(c.dataset.fst));
  $('msStS').textContent = FILT.statuses.length === 3 || !FILT.statuses.length ? 'Mọi trạng thái vùng' : FILT.statuses.map(s => FB.STATUS[s]).join(', ');
}
$('msVenQ').oninput = renderMs;
$('msVenDef').onclick = () => { FILT.vendors = defaultVendors(); saveFilt(); renderMs(); onFilter(); };
$('msVenAll').onclick = () => { FILT.vendors = null; saveFilt(); renderMs(); onFilter(); };
$('msVenNone').onclick = () => { FILT.vendors = []; saveFilt(); renderMs(); onFilter(); };
document.querySelectorAll('[data-fst]').forEach(c => c.onchange = () => { FILT.statuses = [...document.querySelectorAll('[data-fst]')].filter(x => x.checked).map(x => x.dataset.fst); saveFilt(); renderMs(); onFilter(); });
document.addEventListener('click', e => document.querySelectorAll('details.ms[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }));

// ---------- Đồng bộ một chiều sang BVI Điều hành ----------
const needSend = r => !['ok', 'old'].includes(FB.bviState(r, SYNC.map));
function renderBvi(extra) {
  chrome.storage.local.get('bvi').then(({ bvi }) => {
    const has = !!bvi?.key;
    $('bviPfx').textContent = has ? '· đã lưu khóa ' + bvi.key.slice(0, 10) + '…' : '· chưa có khóa';
    if (!has) $('bviCfg').open = true;
    if (document.activeElement !== $('bviUrl')) $('bviUrl').value = bvi?.url || FB.BVI_URL;
    $('bviGo').disabled = SENDING || !DATA || !PICK.size || !has;
    $('bviGo').textContent = SENDING ? 'Đang gửi…' : `Đồng bộ ${PICK.size} vùng sang BVI`;
    const L = SYNC.last, rows = DATA?.rows || [];
    const cnt = k => rows.filter(r => FB.bviState(r, SYNC.map) === k).length;
    let h = '';
    if (L) h += `<span class="${L.error ? 'err' : 'ok'}">Lần đồng bộ gần nhất: ${FB.fmtTime(L.at)}${L.error ? ' — lỗi: ' + esc(L.error) : `, gửi ${L.sent} vùng: cập nhật ${L.counts.updated || 0}, giữ nguyên ${L.counts.same || 0}${L.counts.old ? ', BVI có bản mới hơn ' + L.counts.old : ''}`}</span><br>`;
    if (rows.length) h += `<span class="muted">Trạng thái hiện tại: ${cnt('ok')} đã gửi, khớp · ${cnt('changed') + cnt('none')} chưa gửi hoặc có thay đổi</span>`;
    if (extra) h += '<br>' + extra;
    $('bviMsg').innerHTML = h;
  });
}
async function bviSend() {
  const { bvi } = await chrome.storage.local.get('bvi');
  if (!bvi?.key || !DATA || !PICK.size || SENDING) return;
  SENDING = true; renderBvi();
  let r = null; try { r = await FB.bviPush(DATA, DATA.rows.filter(x => PICK.has(x.id))); } catch (e) { renderBvi('<span class="err">' + esc(e.message || e) + '</span>'); }
  SENDING = false;
  if (r) { SYNC = r.SYNC; renderSyncHist(r.hist); }
  renderTable(); renderBvi();
}
function renderSyncHist(list) {
  $('shist').innerHTML = '<tr><th>Thời điểm</th><th>Dữ liệu lấy lúc</th><th>Gửi</th><th>Cập nhật</th><th>Giữ nguyên</th><th>Kết quả</th></tr>' +
    (list || []).map(h => `<tr><td>${FB.fmtTime(h.at)}</td><td>${FB.fmtTime(h.ranAt)}</td><td>${h.sent}</td><td>${h.counts.updated || 0}</td><td>${h.counts.same || 0}</td><td>${h.error ? '<span class="b b-err">' + esc(h.error) + '</span>' : '<span class="b b-ok">Xong</span>'}</td></tr>`).join('');
}

function renderKpis() {
  // tổng quan theo bộ lọc doanh nghiệp, trạng thái đang chọn
  const s = FB.summarize(DATA.rows.filter(r => (!FILT.vendors || FILT.vendors.includes(r.vendor)) && (!FILT.statuses.length || !r.status || FILT.statuses.includes(r.status))));
  const items = [['', s.total, 'Vùng trồng'], ['complete', s.complete, 'Đủ 12 mục'], ['unchecked', s.unchecked, 'Chưa kiểm tra HS'],
    ...FB.LABELS.map((l, i) => ['c' + i, s.counts[i], l])];
  if (s.deep) items.push(['dok', s.deep.ok, `Đủ nông hộ, lô (/${s.deep.checked})`], ['', s.deep.farmers, 'Nông hộ'], ['', s.deep.plots, 'Lô'],
    ...FB.DEEP.map(([k, l], i) => ['cd:' + k, s.deep.units[i], `${l} (${s.deep.totals[i]})`]));
  if (s.scan) items.push(['s:1', s.scan.has, 'Có file scan hồ sơ'], ['s:0', s.scan.none, 'Chưa có file scan hồ sơ']);
  $('kpis').innerHTML = items.map(([k, v, l]) => `<div class="kpi" data-k="${k}"><b>${v}</b><span>${esc(l)}</span></div>`).join('');
  $('kpis').querySelectorAll('.kpi').forEach(el => el.onclick = () => {
    const k = el.dataset.k;
    $('fCrit').value = k.startsWith('cd:') ? 'd:' + k.slice(3) : /^c\d/.test(k) ? k.slice(1) : '';
    $('fState').value = k === 'complete' || k === 'unchecked' ? k : '';
    $('fDeep').value = k === 'dok' ? 'ok' : '';
    $('fScan').value = k.startsWith('s:') ? k.slice(2) : '';
    $('kpis').querySelectorAll('.kpi').forEach(x => x.classList.toggle('active', x === el && k !== ''));
    renderTable();
  });
}

function renderHistory(history) {
  $('hist').innerHTML = `<tr><th>Thời điểm</th><th>Kiểu</th><th>Tổng</th><th>Đủ</th><th>Chưa KT</th>${FB.SHORT.map(l => `<th>${esc(l)}</th>`).join('')}</tr>` +
    (history || []).map(h => `<tr><td>${FB.fmtTime(h.ranAt)}</td><td>${h.source === 'auto' ? 'Tự động' : 'Thủ công'}</td><td>${h.total}</td><td>${h.complete}</td><td>${h.unchecked}</td>${h.counts.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
}

async function load() {
  const { latest, history, bviSync, bviHist } = await chrome.storage.local.get(['latest', 'history', 'bviSync', 'bviHist']);
  const prevRan = DATA?.ranAt;
  DATA = latest || null;
  if (DATA && !DATA.summary) DATA.summary = FB.summarize(DATA.rows);
  SYNC = bviSync || { map: {}, last: null };
  renderSyncHist(bviHist);
  if (DATA && !FILT.init) initFilt();
  if (DATA && DATA.ranAt !== prevRan) pickFiltered();
  renderBvi();
  if (!DATA) { $('ran').textContent = 'Chưa có dữ liệu — bấm "Chạy lại ngay".'; $('tbl').innerHTML = ''; renderHistory(history); return; }
  $('ran').textContent = 'Cập nhật: ' + FB.fmtTime(DATA.ranAt) + (DATA.scope ? ' · ' + scopeText(DATA.scope) : '');
  fillSelect($('fProv'), [...new Set(DATA.rows.map(r => r.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')));
  renderMs();
  if ($('fBvi').length === 1) Object.entries(FB.BVI_ST).filter(([k]) => k !== 'invalid').forEach(([k, [l]]) => { const o = document.createElement('option'); o.value = k; o.textContent = l; $('fBvi').appendChild(o); });
  if ($('fCrit').length === 1) [...FB.LABELS.map((l, i) => [i, l]), ...FB.DEEP.map(([k, l]) => ['d:' + k, l])].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; $('fCrit').appendChild(o); });
  renderKpis(); renderTable(); renderHistory(history);
}

$('bviSave').onclick = async () => {
  const { bvi = {} } = await chrome.storage.local.get('bvi');
  const k = $('bviKey').value.trim(), u = $('bviUrl').value.trim().replace(/\/+$/, '') || FB.BVI_URL;
  if (k && !/^bvi_[A-Za-z0-9]{40}$/.test(k)) { renderBvi('<span class="err">Khóa không đúng dạng bvi_… (44 ký tự)</span>'); return; }
  if (!/^https:\/\/[^\s]+$/.test(u)) { renderBvi('<span class="err">Địa chỉ API phải bắt đầu bằng https://</span>'); return; }
  await chrome.storage.local.set({ bvi: { ...bvi, url: u, ...(k ? { key: k } : {}) } }); $('bviKey').value = ''; renderBvi('<span class="ok">Đã lưu cài đặt API trên máy này.</span>');
};
$('bviTest').onclick = async () => {
  const { bvi } = await chrome.storage.local.get('bvi');
  if (!bvi?.key) { renderBvi('<span class="err">Chưa có khóa API.</span>'); return; }
  try {
    const r = await fetch((bvi.url || FB.BVI_URL).replace(/\/+$/, ''), { headers: { 'X-API-Key': bvi.key } }); const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || j.error || 'HTTP ' + r.status);
    const ok = (j.write || []).some(w => w.id === 'farmbase_sync');
    renderBvi(ok ? `<span class="ok">Kết nối được. Khóa "${esc(j.key)}" có quyền đồng bộ FarmBase.</span>` : `<span class="err">Kết nối được nhưng khóa "${esc(j.key)}" chưa có quyền đồng bộ FarmBase.</span>`);
  } catch (e) { renderBvi('<span class="err">Không kết nối được: ' + esc(e.message || e) + '</span>'); }
};
$('bviDel').onclick = async () => { const { bvi = {} } = await chrome.storage.local.get('bvi'); delete bvi.key; await chrome.storage.local.set({ bvi }); renderBvi('Đã xóa khóa khỏi extension.'); };
$('bakOut').onclick = async () => {
  const { settings, filt, bvi = {} } = await chrome.storage.local.get(['settings', 'filt', 'bvi']);
  const o = { app: 'farmbase-ho-so-tu-dong', version: chrome.runtime.getManifest().version, at: new Date().toISOString(), settings: settings || null, filt: filt || null, bvi: { url: bvi.url || '', ...($('bakKey').checked && bvi.key ? { key: bvi.key } : {}) } };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' }));
  a.download = 'thiet-lap-farmbase-ext_' + FB.dateStamp(o.at) + '.json'; a.click();
  renderBvi('<span class="ok">Đã tải file thiết lập' + (o.bvi.key ? ' (có khóa API, giữ file kín)' : ' (không kèm khóa API)') + '.</span>');
};
$('bakIn').onclick = () => $('bakFile').click();
$('bakFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const o = JSON.parse(await f.text());
    if (o?.app !== 'farmbase-ho-so-tu-dong') throw new Error('Không phải file thiết lập của extension này');
    const { bvi = {} } = await chrome.storage.local.get('bvi'), set = {};
    if (o.settings && typeof o.settings === 'object') set.settings = o.settings;
    if (o.filt && typeof o.filt === 'object') set.filt = o.filt;
    const nb = { ...bvi }; if (/^https:\/\/\S+$/.test(o.bvi?.url || '')) nb.url = o.bvi.url; if (/^bvi_[A-Za-z0-9]{40}$/.test(o.bvi?.key || '')) nb.key = o.bvi.key; set.bvi = nb;
    await chrome.storage.local.set(set);
    if (set.settings) await chrome.runtime.sendMessage({ type: 'saveSettings', settings: set.settings }).catch(() => {});
    renderBvi('<span class="ok">Đã khôi phục thiết lập từ file ' + esc(f.name) + '. Đang tải lại trang…</span>'); setTimeout(() => location.reload(), 800);
  } catch (err) { renderBvi('<span class="err">Không khôi phục được: ' + esc(err.message || err) + '</span>'); }
};
$('bviPick').onclick = () => { pickFiltered(); renderTable(); renderBvi(); };
$('bviGo').onclick = bviSend;
$('scVq').oninput = renderScope;
$('scVload').onclick = async () => {
  $('scVload').disabled = true; $('scVload').textContent = 'Đang tải…';
  const r = await chrome.runtime.sendMessage({ type: 'loadVendors' });
  $('scVload').disabled = false; $('scVload').textContent = 'Tải danh sách tổ chức';
  if (r?.ok) { VENDORS = r.list; renderScope(); $('scMsg').textContent = `Có ${r.list.length} tổ chức.`; }
  else $('scMsg').innerHTML = '<span class="err">' + esc(String(r?.error || '').startsWith('AUTH:') ? 'Hãy đăng nhập admin.farmbase.vn trên Chrome rồi thử lại.' : 'Không tải được: ' + (r?.error || '')) + '</span>';
};
$('scAll').onclick = () => { SCOPE.vendors = []; SCOPE.vendorNames = []; SCOPE.vendorKeys = []; renderScope(); };
$('scDef').onclick = () => { SCOPE.vendors = []; SCOPE.vendorNames = []; SCOPE.vendorKeys = FB.DEFAULT_VENDOR_KEYS.slice(); renderScope(); };
$('scSave').onclick = () => saveScope(false);
$('scRun').onclick = () => saveScope(true);
(async () => {
  const st = await chrome.runtime.sendMessage({ type: 'getSettings' });
  SCOPE = JSON.parse(JSON.stringify(st?.scope || { statuses: ['ACTIVE'], vendors: [], vendorNames: [], vendorKeys: FB.DEFAULT_VENDOR_KEYS, deep: true }));
  const { vendors } = await chrome.storage.local.get('vendors'); VENDORS = vendors?.list || [];
  renderScope();
})();
['q', 'fProv', 'fCrit', 'fState', 'fBvi', 'fDeep', 'fScan'].forEach(id => $(id).addEventListener('input', onFilter));
$('csv').onclick = () => {
  const blob = new Blob([FB.toCSV(filtered())], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ho-so-vung-trong_${DATA ? FB.dateStamp(DATA.ranAt) : 'trong'}.csv`;
  a.click();
};
$('run').onclick = async () => {
  $('run').disabled = true; $('run').textContent = 'Đang chạy…';
  const r = await chrome.runtime.sendMessage({ type: 'runNow' });
  $('run').disabled = false; $('run').textContent = 'Chạy lại ngay';
  if (!r?.ok) alert('Không chạy được: ' + (r?.error || ''));
};
chrome.storage.onChanged.addListener(ch => {
  if (ch.latest || ch.history || ch.bviSync) load();
  if (ch.status) { const s = ch.status.newValue || {}; $('prog').textContent = s.running ? 'Đang kiểm tra' + (s.progress ? ` từng vùng: ${s.progress.done}/${s.progress.total}` : '…') : ''; }
});
load();
