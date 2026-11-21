/* Logic báo giá, hợp đồng dùng chung cho bao-gia.html và kiểm thử (tools/quote-core.test.js).
   Nội dung tài liệu: body = {title, subtitle, blocks:[...]}; khối: text {h, html} · items {h, rows:[{name,unit,qty,price}], vat, total_label, note}
   · bank {h} · parties {} · sign {}. Biến {{...}} điền lúc hiển thị, giá trị luôn được thoát HTML. */
(function (root) {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lab = (arr, k) => { const x = (arr || []).find(a => a[0] === k); return x ? x[1] : (k == null ? "" : String(k)); };
  const STATUS = [["draft", "Nháp"], ["pending", "Chờ duyệt"], ["rejected", "Trả lại sửa"], ["approved", "Đã duyệt"], ["sent", "Đã gửi khách"], ["cancelled", "Đã hủy"]];
  const KINDS = [["quote", "Báo giá"], ["contract", "Hợp đồng"]];
  const VIA = [["zalo", "Zalo"], ["email", "Email"], ["meet", "Gặp trực tiếp"], ["other", "Khác"]];
  const VARS = [["khach_hang", "Tên khách hàng"], ["dia_chi_khach", "Địa chỉ khách"], ["mst_khach", "MST khách"], ["dai_dien_khach", "Người đại diện khách"], ["chuc_vu_khach", "Chức vụ người đại diện khách"],
    ["dien_thoai_khach", "Điện thoại khách"], ["email_khach", "Email khách"], ["ngay", "Ngày lập"], ["so", "Số báo giá, hợp đồng"], ["cong_ty", "Tên công ty cung cấp"], ["cong_ty_ngan", "Tên ngắn công ty"],
    ["mst", "MST công ty"], ["dia_chi", "Địa chỉ công ty"], ["dai_dien", "Người đại diện công ty"], ["chuc_vu", "Chức vụ người đại diện"], ["dien_thoai", "Điện thoại công ty"], ["email", "Email công ty"],
    ["website", "Website"], ["tai_khoan", "Tài khoản ngân hàng"], ["nguoi_lap", "Người lập"], ["tong", "Tổng thanh toán (bảng giá đầu tiên)"], ["tong_chu", "Tổng bằng chữ"]];

  function money(n) { const v = Math.round(Number(n) || 0); return (v < 0 ? "-" : "") + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function num(x) {
    if (typeof x === "number") return isFinite(x) ? x : 0;
    let s = String(x == null ? "" : x).trim().replace(/\s|đ/g, ""); if (!s) return 0;
    if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
    else if (s.includes(",")) s = s.replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const v = parseFloat(s); return isFinite(v) ? v : 0;
  }
  const D = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  function tri(n, full) {
    const h = Math.floor(n / 100), t = Math.floor(n / 10) % 10, u = n % 10, w = [];
    if (full || h) w.push(D[h] + " trăm");
    if (t === 0 && u) w.push((h || full ? "linh " : "") + D[u]);
    else if (t === 1) w.push("mười" + (u === 5 ? " lăm" : u ? " " + D[u] : ""));
    else if (t > 1) w.push(D[t] + " mươi" + (u === 1 ? " mốt" : u === 4 ? " tư" : u === 5 ? " lăm" : u ? " " + D[u] : ""));
    return w.join(" ");
  }
  function words(n) {
    let v = Math.round(Math.abs(Number(n) || 0)); if (!v) return "Không đồng";
    const U = ["", " nghìn", " triệu", " tỷ", " nghìn tỷ", " triệu tỷ"], g = [];
    while (v > 0) { g.push(v % 1000); v = Math.floor(v / 1000); }
    const out = [];
    for (let i = g.length - 1; i >= 0; i--) { if (!g[i]) continue; out.push(tri(g[i], i < g.length - 1) + U[i]); }
    const s = out.join(" ").replace(/\s+/g, " ").trim();
    return (Number(n) < 0 ? "Âm " + s : s.charAt(0).toUpperCase() + s.slice(1)) + " đồng";
  }
  function calc(b) {
    const sub = Math.round(((b && b.rows) || []).reduce((s, r) => s + num(r.qty) * num(r.price), 0));
    const vat = Math.round(sub * num(b && b.vat) / 100); return { sub, vat, total: sub + vat };
  }
  const docTotal = body => { const b = ((body && body.blocks) || []).find(x => x.t === "items"); return b ? calc(b).total : 0; };

  // Chỉ giữ thẻ định dạng; bỏ mọi thuộc tính (trừ colspan, rowspan), bỏ script, style, comment.
  const OK = new Set(["b", "strong", "i", "em", "u", "s", "br", "p", "div", "span", "ul", "ol", "li", "h3", "h4", "table", "thead", "tbody", "tr", "td", "th", "blockquote", "sup", "sub", "hr"]);
  function clean(html) {
    let s = String(html == null ? "" : html).replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|iframe|object|embed|template|noscript|textarea|select)\b[\s\S]*?<\/\1\s*>/gi, "");
    s = s.replace(/<(script|style|iframe|object|embed|template|noscript)\b[^>]*>/gi, "");
    const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)>/g, T = t => t.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let out = "", last = 0, m;
    while ((m = re.exec(s))) {
      out += T(s.slice(last, m.index)); last = re.lastIndex;
      const t = m[1].toLowerCase(); if (!OK.has(t)) continue;
      if (m[0].startsWith("</")) { out += "</" + t + ">"; continue; }
      let keep = ""; if (t === "td" || t === "th") { const ra = /\b(colspan|rowspan)\s*=\s*["']?(\d{1,2})/gi; let a; while ((a = ra.exec(m[2]))) keep += " " + a[1].toLowerCase() + '="' + a[2] + '"'; }
      out += "<" + t + keep + ">";
    }
    return out + T(s.slice(last));
  }
  function ddmmyyyy(iso) { const d = iso ? new Date(Date.parse(iso) + 7 * 36e5) : new Date(Date.now() + 7 * 36e5); const s = d.toISOString(); return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4); }
  function bankLine(b) { return b && b.number ? "số tài khoản " + b.number + (b.bank ? ", " + b.bank : "") + (b.branch ? ", " + b.branch : "") + (b.holder ? ", tên " + b.holder : "") : ""; }
  function vars(doc, co, creator, total) {
    doc = doc || {}; co = co || {}; const c = doc.customer || {}, b = (co.banks || [])[doc.bank || 0] || (co.banks || [])[0];
    const raw = { khach_hang: c.name, dia_chi_khach: c.address, mst_khach: c.tax_id, dai_dien_khach: c.rep, chuc_vu_khach: c.rep_title, dien_thoai_khach: c.phone, email_khach: c.email,
      ngay: ddmmyyyy(doc.created_at), so: doc.number || "(cấp số khi duyệt)", cong_ty: co.name, cong_ty_ngan: co.short_name || co.name, mst: co.tax_id, dia_chi: co.address, dai_dien: co.rep_name,
      chuc_vu: co.rep_title, dien_thoai: co.phone, email: co.email, website: co.website, tai_khoan: bankLine(b), nguoi_lap: (creator || {}).name,
      tong: money(total == null ? docTotal(doc.body) : total), tong_chu: words(total == null ? docTotal(doc.body) : total) };
    const V = {}; Object.keys(raw).forEach(k => V[k] = esc(raw[k] == null ? "" : raw[k])); return V;
  }
  const fill = (s, V) => String(s == null ? "" : s).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => Object.prototype.hasOwnProperty.call(V, k) ? V[k] : m);
  const clone = o => JSON.parse(JSON.stringify(o == null ? {} : o));

  function fromTemplate(tpl, o) {
    o = o || {}; const l = o.lead, body = clone(tpl.body || {}); if (!Array.isArray(body.blocks)) body.blocks = [];
    return { kind: tpl.kind || "quote", template_id: tpl.id || null, company_id: o.company_id || tpl.company_id || null, lead_id: l ? l.id : null, bank: 0,
      customer: l ? { name: l.name || "", address: l.address || "", tax_id: l.tax_id || "", rep: l.contact_name || "", rep_title: l.contact_title || "", phone: l.contact_phone || l.org_phone || "", email: l.contact_email || "" }
        : { name: "", address: "", tax_id: "", rep: "", rep_title: "", phone: "", email: "" },
      title: (tpl.name || lab(KINDS, tpl.kind)) + (l ? ": " + l.name : ""), body, total: docTotal(body), status: "draft" };
  }

  const CSS = '.qd{position:relative;background:#fff;color:#1b1f1c;font:13px/1.5 "Be Vietnam Pro",system-ui,sans-serif;padding:28px 34px;max-width:820px;margin:0 auto;overflow-wrap:anywhere}'
    + '.qd *{box-sizing:border-box}.qd-top{font-size:11.5px;color:#1f5b3c;border-bottom:2px solid #1f5b3c;padding-bottom:6px;margin-bottom:14px}.qd-top b{font-size:12.5px}'
    + '.qd-nat{text-align:center;margin-bottom:14px}.qd h1{text-align:center;font-size:19px;margin:6px 0 2px;color:#1f5b3c;text-transform:uppercase}.qd .qd-st{text-align:center;color:#444;margin-bottom:12px}'
    + '.qd h3{font-size:14px;margin:16px 0 6px;color:#1f5b3c}.qd p{margin:4px 0}.qd ul,.qd ol{margin:4px 0;padding-left:22px}'
    + '.qd table{width:100%;border-collapse:collapse;margin:6px 0}.qd td,.qd th{border:1px solid #c9d2c9;padding:5px 7px;vertical-align:top;text-align:left}.qd th{background:#eef3ee;font-weight:600}'
    + '.qd .r{text-align:right;white-space:nowrap}.qd .c{text-align:center}.qd tr.tt td{font-weight:700;background:#f6f8f5}.qd .w{font-style:italic;margin:2px 0 8px}'
    + '.qd-meta td:first-child{width:130px;color:#444}.qd-sign{display:flex;justify-content:space-between;gap:20px;margin-top:26px;text-align:center}.qd-sign>div{flex:1}.qd-sign .n{margin-top:70px;font-weight:700}'
    + '.qd-wm{position:absolute;top:10px;right:14px;border:2px solid #b83a2e;color:#b83a2e;font-weight:700;font-size:12px;padding:3px 8px;border-radius:6px;transform:rotate(3deg);background:#fff}'
    + '.qd-items{overflow-x:auto}@media (max-width:600px){.qd{padding:16px 12px}.qd td,.qd th{padding:4px 5px;font-size:12px}}'
    + '@media print{.qd{padding:0;max-width:none}.qd-wm{position:fixed}}';

  function render(doc, co, creator) {
    doc = doc || {}; co = co || {}; const body = doc.body || {}, blocks = body.blocks || [], V = vars(doc, co, creator), c = doc.customer || {};
    const txt = s => esc(s).replace(/\n/g, "<br>"), F = s => fill(s, V);
    let h = '<div class="qd">' + (["approved", "sent"].includes(doc.status) ? "" : '<div class="qd-wm">BẢN NHÁP · CHƯA DUYỆT</div>');
    if (doc.kind === "contract") h += '<div class="qd-nat"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br>Độc lập – Tự do – Hạnh phúc</div>';
    else h += '<div class="qd-top"><b>' + esc(String(co.name || "").toUpperCase()) + '</b>' + [co.tax_id ? "MST " + esc(co.tax_id) : "", esc(co.address || ""), esc(co.phone || ""), esc(co.email || ""), esc(co.website || "")].filter(Boolean).map(x => " · " + x).join("") + '</div>';
    h += '<h1>' + clean(F(body.title || lab(KINDS, doc.kind))) + '</h1>' + (body.subtitle ? '<div class="qd-st">' + clean(F(body.subtitle)) + '</div>' : "");
    if (doc.kind === "contract") h += '<div class="qd-st">Số: ' + V.so + '</div>';
    else h += '<table class="qd-meta"><tr><td>Số</td><td>' + V.so + '</td></tr><tr><td>Ngày</td><td>' + V.ngay + '</td></tr><tr><td>Kính gửi</td><td><b>' + V.khach_hang + '</b>' + (c.address ? "<br>" + V.dia_chi_khach : "") + '</td></tr></table>';
    blocks.forEach(b => {
      const H = b.h ? '<h3>' + clean(F(b.h)) + '</h3>' : "";
      if (b.t === "text") h += H + clean(F(b.html));
      else if (b.t === "items") {
        const k = calc(b), rows = b.rows || [];
        h += H + '<div class="qd-items"><table><thead><tr><th class="c">STT</th><th>Hạng mục</th><th>Đơn vị</th><th class="r">SL</th><th class="r">Đơn giá (đ)</th><th class="r">Thành tiền (đ)</th></tr></thead><tbody>'
          + rows.map((r, i) => '<tr><td class="c">' + (i + 1) + '</td><td>' + txt(r.name) + '</td><td>' + txt(r.unit) + '</td><td class="r">' + esc(String(r.qty == null ? "" : r.qty)) + '</td><td class="r">' + money(num(r.price)) + '</td><td class="r">' + money(num(r.qty) * num(r.price)) + '</td></tr>').join("")
          + (num(b.vat) ? '<tr><td></td><td colspan="4">Tổng trước thuế</td><td class="r">' + money(k.sub) + '</td></tr><tr><td></td><td colspan="4">Thuế GTGT ' + esc(String(b.vat)) + '%</td><td class="r">' + money(k.vat) + '</td></tr>' : "")
          + '<tr class="tt"><td></td><td colspan="4">' + esc(b.total_label || "TỔNG THANH TOÁN") + '</td><td class="r">' + money(k.total) + '</td></tr></tbody></table></div>'
          + '<p class="w">Bằng chữ: ' + esc(words(k.total)) + (b.per ? esc(b.per) : "") + '.</p>' + (b.note ? clean(F(b.note)) : "");
      } else if (b.t === "bank") h += H + '<p>' + (V.tai_khoan ? "Chuyển khoản vào " + V.tai_khoan + "." : "[Chưa có tài khoản ngân hàng cho công ty này]") + '</p>';
      else if (b.t === "parties") {
        const row = (k, v) => v ? '<tr><td style="width:150px">' + k + '</td><td>' + v + '</td></tr>' : "";
        h += '<table><tr><th colspan="2">BÊN A (BÊN SỬ DỤNG DỊCH VỤ): ' + V.khach_hang + '</th></tr>' + row("Địa chỉ", V.dia_chi_khach) + row("Mã số thuế", V.mst_khach) + row("Đại diện", V.dai_dien_khach + (c.rep_title ? ", " + V.chuc_vu_khach : "")) + row("Điện thoại", V.dien_thoai_khach) + row("Email", V.email_khach)
          + '<tr><th colspan="2">BÊN B (BÊN CUNG CẤP DỊCH VỤ): ' + V.cong_ty + '</th></tr>' + row("Địa chỉ", V.dia_chi) + row("Mã số thuế", V.mst) + row("Đại diện", V.dai_dien + (co.rep_title ? ", " + V.chuc_vu : "")) + row("Điện thoại", V.dien_thoai) + row("Email", V.email) + row("Tài khoản", V.tai_khoan) + '</table>';
      } else if (b.t === "sign") {
        const me = '<div><b>ĐẠI DIỆN ' + (doc.kind === "contract" ? "BÊN B" : esc(String(co.short_name || co.name || "").toUpperCase())) + '</b><div>' + esc(co.rep_title || "") + '</div><div class="n">' + esc(co.rep_name || "") + '</div></div>';
        h += '<div class="qd-sign">' + (doc.kind === "contract" ? '<div><b>ĐẠI DIỆN BÊN A</b><div>' + V.chuc_vu_khach + '</div><div class="n">' + V.dai_dien_khach + '</div></div>' : '<div></div>') + me + '</div>';
      }
    });
    return h + '</div>';
  }
  function printHtml(doc, co, creator) {
    return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>' + esc((doc.number ? doc.number + " " : "") + (doc.title || "")) + '</title>'
      + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700&display=swap"><style>@page{size:A4;margin:16mm 15mm}body{margin:0}' + CSS + '</style></head><body>' + render(doc, co, creator) + '</body></html>';
  }
  const isMgr = me => !!me && ["owner", "manager"].includes(me.role);
  const canEdit = (d, me) => !!d && !!me && (isMgr(me) ? d.status !== "cancelled" : d.created_by === me.id && ["draft", "rejected"].includes(d.status));
  const canSend = d => !!d && ["approved", "sent"].includes(d.status);

  const QC = { esc, lab, STATUS, KINDS, VIA, VARS, money, num, words, calc, docTotal, clean, vars, fill, fromTemplate, render, printHtml, CSS, isMgr, canEdit, canSend, ddmmyyyy, clone };
  if (typeof module !== "undefined" && module.exports) module.exports = QC; else root.QC = QC;
})(typeof window !== "undefined" ? window : this);
