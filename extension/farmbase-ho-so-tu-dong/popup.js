const $ = id => document.getElementById(id);
const send = msg => chrome.runtime.sendMessage(msg);

async function render() {
  const { latest, previousSummary, status, settings } = await chrome.storage.local.get(['latest', 'previousSummary', 'status', 'settings']);
  const s = latest?.summary;
  if (latest) $('last').textContent = 'Lần chạy gần nhất: ' + FB.fmtTime(latest.ranAt);
  if (status?.running) $('last').textContent = 'Đang kiểm tra…';
  $('k-total').textContent = s ? s.total : '—';
  $('k-complete').textContent = s ? s.complete : '—';
  $('k-unchecked').textContent = s ? s.unchecked : '—';

  $('err').innerHTML = '';
  if (status?.lastError) {
    const d = document.createElement('div');
    d.className = 'err';
    d.textContent = (status.lastError.startsWith('AUTH:') ? 'Phiên đăng nhập admin đã hết hạn, hãy đăng nhập lại rồi bấm "Chạy ngay".' : 'Lỗi: ' + status.lastError)
      + ' (' + FB.fmtTime(status.lastErrorAt) + ')';
    $('err').appendChild(d);
  }

  const t = $('crit');
  t.innerHTML = '';
  if (s) {
    FB.LABELS.forEach((label, i) => {
      const c = s.counts[i], p = previousSummary?.counts?.[i];
      const tr = document.createElement('tr');
      const delta = p == null ? '' : c > p ? `<span class="up">▲${c - p}</span>` : c < p ? `<span class="down">▼${p - c}</span>` : '<span class="same">=</span>';
      const pct = s.total ? Math.round(c / s.total * 100) : 0;
      tr.innerHTML = `<td>${label}<div class="bar"><i style="width:${pct}%"></i></div></td><td class="n">${c}</td><td class="d">${delta}</td>`;
      t.appendChild(tr);
    });
  } else t.innerHTML = '<tr><td class="muted">Bấm "Chạy ngay" để tổng hợp lần đầu.</td></tr>';

  const ch = latest?.changes;
  $('changes').textContent = ch ? `So với lần trước: ${ch.improved.length} vùng bổ sung thêm hồ sơ, ${ch.worse.length} vùng thiếu thêm, ${ch.added.length} vùng mới.` : '';

  const st = { freq: 'daily', weekday: 1, time: '07:00', autoDownload: false, notify: true, ...(settings || {}) };
  $('freq').value = st.freq; $('weekday').value = String(st.weekday); $('time').value = st.time;
  $('notify').checked = st.notify; $('autoDownload').checked = st.autoDownload;
  $('wd-row').style.display = st.freq === 'weekly' ? '' : 'none';
  const { next } = await send({ type: 'getNext' });
  $('next').textContent = next ? 'Lần chạy tự động tiếp theo: ' + FB.fmtTime(new Date(next).toISOString()) : 'Lịch tự động đang tắt.';
}

$('freq').onchange = () => { $('wd-row').style.display = $('freq').value === 'weekly' ? '' : 'none'; };
$('run').onclick = async () => {
  $('run').disabled = true; $('run').textContent = 'Đang chạy…';
  await send({ type: 'runNow' });
  $('run').disabled = false; $('run').textContent = 'Chạy ngay';
  render();
};
$('report').onclick = () => send({ type: 'openReport' });
$('csv').onclick = () => send({ type: 'downloadCSV' });
$('save').onclick = async () => {
  await send({ type: 'saveSettings', settings: {
    freq: $('freq').value, weekday: Number($('weekday').value), time: $('time').value || '07:00',
    notify: $('notify').checked, autoDownload: $('autoDownload').checked,
  } });
  $('save').textContent = 'Đã lưu ✓'; setTimeout(() => { $('save').textContent = 'Lưu lịch'; }, 1500);
  render();
};
render();
