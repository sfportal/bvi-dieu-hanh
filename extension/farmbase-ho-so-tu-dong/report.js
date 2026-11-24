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
  const prov = $('fProv').value, ven = FILT.vendors ? new Set(FILT.vendors) : null, sts = new Set(FILT.statuses), crit = $('fCrit').value, st = $('fState').value, bv = $('fBvi').value, dp = $('fDeep').value;
  return DATA.rows.filter(r =>
    (!q || [r.name, r.code, r.vendor, r.ward].join(' ').toLowerCase().includes(q)) &&
    (!prov || r.province === prov) && (!ven || ven.has(r.vendor)) && (!sts.size || !r.status || sts.has(r.status)) &&
    (crit === '' || (crit.startsWith('d:') ? (r.deep?.sum?.[crit.slice(2)] || 0) > 0 : r.flags[Number(crit)] === 1)) &&
    (!dp || (dp === 'ok' && FB.deepOk(r)) || (dp === 'missing' && r.deep?.sum?.issues > 0) || (dp === 'error' && r.deep?.error) || (dp === 'none' && !r.deep)) &&
    (!bv || FB.bviState(r, SYNC.map) === bv) &&
    (!st || (st === 'missing' && r.missing > 0) || (st === 'complete' && r.flags.every(f => f === 0)) || (st === 'unchecked' && !r.checkedAt)));
}

