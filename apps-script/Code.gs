/**
 * BVI Điều hành ↔ Google Drive
 * Chạy bằng tài khoản chủ thư mục Drive. Chỉ làm việc bên trong thư mục gốc ROOT.
 * Không đọc, không trả về tên file: chỉ tải lên, đếm số file, đổi tên thư mục vùng, tạo thư mục còn thiếu.
 * Mã bí mật lưu trong Project Settings > Script Properties, khóa TOKEN.
 */
var ROOT = 'ID_THU_MUC_GOC_TREN_DRIVE'; // thay bằng ID thư mục gốc thật khi dán vào Apps Script

var TREE = [
  ['hs01', '01_Bộ hồ sơ mã vùng trồng', [['hs01_ky', '01_Bản xuất để ký'], ['hs01_scan', '02_Bản scan đã ký'], ['hs01_anh', '03_Ảnh bản cứng đã ký']]],
  ['tq', '02_Hồ sơ nộp Trung Quốc', [['tq_ky', '01_Bản xuất để ký'], ['tq_scan', '02_Bản scan đã ký'], ['tq_anh', '03_Ảnh bản cứng đã ký']]],
  ['cccd', '03_Hồ sơ CCCD', []],
  ['sodo', '04_Hồ sơ sổ đỏ', []],
  ['img', '05_Hình ảnh thực tế', [['fly', '01_Flycam'], ['kho', '02_Kho thuốc, thùng thuốc'], ['bay', '03_Bẫy côn trùng'], ['thu', '04_Thu hoạch sầu riêng']]]
];

function doPost(e) {
  var b;
  try { b = JSON.parse(e.postData.contents); } catch (x) { return out({ error: 'bad_json' }); }
  var tok = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!tok || b.token !== tok) return out({ error: 'bad_token' });
  try {
    if (b.action === 'ping') return out({ ok: true });
    if (b.action === 'upload') return out(upload(b));
    if (b.action === 'stats') return out(stats(b));
    if (b.action === 'rename') return out(rename(b));
    if (b.action === 'ensure') return out(ensure(b));
    return out({ error: 'unknown_action' });
  } catch (x) {
    return out({ error: String(x && x.message || x) });
  }
}
function doGet() { return out({ ok: true, hint: 'POST only' }); }

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// Thư mục phải nằm trong ROOT (tối đa 6 cấp), để cầu nối không chạm chỗ khác trên Drive.
function inside(folder) {
  var f = folder;
  for (var i = 0; i < 6; i++) {
    var ps = f.getParents();
    if (!ps.hasNext()) return false;
    f = ps.next();
    if (f.getId() === ROOT) return true;
  }
  return false;
}
function folderIn(id) {
  var f = DriveApp.getFolderById(id);
  if (!inside(f)) throw new Error('outside_root');
  return f;
}

function upload(b) {
  var f = folderIn(b.folderId);
  var blob = Utilities.newBlob(Utilities.base64Decode(b.data), b.mime || 'application/octet-stream', b.name || 'file');
  var file = f.createFile(blob);
  return { ok: true, id: file.getId(), url: file.getUrl() };
}

function stats(b) {
  var counts = {};
  (b.ids || []).slice(0, 800).forEach(function (id) {
    try {
      counts[id] = countDeep(folderIn(id), 0, 0);
    } catch (x) { counts[id] = -1; }
  });
  return { ok: true, counts: counts, deep: true };
}

// Đếm file trong thư mục và các thư mục con (ví dụ 04 Sổ đỏ > tên hộ > Lô 1), sâu tối đa 3 tầng, tối đa 999.
function countDeep(f, depth, n) {
  var it = f.getFiles();
  while (it.hasNext() && n < 999) { var x = it.next(); if (!x.isTrashed()) n++; }
  if (depth < 3) { var sub = f.getFolders(); while (sub.hasNext() && n < 999) { var d = sub.next(); if (!d.isTrashed()) n = countDeep(d, depth + 1, n); } }
  return n;
}

// Giữ tiền tố mã (ví dụ Z002_) và thay phần tên theo tên vùng mới trên web.
function rename(b) {
  var f = folderIn(b.folderId);
  var m = f.getName().match(/^([A-Za-z0-9-]+)_/);
  var short = String(b.name).replace(/^v[uù]ng\s+tr[oồ]ng\s+s[aầ]u\s+ri[eê]ng\s*/i, '').trim() || b.name;
  var name = (m ? m[1] + '_' : '') + short;
  if (f.getName() !== name) f.setName(name);
  return { ok: true, name: name };
}

// Tạo cây thư mục cho vùng mới, hoặc bổ sung thư mục còn thiếu. Không xóa, không di chuyển gì.
function ensure(b) {
  var have = b.have || {}, drv = {};
  var root = null;
  if (have.root) { try { root = folderIn(have.root); } catch (x) { root = null; } }
  if (!root) {
    var top = DriveApp.getFolderById(ROOT);
    root = top.createFolder((b.code ? b.code + '_' : '') + String(b.name).replace(/^v[uù]ng\s+tr[oồ]ng\s+s[aầ]u\s+ri[eê]ng\s*/i, '').trim());
  }
  drv.root = root.getId();
  TREE.forEach(function (g) {
    var gf = child(root, g[1], have[g[0]]);
    drv[g[0]] = gf.getId();
    g[2].forEach(function (s) { drv[s[0]] = child(gf, s[1], have[s[0]]).getId(); });
  });
  return { ok: true, drv: drv };
}
function child(parent, name, id) {
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (x) {} }
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}
