// Kiểm thử logic báo giá, hợp đồng (quote-core.js). Chạy: node tools/quote-core.test.js
const assert = require("assert");
const QC = require("../quote-core.js");
const eq = assert.deepStrictEqual;

// số tiền
assert.strictEqual(QC.money(10800000), "10.800.000");
assert.strictEqual(QC.money(0), "0");
assert.strictEqual(QC.money(-5000), "-5.000");
// bằng chữ
assert.strictEqual(QC.words(10800000), "Mười triệu tám trăm nghìn đồng");
assert.strictEqual(QC.words(5400000), "Năm triệu bốn trăm nghìn đồng");
assert.strictEqual(QC.words(0), "Không đồng");
assert.strictEqual(QC.words(105), "Một trăm linh năm đồng");
assert.strictEqual(QC.words(21), "Hai mươi mốt đồng");
assert.strictEqual(QC.words(15), "Mười lăm đồng");
assert.strictEqual(QC.words(25), "Hai mươi lăm đồng");
assert.strictEqual(QC.words(1000005), "Một triệu không trăm linh năm đồng");
assert.strictEqual(QC.words(2000000000), "Hai tỷ đồng");
assert.strictEqual(QC.words(14), "Mười bốn đồng");
assert.strictEqual(QC.words(24), "Hai mươi tư đồng");
assert.strictEqual(QC.words(1010000), "Một triệu không trăm mười nghìn đồng");
// tính tiền
eq(QC.calc({ rows: [{ qty: 1, price: 5000000 }, { qty: 1, price: 5000000 }, { qty: 0, price: 2000000 }], vat: 8 }), { sub: 10000000, vat: 800000, total: 10800000 });
eq(QC.calc({ rows: [{ qty: "15,5", price: "4.500.000" }], vat: 0 }), { sub: 69750000, vat: 0, total: 69750000 });
eq(QC.calc({ rows: [] }), { sub: 0, vat: 0, total: 0 });
assert.strictEqual(QC.num("4.500.000"), 4500000);
assert.strictEqual(QC.num("15,82803"), 15.82803);
assert.strictEqual(QC.num(""), 0);
// tổng tài liệu = khối bảng giá đầu tiên
assert.strictEqual(QC.docTotal({ blocks: [{ t: "text", html: "x" }, { t: "items", rows: [{ qty: 2, price: 100 }], vat: 10 }, { t: "items", rows: [{ qty: 1, price: 999 }] }] }), 220);
assert.strictEqual(QC.docTotal({ blocks: [] }), 0);
// làm sạch HTML: chỉ giữ thẻ định dạng, bỏ thuộc tính và script
assert.strictEqual(QC.clean('<b onclick="x()">Đậm</b><script>alert(1)</script><img src=x onerror=alert(1)>'), "<b>Đậm</b>");
assert.strictEqual(QC.clean('<p style="color:red">A</p><ul><li>1</li></ul>'), "<p>A</p><ul><li>1</li></ul>");
assert.strictEqual(QC.clean('<a href="javascript:alert(1)">x</a>'), "x");
assert.strictEqual(QC.clean('<td colspan="2" onmouseover="x">c</td>'), '<td colspan="2">c</td>');
assert.strictEqual(QC.clean("<!-- c --><i>i</i><style>*{}</style>"), "<i>i</i>");
assert.strictEqual(QC.clean("<IFRAME src=x></IFRAME>t"), "t");
assert.strictEqual(QC.clean("<img src=x onerror=alert(1)"), "&lt;img src=x onerror=alert(1)");
assert.strictEqual(QC.clean("a < b > c <b>d</b>"), "a &lt; b &gt; c <b>d</b>");
assert.strictEqual(QC.clean("x &amp; y"), "x &amp; y");
// điền biến, giá trị được thoát HTML
const V = QC.vars({ customer: { name: "HTX <A>", address: "Xã B" }, number: "BG-2026-001", created_at: "2026-11-21T03:00:00Z" },
  { name: "Công ty Cổ phần BVI", tax_id: "6001653877", banks: [{ number: "3721077979", bank: "Vietcombank", branch: "Chi nhánh Đắk Lắk", holder: "Công ty Cổ phần BVI" }] }, { name: "Minh" }, 10800000);
