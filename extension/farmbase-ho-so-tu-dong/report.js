const $ = id => document.getElementById(id);
let DATA = null;
let SYNC = { map: {}, last: null };
let PICK = new Set();
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
  const prov = $('fProv').value, ven = $('fVendor').value, crit = $('fCrit').value, st = $('fState').value, bv = $('fBvi').value;
  return DATA.rows.filter(r =>
    (!q || [r.name, r.code, r.vendor, r.ward].join(' ').toLowerCase().includes(q)) &&
    (!prov || r.province === prov) && (!ven || r.vendor === ven) &&
    (crit === '' || r.flags[Number(crit)] === 1) &&
    (!bv || FB.bviState(r, SYNC.map) === bv) &&
    (!st || (st === 'missing' && r.missing > 0) || (st === 'complete' && r.flags.every(f => f === 0)) || (st === 'unchecked' && !r.checkedAt)));
}

function renderTable() {
  const rows = filtered();
  $('count').textContent = `${rows.length} vùng`;
  const head = `<tr><th><input type="checkbox" id="pickAll" title="Chọn tất cả vùng đang lọc"></th><th>#</th><th>Tên vùng trồng</th><th>Doanh nghiệp</th><th>Tỉnh / Xã</th><th>Ngày KT</th><th>Thiếu</th><th>BVI</th>${FB.SHORT.map((l, i) => `<th class="c" title="${esc(FB.LABELS[i])}">${esc(l)}</th>`).join('')}</tr>`;
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
    <td>${r.checkedAt ? r.checkedAt.slice(0, 10) : '<span class="fn">Chưa kiểm tra</span>'}</td>
    <td class="miss">${r.missing}</td>
    <td class="bv">${bvCell(r)}</td>
    ${r.flags.map(f => `<td class="c">${cell(f)}</td>`).join('')}
  </tr>`).join('');
  $('tbl').querySelectorAll('[data-pick]').forEach(c => c.onchange = () => { c.checked ? PICK.add(c.dataset.pick) : PICK.delete(c.dataset.pick); renderBvi(); });
  const all = $('pickAll');
  if (all) { all.checked = rows.length > 0 && rows.every(r => PICK.has(r.id)); all.onchange = () => { rows.forEach(r => all.checked ? PICK.add(r.id) : PICK.delete(r.id)); renderTable(); renderBvi(); }; }
}

// ---------- Đồng bộ một chiều sang BVI Điều hành ----------
const needSend = r => !['ok', 'old'].includes(FB.bviState(r, SYNC.map));
function renderBvi(extra) {
  chrome.storage.local.get('bvi').then(({ bvi }) => {
    const has = !!bvi?.key;
    $('bviNoKey').hidden = has; $('bviHasKey').hidden = !has;
    if (has) $('bviPfx').textContent = bvi.key.slice(0, 10) + '…';
    $('bviGo').disabled = SENDING || !DATA || !PICK.size;
    $('bviGo').textContent = SENDING ? 'Đang gửi…' : `Đồng bộ lên BVI (${PICK.size} vùng)`;
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
  SENDING = true; renderBvi();
  const rows = DATA.rows.filter(r => PICK.has(r.id));
  const map = { ...SYNC.map }, counts = { updated: 0, same: 0, old: 0, unmatched: 0, invalid: 0 };
  let error = null, sent = 0;
  try {
    for (let i = 0; i < rows.length; i += 1000) {
      const part = rows.slice(i, i + 1000);
      // chỉ gửi tên, mã, địa bàn, tên doanh nghiệp, ngày kiểm tra và cờ đủ/thiếu
      const payload = { ranAt: DATA.ranAt, criteria: FB.LABELS, rows: part.map(r => ({ id: r.id, code: r.code, name: r.name, province: r.province, ward: r.ward, vendor: r.vendor, checkedAt: r.checkedAt, flags: r.flags })) };
      const res = await fetch(FB.BVI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': bvi.key }, body: JSON.stringify(payload) });
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
  if (!error) PICK = new Set(DATA.rows.filter(needSend).map(r => r.id));
  renderTable(); renderBvi(); renderSyncHist([last, ...bviHist]);
}
function renderSyncHist(list) {
  $('shist').innerHTML = '<tr><th>Thời điểm</th><th>Dữ liệu lấy lúc</th><th>Gửi</th><th>Cập nhật</th><th>Giữ nguyên</th><th>Chưa ghép</th><th>Kết quả</th></tr>' +
    (list || []).map(h => `<tr><td>${FB.fmtTime(h.at)}</td><td>${FB.fmtTime(h.ranAt)}</td><td>${h.sent}</td><td>${h.counts.updated || 0}</td><td>${h.counts.same || 0}</td><td>${h.counts.unmatched || 0}</td><td>${h.error ? '<span class="b b-err">' + esc(h.error) + '</span>' : '<span class="b b-ok">Xong</span>'}</td></tr>`).join('');
}

function renderKpis() {
  const s = DATA.summary;
  const items = [['', s.total, 'Vùng trồng'], ['complete', s.complete, 'Đủ 12 mục'], ['unchecked', s.unchecked, 'Chưa kiểm tra HS'],
    ...FB.LABELS.map((l, i) => ['c' + i, s.counts[i], l])];
  $('kpis').innerHTML = items.map(([k, v, l]) => `<div class="kpi" data-k="${k}"><b>${v}</b><span>${esc(l)}</span></div>`).join('');
  $('kpis').querySelectorAll('.kpi').forEach(el => el.onclick = () => {
    const k = el.dataset.k;
    $('fCrit').value = k.startsWith('c') ? k.slice(1) : '';
    $('fState').value = k === 'complete' || k === 'unchecked' ? k : '';
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
  SYNC = bviSync || { map: {}, last: null };
  renderSyncHist(bviHist);
  if (DATA && DATA.ranAt !== prevRan) PICK = new Set(DATA.rows.filter(needSend).map(r => r.id));
  renderBvi();
  if (!DATA) { $('ran').textContent = 'Chưa có dữ liệu — bấm "Chạy lại ngay".'; $('tbl').innerHTML = ''; renderHistory(history); return; }
  $('ran').textContent = 'Cập nhật: ' + FB.fmtTime(DATA.ranAt);
  fillSelect($('fProv'), [...new Set(DATA.rows.map(r => r.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')));
  fillSelect($('fVendor'), [...new Set(DATA.rows.map(r => r.vendor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')));
  if ($('fBvi').length === 1) Object.entries(FB.BVI_ST).filter(([k]) => k !== 'invalid').forEach(([k, [l]]) => { const o = document.createElement('option'); o.value = k; o.textContent = l; $('fBvi').appendChild(o); });
  if ($('fCrit').length === 1) FB.LABELS.forEach((l, i) => { const o = document.createElement('option'); o.value = i; o.textContent = l; $('fCrit').appendChild(o); });
  renderKpis(); renderTable(); renderHistory(history);
}

$('bviSave').onclick = async () => {
  const k = $('bviKey').value.trim();
  if (!/^bvi_[A-Za-z0-9]{40}$/.test(k)) { renderBvi('<span class="err">Khóa không đúng dạng bvi_… (44 ký tự)</span>'); return; }
  await chrome.storage.local.set({ bvi: { key: k } }); $('bviKey').value = ''; renderBvi('<span class="ok">Đã lưu khóa trên máy này.</span>');
};
$('bviDel').onclick = async () => { await chrome.storage.local.remove('bvi'); renderBvi('Đã xóa khóa khỏi extension.'); };
$('bviPick').onclick = () => { if (!DATA) return; PICK = new Set(DATA.rows.filter(needSend).map(r => r.id)); renderTable(); renderBvi(); };
$('bviNone').onclick = () => { PICK = new Set(); renderTable(); renderBvi(); };
$('bviGo').onclick = bviSend;
['q', 'fProv', 'fVendor', 'fCrit', 'fState', 'fBvi'].forEach(id => $(id).addEventListener('input', renderTable));
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
chrome.storage.onChanged.addListener(ch => { if (ch.latest || ch.history) load(); });
load();
