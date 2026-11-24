importScripts('lib.js');

const ADMIN_URL = 'https://admin.farmbase.vn/dashboard';
const ALARM = 'fb-auto-check';
const DEFAULT_SCOPE = { statuses: ['ACTIVE', 'PENDING'], vendors: [], vendorNames: [], deep: true };
const DEFAULTS = { freq: 'daily', weekday: 1, time: '07:00', autoDownload: false, notify: true, scope: DEFAULT_SCOPE };
const HISTORY_MAX = 90;

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  const s = { ...DEFAULTS, ...(settings || {}) };
  s.scope = { ...DEFAULT_SCOPE, ...(s.scope || {}) };
  return s;
}

function nextRunTime(s) {
  const [h, m] = s.time.split(':').map(Number);
  const now = new Date(), d = new Date();
  d.setHours(h, m, 0, 0);
  if (s.freq === 'weekly') {
    d.setDate(d.getDate() + ((Number(s.weekday) - d.getDay() + 7) % 7));
    if (d <= now) d.setDate(d.getDate() + 7);
  } else if (d <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

async function schedule() {
  const s = await getSettings();
  await chrome.alarms.clear(ALARM);
  if (s.freq === 'off') return null;
  const when = nextRunTime(s);
  await chrome.alarms.create(ALARM, { when, periodInMinutes: s.freq === 'weekly' ? 7 * 24 * 60 : 24 * 60 });
  return when;
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(async () => {
  if (!(await chrome.alarms.get(ALARM))) await schedule();
});
chrome.alarms.onAlarm.addListener(a => { if (a.name === ALARM) runCheck('auto'); });

function waitForLoad(tabId, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { chrome.tabs.onUpdated.removeListener(fn); reject(new Error('Trang admin tải quá lâu')); }, timeoutMs);
    function fn(id, info) {
      if (id === tabId && info.status === 'complete') { clearTimeout(t); chrome.tabs.onUpdated.removeListener(fn); resolve(); }
    }
    chrome.tabs.onUpdated.addListener(fn);
  });
}

async function inAdminTab(method, arg) {
  // Mở một tab nền mới mỗi lần để tránh tab cũ bị Chrome "ngủ" (discarded); đóng lại sau khi xong.
  const tab = await chrome.tabs.create({ url: ADMIN_URL, active: false });
  try {
    await waitForLoad(tab.id);
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['check.js'] });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [method, arg ?? null],
      func: async (m, a) => {
        try { return { ok: true, data: await window.FBCheck[m](a || undefined) }; }
        catch (e) { return { ok: false, error: String(e?.message || e) }; }
      },
    });
    if (!result?.ok) throw new Error(result?.error || 'Không chạy được kiểm tra');
    return result.data;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

let running = null;
function runCheck(source) {
  if (!running) running = doRun(source).finally(() => { running = null; });
  return running;
}

async function doRun(source) {
  const s = await getSettings();
  await chrome.storage.local.set({ status: { running: true, since: new Date().toISOString() } });
  try {
    const data = await inAdminTab('collect', s.scope);
    const summary = FB.summarize(data.rows);
    const { latest, history = [] } = await chrome.storage.local.get(['latest', 'history']);

    // So sánh với lần trước: vùng mới đủ hồ sơ / vùng thiếu nhiều hơn
    let changes = null;
    if (latest?.rows) {
      const prev = new Map(latest.rows.map(r => [r.id, r]));
      changes = {
        improved: data.rows.filter(r => prev.has(r.id) && r.missing < prev.get(r.id).missing).map(r => ({ name: r.name, from: prev.get(r.id).missing, to: r.missing })),
        worse: data.rows.filter(r => prev.has(r.id) && r.missing > prev.get(r.id).missing).map(r => ({ name: r.name, from: prev.get(r.id).missing, to: r.missing })),
        added: data.rows.filter(r => !prev.has(r.id)).map(r => r.name),
      };
    }

    const entry = { ranAt: data.ranAt, source, scope: data.scope, ...summary };
    await chrome.storage.local.set({
      latest: { ...data, summary, changes },
      previousSummary: latest?.summary || null,
      history: [entry, ...history].slice(0, HISTORY_MAX),
      status: { running: false, lastOk: data.ranAt, lastError: null },
    });

    if (s.autoDownload) await downloadCSV(data);
    if (s.notify) {
      const top = FB.LABELS.map((l, i) => [l, summary.counts[i]]).sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([l, c]) => `${l}: ${c}`).join(' · ');
      chrome.notifications.create('fb-done-' + Date.now(), {
        type: 'basic', iconUrl: 'icon128.png',
        title: `Hồ sơ vùng trồng: ${summary.complete}/${summary.total} vùng đủ`,
        message: top + (summary.deep ? `\nNông hộ, lô: ${summary.deep.ok}/${summary.deep.checked} vùng đủ` : '') + (changes ? `\n${changes.improved.length} vùng cải thiện, ${changes.worse.length} vùng thiếu thêm` : ''),
      });
    }
    return { ok: true, summary };
  } catch (e) {
    const msg = String(e?.message || e);
    await chrome.storage.local.set({ status: { running: false, lastError: msg, lastErrorAt: new Date().toISOString() } });
    chrome.notifications.create('fb-err-' + Date.now(), {
      type: 'basic', iconUrl: 'icon128.png', title: 'Không tổng hợp được hồ sơ vùng trồng',
      message: msg.startsWith('AUTH:') ? 'Hãy đăng nhập lại admin.farmbase.vn trên Chrome, rồi bấm "Chạy ngay".' : msg,
    });
    return { ok: false, error: msg };
  }
}

async function downloadCSV(data) {
  if (!data) ({ latest: data } = await chrome.storage.local.get('latest'));
  if (!data) return { ok: false, error: 'Chưa có dữ liệu' };
  const url = 'data:text/csv;charset=utf-8,' + encodeURIComponent(FB.toCSV(data.rows));
  await chrome.downloads.download({ url, filename: `FarmBase/ho-so-vung-trong_${FB.dateStamp(data.ranAt)}.csv`, conflictAction: 'uniquify' });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    if (msg.type === 'runNow') return runCheck('manual');
    if (msg.type === 'progress') {
      const { status } = await chrome.storage.local.get('status');
      if (status?.running) await chrome.storage.local.set({ status: { ...status, progress: { done: msg.done, total: msg.total } } });
      return { ok: true };
    }
    if (msg.type === 'loadVendors') {
      try { const list = await inAdminTab('vendors'); await chrome.storage.local.set({ vendors: { at: new Date().toISOString(), list } }); return { ok: true, list }; }
      catch (e) { return { ok: false, error: String(e?.message || e) }; }
    }
    if (msg.type === 'getSettings') return getSettings();
    if (msg.type === 'downloadCSV') return downloadCSV();
    if (msg.type === 'saveSettings') {
      await chrome.storage.local.set({ settings: { ...(await getSettings()), ...msg.settings } });
      return { ok: true, next: await schedule() };
    }
    if (msg.type === 'getNext') { const a = await chrome.alarms.get(ALARM); return { next: a?.scheduledTime || null }; }
    if (msg.type === 'openReport') { await chrome.tabs.create({ url: chrome.runtime.getURL('report.html') }); return { ok: true }; }
  })().then(reply, e => reply({ ok: false, error: String(e) }));
  return true;
});
