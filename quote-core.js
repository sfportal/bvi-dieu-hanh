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
  // ---------- Xuất Word (.docx): chuyển HTML của render() sang WordprocessingML, không cần thư viện ----------
  const VOID = new Set(["br", "hr"]);
  function parse(html) {
    const root = { tag: "#root", attrs: {}, kids: [] }, st = [root], re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>|([^<]+)/g;
    const dec = s => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, k) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " }[k]));
    let m;
    while ((m = re.exec(html))) {
      const top = st[st.length - 1];
      if (m[4] != null) { top.kids.push({ text: dec(m[4]) }); continue; }
      const t = m[2].toLowerCase();
      if (m[1]) { for (let i = st.length - 1; i > 0; i--) if (st[i].tag === t) { st.length = i; break; } continue; }
      const attrs = {}, ra = /([a-z-]+)\s*=\s*"([^"]*)"/gi; let a; while ((a = ra.exec(m[3]))) attrs[a[1].toLowerCase()] = a[2];
      const n = { tag: t, attrs, kids: [] }; top.kids.push(n); if (!VOID.has(t) && !/\/\s*$/.test(m[3])) st.push(n);
    }
    return root;
  }
  const xe = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const has = (n, c) => (" " + ((n.attrs || {}).class || "") + " ").includes(" " + c + " ");
  const INL = new Set(["b", "strong", "i", "em", "u", "s", "span", "sup", "sub", "br", "#text"]);
  const isInl = n => n.text != null || INL.has(n.tag);
  const GREEN = "1F5B3C";
  function runs(n, f) {
    if (n.text != null) { const t = f.upper ? n.text.toUpperCase() : n.text; if (!t) return "";
      const p = (f.b ? "<w:b/>" : "") + (f.i ? "<w:i/>" : "") + (f.u ? '<w:u w:val="single"/>' : "") + (f.s ? "<w:strike/>" : "") + (f.color ? '<w:color w:val="' + f.color + '"/>' : "") + (f.sz ? '<w:sz w:val="' + f.sz + '"/><w:szCs w:val="' + f.sz + '"/>' : "") + (f.va ? '<w:vertAlign w:val="' + f.va + '"/>' : "");
      return "<w:r>" + (p ? "<w:rPr>" + p + "</w:rPr>" : "") + '<w:t xml:space="preserve">' + xe(t.replace(/\s+/g, " ")) + "</w:t></w:r>"; }
    if (n.tag === "br") return "<w:r><w:br/></w:r>";
    const g = Object.assign({}, f);
    if (n.tag === "b" || n.tag === "strong" || n.tag === "th") g.b = true; if (n.tag === "i" || n.tag === "em") g.i = true; if (n.tag === "u") g.u = true; if (n.tag === "s") g.s = true;
    if (n.tag === "sup") g.va = "superscript"; if (n.tag === "sub") g.va = "subscript";
    return n.kids.map(k => runs(k, g)).join("");
  }
  function para(r, o) {
    o = o || {}; if (!r && !o.keep) return "";
    const p = (o.jc ? '<w:jc w:val="' + o.jc + '"/>' : "") + (o.before != null || o.after != null ? '<w:spacing' + (o.before != null ? ' w:before="' + o.before + '"' : "") + (o.after != null ? ' w:after="' + o.after + '"' : "") + "/>" : "")
      + (o.ind ? '<w:ind w:left="' + o.ind + '" w:hanging="' + (o.hang || 0) + '"/>' : "") + (o.border ? '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="' + GREEN + '"/></w:pBdr>' : "") + (o.keepNext ? "<w:keepNext/>" : "");
    return "<w:p>" + (p ? "<w:pPr>" + p + "</w:pPr>" : "") + r + "</w:p>";
  }
  // gom các nút liền nhau: chữ, thẻ định dạng thành một đoạn; thẻ khối xử lý riêng
  function blocks(kids, f, o) {
    let out = "", buf = [];
    const flush = () => { if (buf.length) { const r = buf.map(k => runs(k, f)).join(""); if (r.replace(/<[^>]+>/g, "").trim() || /<w:br\/>/.test(r)) out += para(r, o); buf = []; } };
    kids.forEach(k => { if (isInl(k)) buf.push(k); else { flush(); out += block(k, f, o); } }); flush(); return out;
  }
  function block(n, f, o) {
    f = f || {}; o = o || {}; const t = n.tag;
    if (t === "div" && has(n, "qd-wm")) return para(runs({ text: "BẢN NHÁP · CHƯA DUYỆT" }, { b: true, color: "B83A2E" }), { jc: "right" });
    if (t === "div" && has(n, "qd-nat")) return blocks(n.kids, f, { jc: "center", after: 200 });
    if (t === "div" && has(n, "qd-top")) return blocks(n.kids, Object.assign({}, f, { color: GREEN, sz: 20 }), { border: true, after: 200 });
    if (t === "h1") return para(runs(n, Object.assign({}, f, { b: true, sz: 32, color: GREEN, upper: true })), { jc: "center", before: 120, after: 40 });
    if (t === "div" && has(n, "qd-st")) return blocks(n.kids, f, { jc: "center", after: 160 });
    if (t === "h3") return para(runs(n, Object.assign({}, f, { b: true, color: GREEN })), { before: 220, after: 80, keepNext: true });
    if (t === "h4") return para(runs(n, Object.assign({}, f, { b: true })), { before: 160, after: 60, keepNext: true });
    if (t === "p") return blocks(n.kids, has(n, "w") ? Object.assign({}, f, { i: true }) : f, o);
    if (t === "hr") return para("", { keep: true, border: true });
    if (t === "ul" || t === "ol") return n.kids.filter(k => k.tag === "li").map((li, i) => {
      const lead = runs({ text: (t === "ol" ? (i + 1) + "." : "•") + "\t" }, f);
      const inl = li.kids.filter(isInl), rest = li.kids.filter(k => !isInl(k));
      return para(lead + inl.map(k => runs(k, f)).join(""), { ind: 360 * ((o.lvl || 0) + 1), hang: 360, keep: true }) + rest.map(k => block(k, f, Object.assign({}, o, { lvl: (o.lvl || 0) + 1 }))).join("");
    }).join("");
    if (t === "blockquote") return blocks(n.kids, Object.assign({}, f, { i: true }), Object.assign({}, o, { ind: 567 }));
    if (t === "div" && has(n, "qd-sign")) {
      const cells = n.kids.filter(k => k.tag === "div").map(d => '<w:tc><w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr>'
        + (d.kids.map(k => isInl(k) ? para(runs(k, f), { jc: "center", after: 0 }) : has(k, "n") ? para(runs(k, Object.assign({}, f, { b: true })), { jc: "center", before: 1500, keep: true }) : blocks(k.kids, f, { jc: "center", after: 0 })).join("") || "<w:p/>") + "</w:tc>");
      return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4819"/><w:gridCol w:w="4819"/></w:tblGrid><w:tr>' + cells.join("") + "</w:tr></w:tbl>" + para("", { keep: true, after: 0 });
    }
    if (t === "table") return table(n, f);
    return blocks(n.kids, f, o); // div, span khối, thead...
  }
  function table(n, f) {
    const rows = []; const walk = x => x.kids.forEach(k => { if (k.tag === "tr") rows.push(k); else if (["thead", "tbody", "tfoot"].includes(k.tag)) walk(k); }); walk(n);
    const span = c => Math.max(1, Math.min(20, parseInt(c.attrs.colspan, 10) || 1));
    const cols = Math.max(1, ...rows.map(r => r.kids.filter(c => c.tag === "td" || c.tag === "th").reduce((s, c) => s + span(c), 0)));
    const W = 9638, wt = cols === 6 ? [7, 37, 12, 8, 17, 19] : cols === 2 ? (has(n, "qd-meta") ? [22, 78] : [26, 74]) : (() => { const L = Array(cols).fill(7), tx = c => (c.text != null ? c.text : (c.kids || []).map(tx).join("")); rows.forEach(r => { let i = 0; r.kids.filter(c => c.tag === "td" || c.tag === "th").forEach(c => { const sp = span(c); if (sp === 1 && i < cols) L[i] = Math.max(L[i], Math.min(40, tx(c).trim().length)); i += sp; }); }); return L; })(), sum = wt.reduce((a, b) => a + b, 0), cw = wt.map(x => Math.round(W * x / sum));
    const bd = '<w:tblBorders>' + ["top", "left", "bottom", "right", "insideH", "insideV"].map(s => '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="C9D2C9"/>').join("") + "</w:tblBorders>";
    let x = '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' + bd + '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + cw.map(w => '<w:gridCol w:w="' + w + '"/>').join("") + "</w:tblGrid>";
    rows.forEach((r, ri) => {
      const tt = has(r, "tt"), cells = r.kids.filter(c => c.tag === "td" || c.tag === "th"), head = cells.length && cells.every(c => c.tag === "th"); let ci = 0;
      x += "<w:tr>" + (head && ri === 0 && cols > 2 ? "<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>" : "<w:trPr><w:cantSplit/></w:trPr>") + cells.map(c => {
        const s = span(c), w = cw.slice(ci, ci + s).reduce((a, b) => a + b, 0); ci += s;
        const g = Object.assign({}, f, (c.tag === "th" || tt) ? { b: true } : {}), jc = has(c, "r") ? "right" : has(c, "c") ? "center" : "";
        const body = blocks(c.kids, g, { jc, after: 0 }) || "<w:p/>";
        return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (s > 1 ? '<w:gridSpan w:val="' + s + '"/>' : "") + (c.tag === "th" || tt ? '<w:shd w:val="clear" w:color="auto" w:fill="' + (tt ? "F6F8F5" : "EEF3EE") + '"/>' : "") + "</w:tcPr>" + body + "</w:tc>";
      }).join("") + "</w:tr>";
    });
    return x + "</w:tbl>" + para("", { keep: true, after: 60 });
  }
  function docxFiles(doc, co, creator) {
    const tree = parse(render(doc, co, creator)), qd = tree.kids.find(k => k.tag === "div") || tree;
    const body = blocks(qd.kids, {}, {});
    const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    return {
      "[Content_Types].xml": X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      "_rels/.rels": X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      "word/_rels/document.xml.rels": X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      "word/styles.xml": X + '<w:styles xmlns:w="' + W + '"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>',
      "word/document.xml": X + '<w:document xmlns:w="' + W + '"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>'
    };
  }
  const fileName = (doc, ext) => ((doc.number || lab(KINDS, doc.kind)) + " " + ((doc.customer || {}).name || "")).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^A-Za-z0-9-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) + "." + ext;

  const isMgr = me => !!me && ["owner", "manager"].includes(me.role);
  const canEdit = (d, me) => !!d && !!me && (isMgr(me) ? d.status !== "cancelled" : d.created_by === me.id && ["draft", "rejected"].includes(d.status));
  const canSend = d => !!d && ["approved", "sent"].includes(d.status);

  const QC = { esc, lab, STATUS, KINDS, VIA, VARS, money, num, words, calc, docTotal, clean, vars, fill, fromTemplate, render, printHtml, docxFiles, fileName, CSS, isMgr, canEdit, canSend, ddmmyyyy, clone };
  if (typeof module !== "undefined" && module.exports) module.exports = QC; else root.QC = QC;
})(typeof window !== "undefined" ? window : this);
