// Logic dùng chung cho trang sales (sales.html) và dashboard Sales (index.html). Không phụ thuộc DOM.
(function (root) {
  const STAGES = [[0, "Cần tìm liên hệ"], [1, "Mới"], [2, "Đã liên hệ"], [3, "Đang tư vấn"], [4, "Đã báo giá"], [5, "Thương lượng"], [6, "Đã ký"], [7, "Không theo"]];
  const TEMPS = [["cold", "Lạnh"], ["warm", "Ấm"], ["hot", "Nóng"]];
  // độ ưu tiên: lưu A/B/C trong cột priority, hiện High/Normal/Low
  const PRIOS = [["A", "High"], ["B", "Normal"], ["C", "Low"]];
  const PRIO_CLS = { A: "hot", B: "warm", C: "cold" };
  function prioOf(l) {
    const v = String((l && l.priority) || "").trim().toLowerCase();
    return v === "a" || v === "high" ? "A" : v === "b" || v === "normal" ? "B" : v === "c" || v === "low" ? "C" : "";
  }
  const FITS = [["low", "Thấp"], ["mid", "Vừa"], ["high", "Cao"]];
  const CHANNELS = [["call", "Gọi"], ["zalo", "Zalo"], ["meet", "Gặp"], ["email", "Email"], ["search", "Tìm thông tin"], ["other", "Khác"]];
  const RESULTS = [["noans", "Không nghe"], ["later", "Hẹn lại"], ["talked", "Đã nói chuyện"], ["interested", "Quan tâm"], ["sent", "Đã gửi tài liệu"], ["refused", "Từ chối"], ["unreach", "Không liên hệ được"], ["wrong", "Sai số, sai người"], ["nofind", "Chưa tìm được liên hệ"]];
  const NOREACH = ["noans", "unreach", "wrong", "nofind"];
  // trạng thái liên hệ của lead, theo kết quả lần chạm gần nhất
  const CONTACT_STATES = [["none", "Chưa liên hệ"], ["noans", "Không nghe máy"], ["unreach", "Không liên hệ được"], ["wrong", "Sai số, sai người"], ["nofind", "Chưa tìm được liên hệ"], ["reached", "Đã liên hệ được"], ["refused", "Từ chối"]];
  const contactState = l => { const r = l && l.last_result; return !r ? "none" : (NOREACH.includes(r) || r === "refused") ? r : "reached"; };
  const NEEDS = [["msvt", "MSVT"], ["csdg", "CSĐG"], ["txng", "Truy xuất"], ["qr", "Tem QR"], ["kt", "Kỹ thuật"], ["khac", "Khác"]];
  const LOST = ["Giá", "Chưa cần", "Đã có đơn vị khác", "Không liên lạc được", "Khác"];
  const NEXT = [["call", "Gọi lại"], ["quote", "Gửi báo giá"], ["meet", "Hẹn gặp"], ["send", "Gửi tài liệu"], ["other", "Khác"]];
  const HOT_DAYS = 2, WARM_DAYS = 7, FRESH_HOURS = 24, CALL_GOAL = 20;
  const D = 864e5;

  function normPhones(s) {
    if (!s) return [];
    const out = [];
    String(s).split(/[,;/]|[A-Za-zÀ-ỹ]+/).forEach(t => {
      let d = t.replace(/\D/g, "");
      if (/^84\d{9,10}$/.test(d)) d = "0" + d.slice(2);
      if (d.length >= 9 && d.length <= 11 && !out.includes(d)) out.push(d);
    });
    return out;
  }
  function vnToday(now) {
    const t = new Date((now ? +now : Date.now()) + 7 * 36e5);
    return t.toISOString().slice(0, 10);
  }
  function addDays(ymd, n) { const t = new Date(ymd + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function nextPreset(k, today) { return addDays(today, { "1d": 1, "3d": 3, "1w": 7 }[k] || 0); }
  const open = l => l.stage >= 1 && l.stage <= 5;
  const since = (ts, now) => ts ? (+now - Date.parse(ts)) : Infinity;

  // Nhóm việc cho màn Hôm nay. uid=null: xem mọi lead (quản lý, nhân viên xem toàn đội).
  function buckets(leads, uid, now) {
    now = now || new Date();
    const td = vnToday(now), B = { overdue: [], today: [], hot: [], fresh: [], nonext: [] };
    (leads || []).forEach(l => {
      if (!open(l) || (uid && l.owner_id !== uid)) return;
      if (l.next_at && l.next_at < td) return B.overdue.push(l);
      if (l.next_at === td) return B.today.push(l);
      const idle = since(l.last_touch_at, now);
      const pr = prioOf(l);
      if (l.last_touch_at && ((pr === "A" && idle > HOT_DAYS * D) || (pr === "B" && idle > WARM_DAYS * D))) return B.hot.push(l);
      if (!l.last_touch_at && l.owner_id && since(l.assigned_at, now) > FRESH_HOURS * 36e5) return B.fresh.push(l);
      if (!l.next_at) return B.nonext.push(l);
    });
    B.overdue.sort((a, b) => a.next_at.localeCompare(b.next_at));
    return B;
  }

  // Dự đoán thay đổi của lead sau một lần tương tác (cùng quy tắc trigger sales_acts_ai)
  function applyAct(lead, act) {
    let st = act.stage_after != null ? act.stage_after : lead.stage;
    if (act.result === "refused") st = 7;
    else if (st <= 1 && act.result && !NOREACH.includes(act.result)) st = 2;
    const p = { stage: st, temp: act.temp_after || lead.temp, fit: act.fit_after || lead.fit, touch_count: (lead.touch_count || 0) + 1, last_touch_at: act.at || new Date().toISOString(), last_result: act.result || lead.last_result || null };
    if (act.needs_after) p.needs = act.needs_after;
    if (act.next_at || act.next_type) { p.next_at = act.next_at || null; p.next_type = act.next_type || null; p.next_note = act.next_note || null; }
    return p;
  }

  function callMinutes(leftAt, backAt) {
    const s = (backAt - leftAt) / 1000;
    if (s < 10) return 0;
    if (s > 120 * 60) return null;
    return Math.ceil(s / 60);
  }
  function ago(ts, now) {
    if (!ts) return "chưa chạm";
    const s = (+(now || new Date()) - Date.parse(ts)) / 1000;
    if (s < 60) return "vừa xong";
    if (s < 3600) return Math.floor(s / 60) + " phút trước";
    if (s < 86400) return Math.floor(s / 3600) + " giờ trước";
    return Math.floor(s / 86400) + " ngày trước";
  }
  const telHref = p => { const n = normPhones(p)[0]; return n ? "tel:" + n : ""; };
  const zaloHref = p => { const n = normPhones(p)[0]; return n ? "https://zalo.me/" + n : ""; };
  function distM(a1, o1, a2, o2) {
    const r = x => x * Math.PI / 180, R = 6371000;
    const h = Math.sin(r(a2 - a1) / 2) ** 2 + Math.cos(r(a1)) * Math.cos(r(a2)) * Math.sin(r(o2 - o1) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, " ").trim();
  const lab = (arr, k) => (arr.find(x => x[0] === k) || [])[1] || "";
  // lead đã có SĐT, email, địa chỉ chưa (org_email_web có thể là web, chỉ tính khi có @)
  function contactOf(l) {
    const t = v => String(v || "").trim();
    const ph = (l.phones && l.phones.length > 0) || normPhones([l.contact_phone, l.contact_zalo, l.org_phone].filter(Boolean).join(", ")).length > 0;
    const em = /@/.test(t(l.contact_email)) || /@/.test(t(l.org_email_web));
    return { ph, em, ad: t(l.address).length > 0 };
  }
  const CONTACT_F = [["ph", "Có SĐT"], ["noph", "Chưa có SĐT"], ["em", "Có email"], ["noem", "Chưa có email"], ["ad", "Có địa chỉ"], ["noad", "Chưa có địa chỉ"], ["none", "Thiếu SĐT và email"]];
  const contactMatch = (c, k) => k === "ph" ? c.ph : k === "noph" ? !c.ph : k === "em" ? c.em : k === "noem" ? !c.em : k === "ad" ? c.ad : k === "noad" ? !c.ad : k === "none" ? !c.ph && !c.em : true;
  // gộp cách viết tỉnh: bỏ chữ "tỉnh", "TP", "Thành phố"; Hồ Chí Minh viết TP.HCM
  // Nguồn: "agrimap-dl-ocop", "agrimap-dl-vungxk" gom thêm mục "agrimap-dl (tất cả)", giá trị "agrimap-dl*".
  function srcOptions(leads) {
    const m = new Map(); (leads || []).forEach(l => { const k = l && l.source; if (k) m.set(k, (m.get(k) || 0) + 1); });
    const keys = [...m.keys()], grp = new Map();
    keys.forEach(k => { const p = k.split("-"); for (let n = 1; n < p.length; n++) { const pre = p.slice(0, n).join("-"); if (!grp.has(pre)) grp.set(pre, keys.filter(x => x === pre || x.startsWith(pre + "-"))); } });
    const used = new Set(), items = [];
    [...grp].filter(([, ks]) => ks.length > 1).sort((a, b) => b[0].length - a[0].length).forEach(([pre, ks]) => {
      if (ks.some(k => used.has(k))) return; ks.forEach(k => used.add(k));
      items.push({ n: ks.reduce((a, k) => a + m.get(k), 0), rows: [[pre + "*", pre + " (tất cả) (" + ks.reduce((a, k) => a + m.get(k), 0) + ")"]].concat(ks.sort((a, b) => m.get(b) - m.get(a) || a.localeCompare(b, "vi")).map(k => [k, "  · " + k + " (" + m.get(k) + ")"])) });
    });
    keys.filter(k => !used.has(k)).forEach(k => items.push({ n: m.get(k), rows: [[k, k + " (" + m.get(k) + ")"]] }));
    return items.sort((a, b) => b.n - a.n || a.rows[0][0].localeCompare(b.rows[0][0], "vi")).flatMap(i => i.rows);
  }
  const srcMatch = (l, v) => !v ? true : v.endsWith("*") ? ((s, p) => s === p || s.startsWith(p + "-"))(String(l.source || ""), v.slice(0, -1)) : l.source === v;
  function provKey(s) {
    let v = String(s || "").trim();
    if (!v) return "Chưa rõ";
    if (/^(tp\.?\s*hcm|tp\.?\s*hồ chí minh|thành phố hồ chí minh|hồ chí minh|hcm)$/i.test(v)) return "TP.HCM";
    v = v.replace(/^(tỉnh|thành phố|tp\.?)\s+/i, "").trim();
    return v || "Chưa rõ";
  }

  const SC = { STAGES, TEMPS, FITS, CHANNELS, RESULTS, NEEDS, LOST, NEXT, HOT_DAYS, WARM_DAYS, FRESH_HOURS, CALL_GOAL,
    normPhones, vnToday, addDays, nextPreset, buckets, applyAct, callMinutes, ago, telHref, zaloHref, distM, norm, lab, contactOf, provKey, CONTACT_F, contactMatch, srcOptions, srcMatch, PRIOS, PRIO_CLS, prioOf, CONTACT_STATES, contactState, NOREACH };
  if (typeof module !== "undefined" && module.exports) module.exports = SC; else root.SC = SC;
})(typeof window !== "undefined" ? window : this);
