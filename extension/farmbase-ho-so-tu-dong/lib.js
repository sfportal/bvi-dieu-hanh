// Dùng chung cho background, popup, báo cáo.
const FB = (() => {
  const LABELS = [
    'Thiếu địa chỉ', 'Thiếu thị trường', 'Thiếu tiêu chuẩn áp dụng', 'Chưa chọn nông dân đại diện',
    'Thiếu ảnh bảng tên vùng trồng', 'Thiếu ảnh flycam', 'Thiếu ảnh kho thuốc', 'Thiếu ảnh quy trình thu hoạch',
    'Thiếu ảnh bẫy côn trùng', 'DN thiếu CCCD mặt trước', 'DN thiếu CCCD mặt sau', 'DN thiếu giấy phép kinh doanh',
  ];
  const SHORT = ['Địa chỉ', 'Thị trường', 'Tiêu chuẩn', 'ND đại diện', 'Ảnh bảng tên', 'Ảnh flycam', 'Ảnh kho thuốc',
    'Ảnh thu hoạch', 'Ảnh bẫy côn trùng', 'DN: CCCD trước', 'DN: CCCD sau', 'DN: GPKD'];
  const FLAG_TEXT = { 1: 'Thiếu', 0: 'Đủ', '-1': 'Chưa kiểm tra' };
  const STATUS = { ACTIVE: 'Đang hoạt động', PENDING: 'Chờ duyệt', INACTIVE: 'Đã ngừng' };
  // Kiểm tra nông hộ và lô: [khóa, nhãn, nhãn ngắn]
  const DEEP = [
    ['fNoId', 'Nông hộ thiếu số CCCD', 'NH: số CCCD'], ['fNoImg', 'Nông hộ thiếu ảnh CCCD', 'NH: ảnh CCCD'],
    ['pNoImg', 'Lô thiếu ảnh bìa sổ đỏ', 'Lô: ảnh bìa'], ['pNoPage', 'Lô thiếu số tờ bản đồ', 'Lô: số tờ'], ['pNoPlot', 'Lô thiếu số thửa', 'Lô: số thửa'],
    ['pNoTrees', 'Lô thiếu số cây', 'Lô: số cây'], ['pNoArea', 'Lô thiếu diện tích', 'Lô: diện tích'], ['pZero', 'Lô diện tích bằng 0', 'Lô: DT = 0'], ['dup', 'Trùng tờ, thửa trong vùng', 'Trùng thửa'],
  ];
  // Doanh nghiệp mặc định (so khớp theo tên, không dấu)
  const DEFAULT_VENDOR_KEYS = ['song toan phat', 'quyet tien', 'diep minh anh', 'yanning', '37', 'green', 'hong thuan', 'mai anh tuan'];
  const nv = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const vendorMatch = (name, keys = DEFAULT_VENDOR_KEYS) => { const n = ' ' + nv(name).replace(/[^a-z0-9]+/g, ' ') + ' '; return keys.some(k => /^\d+$/.test(k) ? n.includes(' ' + k + ' ') : n.includes(nv(k))); };
  const deepOk = r => r.deep && !r.deep.error && r.deep.sum.issues === 0;

  function summarize(rows) {
    return {
      total: rows.length,
      complete: rows.filter(r => r.missing === 0 && r.flags.every(f => f === 0)).length,
      unchecked: rows.filter(r => !r.checkedAt).length,
      counts: LABELS.map((_, i) => rows.filter(r => r.flags[i] === 1).length),
      deep: rows.some(r => r.deep) ? {
        checked: rows.filter(r => r.deep && !r.deep.error).length, ok: rows.filter(deepOk).length, error: rows.filter(r => r.deep?.error).length,
        farmers: rows.reduce((n, r) => n + (r.deep?.sum?.f || 0), 0), plots: rows.reduce((n, r) => n + (r.deep?.sum?.p || 0), 0),
        units: DEEP.map(([k]) => rows.filter(r => (r.deep?.sum?.[k] || 0) > 0).length),
        totals: DEEP.map(([k]) => rows.reduce((n, r) => n + (r.deep?.sum?.[k] || 0), 0)),
      } : null,
    };
  }

  function toCSV(rows) {
    const head = ['Tên vùng trồng', 'Mã', 'Trạng thái', 'Cây trồng', 'Tỉnh', 'Xã/Phường', 'Doanh nghiệp', 'Ngày kiểm tra hồ sơ', 'Số mục thiếu', ...LABELS, 'Số nông hộ', 'Số lô', ...DEEP.map(d => d[1]), 'ID'];
    const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    const lines = rows.map(r => [
      r.name, r.code, STATUS[r.status] || r.status || '', r.crop, r.province, r.ward, r.vendor,
      r.checkedAt ? r.checkedAt.slice(0, 10) : 'Chưa kiểm tra', r.missing, ...r.flags.map(f => FLAG_TEXT[f]),
      r.deep?.sum ? r.deep.sum.f : '', r.deep?.sum ? r.deep.sum.p : '', ...DEEP.map(([k]) => r.deep?.sum ? r.deep.sum[k] : (r.deep?.error ? 'Lỗi' : '')), r.id,
    ].map(esc).join(','));
    return '﻿' + [head.map(esc).join(','), ...lines].join('\r\n');
  }

  const fmtTime = iso => iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const dateStamp = iso => { const d = new Date(iso); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };

  // Đồng bộ một chiều sang BVI Điều hành (chỉ owner có khóa)
  const BVI_URL = 'https://pkckduidwfcncipwzdxa.supabase.co/functions/v1/api/v1'; // địa chỉ gốc API, owner sửa được trong cài đặt
  const sig = r => (r.checkedAt || '') + '|' + r.flags.join(',') + '|' + (r.status || '') + '|' + (r.deep?.sum ? DEEP.map(([k]) => r.deep.sum[k]).join(',') + ',' + r.deep.sum.f + ',' + r.deep.sum.p : '');
  const BVI_ST = {
    none: ['Chưa gửi', 'b-none'], changed: ['Có thay đổi, chưa gửi', 'b-chg'], ok: ['Đã gửi, khớp', 'b-ok'],
    unmatched: ['Chưa ghép vùng trên BVI', 'b-um'], old: ['BVI có bản mới hơn', 'b-um'], error: ['Lỗi khi gửi', 'b-err'], invalid: ['Dữ liệu không hợp lệ', 'b-err'],
  };
  function bviState(r, map) {
    const st = map?.[r.id];
    if (!st) return 'none';
    if (st.status === 'updated' || st.status === 'same') return st.sig === sig(r) ? 'ok' : 'changed';
    if (st.status === 'unmatched') return 'unmatched';
    return BVI_ST[st.status] ? st.status : 'error';
  }

  return { LABELS, SHORT, FLAG_TEXT, STATUS, DEEP, DEFAULT_VENDOR_KEYS, vendorMatch, deepOk, summarize, toCSV, fmtTime, dateStamp, BVI_URL, BVI_ST, sig, bviState };
})();
if (typeof self !== 'undefined') self.FB = FB;