function renderTable() {
  const rows = filtered();
  $('count').textContent = `${rows.length} vùng`;
  const head = `<tr><th><input type="checkbox" id="pickAll" title="Chọn tất cả vùng đang lọc"></th><th>#</th><th>Tên vùng trồng</th><th>Doanh nghiệp</th><th>Tỉnh / Xã</th><th>Trạng thái</th><th>Ngày KT</th><th>Thiếu</th><th>Nông hộ, lô</th><th>BVI</th>${FB.SHORT.map((l, i) => `<th class="c" title="${esc(FB.LABELS[i])}">${esc(l)}</th>`).join('')}</tr>`;
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
    <td class="bv">${bvCell(r)}</td>
    ${r.flags.map(f => `<td class="c">${cell(f)}</td>`).join('')}
  </tr>`).join('');
  $('tbl').querySelectorAll('[data-deep]').forEach(b => b.onclick = () => openDeep(b.dataset.deep));
  $('tbl').querySelectorAll('[data-pick]').forEach(c => c.onchange = () => { c.checked ? PICK.add(c.dataset.pick) : PICK.delete(c.dataset.pick); renderBvi(); });
  const all = $('pickAll');
  if (all) { all.checked = rows.length > 0 && rows.every(r => PICK.has(r.id)); all.onchange = () => { rows.forEach(r => all.checked ? PICK.add(r.id) : PICK.delete(r.id)); renderTable(); renderBvi(); }; }
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
    if (L) h += `<span class="${L.error ? 'err' : 'ok'}">Lần đồng bộ gần nhất: ${FB.fmtTime(L.at)}${L.error ? ' — lỗi: ' + esc(L.error) : `, gửi ${L.sent} vùng: cập nhật ${L.counts.updated || 0}, giữ nguyên ${L.counts.same || 0}, chưa ghép ${L.counts.unmatched || 0}${L.counts.old ? ', BVI có bản mới hơn ' + L.counts.old : ''}`}</span><br>`;
    if (rows.length) h += `<span class="muted">Trạng thái hiện tại: ${cnt('ok')} đã khớp · ${cnt('changed') + cnt('none')} chưa gửi · ${cnt('unmatched')} chưa ghép (owner ghép trong app BVI, trang API, rồi gửi lại)</span>`;
    if (extra) h += '<br>' + extra;
    $('bviMsg').innerHTML = h;
  });
}
async function bviSend() {
  const { bvi } = await chrome.storage.local.get('bvi');
  if (!bvi?.key || !DATA || !PICK.size || SENDING) return;
  const URL_SYNC = (bvi.url || FB.BVI_URL).replace(/\/+$/, '') + '/farmbase-sync';
  SENDING = true; renderBvi();
  const rows = DATA.rows.filter(r => PICK.has(r.id));
  const map = { ...SYNC.map }, counts = { updated: 0, same: 0, old: 0, unmatched: 0, invalid: 0 };
  let error = null, sent = 0;
  try {
    for (let i = 0; i < rows.length; i += 1000) {
      const part = rows.slice(i, i + 1000);
      // chỉ gửi tên, mã, địa bàn, tên doanh nghiệp, ngày kiểm tra và cờ đủ/thiếu
      const payload = { ranAt: DATA.ranAt, criteria: FB.LABELS, rows: part.map(r => ({ id: r.id, code: r.code, name: r.name, status: r.status, crop: r.crop, province: r.province, ward: r.ward, vendor: r.vendor, vendorId: r.vendorId,
        farmerCount: r.farmerCount, plotCount: r.plotCount, areaM2: r.areaM2, checkedAt: r.checkedAt, flags: r.flags,
        // chỉ gửi số đếm và mã lô trùng; không gửi tên nông hộ, số CCCD, số tờ, số thửa
        deep: r.deep?.sum ? { ...r.deep.sum, dupPlots: r.deep.dups.flatMap(d => d.plots).slice(0, 30) } : r.deep?.error ? { error: true } : null })) };
      const res = await fetch(URL_SYNC, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': bvi.key }, body: JSON.stringify(payload) });
      let j = null; try { j = await res.json(); } catch {}
      if (!res.ok || !j?.ok) {
        const code = j?.error || 'http_' + res.status;
        throw new Error({ invalid_api_key: 'Khóa không đúng', revoked_api_key: 'Khóa đã bị thu hồi', expired_api_key: 'Khóa đã hết hạn', forbidden_resource: 'Khóa không có quyền đồng bộ FarmBase', rate_limited: 'Gửi quá nhanh, thử lại sau 1 phút' }[code] || j?.message || code);
      }
      Object.keys(counts).forEach(k => counts[k] += j.counts?.[k] || 0);
      const byId = new Map(part.map(r => [r.id, r]));
      (j.results || []).forEach(x => { if (!x.id || !byId.has(x.id)) return;
        map[x.id] = { status: x.status, zone: x.zone || null, zoneName: x.zoneName || '', sig: FB.sig(byId.get(x.id)), at: j.syncedAt, msg: x.message || x.reason || '' }; });
      sent += part.length;
    }
  } catch (e) { error = String(e?.message || e); }
  const last = { at: new Date().toISOString(), ranAt: DATA.ranAt, sent, counts, error };
  const { bviHist = [] } = await chrome.storage.local.get('bviHist');
  SYNC = { map, last };
  await chrome.storage.local.set({ bviSync: SYNC, bviHist: [last, ...bviHist].slice(0, 50) });
  SENDING = false;

  renderTable(); renderBvi(); renderSyncHist([last, ...bviHist]);
}
function renderSyncHist(list) {
  $('shist').innerHTML = '<tr><th>Thời điểm</th><th>Dữ liệu lấy lúc</th><th>Gửi</th><th>Cập nhật</th><th>Giữ nguyên</th><th>Chưa ghép</th><th>Kết quả</th></tr>' +
    (list || []).map(h => `<tr><td>${FB.fmtTime(h.at)}</td><td>${FB.fmtTime(h.ranAt)}</td><td>${h.sent}</td><td>${h.counts.updated || 0}</td><td>${h.counts.same || 0}</td><td>${h.counts.unmatched || 0}</td><td>${h.error ? '<span class="b b-err">' + esc(h.error) + '</span>' : '<span class="b b-ok">Xong</span>'}</td></tr>`).join('');
}

function renderKpis() {
  // tổng quan theo bộ lọc doanh nghiệp, trạng thái đang chọn
  const s = FB.summarize(DATA.rows.filter(r => (!FILT.vendors || FILT.vendors.includes(r.vendor)) && (!FILT.statuses.length || !r.status || FILT.statuses.includes(r.status))));
  const items = [['', s.total, 'Vùng trồng'], ['complete', s.complete, 'Đủ 12 mục'], ['unchecked', s.unchecked, 'Chưa kiểm tra HS'],
    ...FB.LABELS.map((l, i) => ['c' + i, s.counts[i], l])];
  if (s.deep) items.push(['dok', s.deep.ok, `Đủ nông hộ, lô (/${s.deep.checked})`], ['', s.deep.farmers, 'Nông hộ'], ['', s.deep.plots, 'Lô'],
    ...FB.DEEP.map(([k, l], i) => ['cd:' + k, s.deep.units[i], `${l} (${s.deep.totals[i]})`]));
  $('kpis').innerHTML = items.map(([k, v, l]) => `<div class="kpi" data-k="${k}"><b>${v}</b><span>${esc(l)}</span></div>`).join('');
  $('kpis').querySelectorAll('.kpi').forEach(el => el.onclick = () => {
    const k = el.dataset.k;
    $('fCrit').value = k.startsWith('cd:') ? 'd:' + k.slice(3) : k.startsWith('c') ? k.slice(1) : '';
    $('fState').value = k === 'complete' || k === 'unchecked' ? k : '';
    $('fDeep').value = k === 'dok' ? 'ok' : '';
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
['q', 'fProv', 'fCrit', 'fState', 'fBvi', 'fDeep'].forEach(id => $(id).addEventListener('input', onFilter));
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
  if (ch.latest || ch.history) load();
  if (ch.status) { const s = ch.status.newValue || {}; $('prog').textContent = s.running ? 'Đang kiểm tra' + (s.progress ? ` nông hộ, lô: ${s.progress.done}/${s.progress.total} vùng` : '…') : ''; }
});
load();