assert.strictEqual(QC.fill("Kính gửi {{khach_hang}}, {{dia_chi_khach}}", V), "Kính gửi HTX &lt;A&gt;, Xã B");
assert.strictEqual(QC.fill("{{ngay}} {{so}} {{mst}} {{nguoi_lap}}", V), "21/11/2026 BG-2026-001 6001653877 Minh");
assert.ok(QC.fill("{{tai_khoan}}", V).includes("3721077979"));
assert.strictEqual(QC.fill("{{tong}} đ, {{tong_chu}}", V), "10.800.000 đ, Mười triệu tám trăm nghìn đồng");
assert.strictEqual(QC.fill("{{khong_co}}", V), "{{khong_co}}");
// tạo bản nháp từ mẫu
const tpl = { id: "t1", kind: "quote", name: "Báo giá TXNG", company_id: "c1", body: { title: "BÁO GIÁ", blocks: [{ t: "text", h: "1. Nhu cầu", html: "<p>A</p>" }, { t: "items", h: "Báo giá", rows: [{ name: "Thiết lập", unit: "lần", qty: 1, price: 5000000 }], vat: 8 }] } };
const d = QC.fromTemplate(tpl, { company_id: "c2", lead: { id: "L1", name: "HTX Ea Tu", address: "Thôn 2", tax_id: "123", contact_name: "Anh A", contact_phone: "0905" } });
assert.strictEqual(d.kind, "quote");
assert.strictEqual(d.template_id, "t1");
assert.strictEqual(d.company_id, "c2");
assert.strictEqual(d.lead_id, "L1");
eq(d.customer, { name: "HTX Ea Tu", address: "Thôn 2", tax_id: "123", rep: "Anh A", rep_title: "", phone: "0905", email: "" });
assert.strictEqual(d.title, "Báo giá TXNG: HTX Ea Tu");
assert.strictEqual(d.total, 5400000);
d.body.blocks[0].html = "đổi";
assert.strictEqual(tpl.body.blocks[0].html, "<p>A</p>", "bản nháp không sửa vào mẫu");
assert.strictEqual(QC.fromTemplate(tpl, {}).company_id, "c1");
// hiển thị
const html = QC.render({ kind: "quote", status: "approved", number: "BG-2026-001", customer: { name: "HTX Ea Tu" }, created_at: "2026-11-21T03:00:00Z",
  body: { title: "BÁO GIÁ {{khach_hang}}", blocks: [{ t: "items", h: "Bảng giá", rows: [{ name: "Thiết lập <x>", unit: "lần", qty: 1, price: 5000000 }], vat: 8 }, { t: "bank", h: "Thanh toán" }, { t: "text", h: "Ghi chú", html: "<b>ok</b><script>bad()</script>" }, { t: "sign" }] } },
  { name: "Công ty Cổ phần BVI", tax_id: "6001653877", address: "150 Phan Huy Chú", rep_name: "Trương Công Tài", rep_title: "Giám đốc", banks: [{ number: "3721077979", bank: "Vietcombank", branch: "Đắk Lắk", holder: "Công ty Cổ phần BVI" }] }, { name: "Minh" });
assert.ok(html.includes("BÁO GIÁ HTX Ea Tu"));
assert.ok(html.includes("5.400.000"));
assert.ok(html.includes("Năm triệu bốn trăm nghìn đồng"));
assert.ok(html.includes("Thiết lập &lt;x&gt;"));
assert.ok(html.includes("3721077979"));
assert.ok(html.includes("<b>ok</b>") && !html.includes("bad()"));
assert.ok(html.includes("Trương Công Tài"));
assert.ok(!html.includes("BẢN NHÁP"));
assert.ok(QC.render({ status: "draft", body: { blocks: [] } }, {}, {}).includes("BẢN NHÁP"));
// hợp đồng: hai bên
const hc = QC.render({ kind: "contract", status: "pending", customer: { name: "HTX Ea Tu", rep: "Anh A", rep_title: "Giám đốc" }, body: { blocks: [{ t: "parties" }, { t: "sign" }] } }, { name: "Công ty Cổ phần BVI", rep_name: "Trương Công Tài", banks: [] }, {});
assert.ok(hc.includes("BÊN A") && hc.includes("BÊN B") && hc.includes("HTX Ea Tu") && hc.includes("Trương Công Tài"));
// trạng thái
assert.strictEqual(QC.lab(QC.STATUS, "pending"), "Chờ duyệt");
assert.strictEqual(QC.canEdit({ status: "draft", created_by: "u" }, { id: "u", role: "staff" }), true);
assert.strictEqual(QC.canEdit({ status: "pending", created_by: "u" }, { id: "u", role: "staff" }), false);
assert.strictEqual(QC.canEdit({ status: "rejected", created_by: "u" }, { id: "u", role: "staff" }), true);
assert.strictEqual(QC.canEdit({ status: "draft", created_by: "x" }, { id: "u", role: "staff" }), false);
assert.strictEqual(QC.canEdit({ status: "approved", created_by: "x" }, { id: "m", role: "manager" }), true);
assert.strictEqual(QC.canSend({ status: "approved" }), true);
assert.strictEqual(QC.canSend({ status: "pending" }), false);
console.log("OK");
