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

  function summarize(rows) {
    return {
      total: rows.length,
      complete: rows.filter(r => r.missing === 0 && r.flags.every(f => f === 0)).length,
      unchecked: rows.filter(r => !r.checkedAt).length,
      counts: LABELS.map((_, i) => rows.filter(r => r.flags[i] === 1).length),
    };
  }

  function toCSV(rows) {
    const head = ['Tên vùng trồng', 'Mã', 'Cây trồng', 'Tỉnh', 'Xã/Phường', 'Doanh nghiệp', 'Ngày kiểm tra hồ sơ', 'Số mục thiếu', ...LABELS, 'ID'];
    const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    const lines = rows.map(r => [
      r.name, r.code, r.crop, r.province, r.ward, r.vendor,
      r.checkedAt ? r.checkedAt.slice(0, 10) : 'Chưa kiểm tra', r.missing, ...r.flags.map(f => FLAG_TEXT[f]), r.id,
    ].map(esc).join(','));
    return '﻿' + [head.map(esc).join(','), ...lines].join('\r\n');
  }

  const fmtTime = iso => iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const dateStamp = iso => { const d = new Date(iso); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };

  // Đồng bộ một chiều sang BVI Điều hành (chỉ owner có khóa)
  const BVI_URL = 'https://pkckduidwfcncipwzdxa.supabase.co/functions/v1/api/v1/farmbase-sync';
  const sig = r => (r.checkedAt || '') + '|' + r.flags.join(',');
  const BVI_ST = {
    none: ['Chưa gửi', 'b-none'], changed: ['Có thay đổi, chưa gửi', 'b-chg'], ok: ['Đã khớp', 'b-ok'],
    unmatched: ['Chưa ghép vùng trên BVI', 'b-um'], old: ['BVI có bản mới hơn', 'b-um'], error: ['Lỗi khi gửi', 'b-err'], invalid: ['Dữ liệu không hợp lệ', 'b-err'],
  };
  function bviState(r, map) {
    const st = map?.[r.id];
    if (!st) return 'none';
    if (st.status === 'updated' || st.status === 'same') return st.sig === sig(r) ? 'ok' : 'changed';
    if (st.status === 'unmatched') return 'unmatched';
    return BVI_ST[st.status] ? st.status : 'error';
  }

  return { LABELS, SHORT, FLAG_TEXT, summarize, toCSV, fmtTime, dateStamp, BVI_URL, BVI_ST, sig, bviState };
})();
if (typeof self !== 'undefined') self.FB = FB;
