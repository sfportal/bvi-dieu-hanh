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
eq(d.customer, { name: "HTX Ea Tu", address: "Thôn 2", province: "", xa: "", tax_id: "123", rep: "Anh A", rep_title: "", phone: "0905", email: "", contact_name: "Anh A", contact_title: "", contact_phone: "0905", note: "" });
assert.strictEqual(QC.fromTemplate(tpl, { lead: { id: "x", name: "UBND xã Krông Pắc" } }).customer.xa, "xã Krông Pắc");
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
// Word: XML cân thẻ, có nội dung, biến đã điền, chữ đặc biệt được thoát
{ const co = { name: "Công ty Cổ phần BVI", short_name: "BVI", rep_name: "Trương Công Tài", rep_title: "Giám đốc", banks: [{ number: "3721077979", bank: "Vietcombank" }] };
  const d = { kind: "quote", status: "approved", number: "BG-2026-007", customer: { name: "HTX A & B <x>" }, body: { title: "Báo giá", blocks: [{ t: "text", h: "1. Mục", html: "<p>Xin <b>chào</b> {{khach_hang}}</p><ul><li>Một</li><li>Hai</li></ul>" }, { t: "items", h: "Giá", rows: [{ name: "Gói", unit: "vùng", qty: 2, price: 5000000 }], vat: 8 }, { t: "bank" }, { t: "sign" }] } };
  const F = QC.docxFiles(d, co, { name: "Huy" }), x = F["word/document.xml"];
  assert.ok(Object.keys(F).length === 5);
  const tags = []; x.replace(/<(\/?)(w:[a-zA-Z]+)[^>]*?(\/?)>/g, (m, c, t, sc) => { if (sc) return; if (c) { assert.strictEqual(tags.pop(), t); } else tags.push(t); });
  assert.strictEqual(tags.length, 0);
  assert.ok(x.includes("HTX A &amp; B &lt;x&gt;") && x.includes("10.800.000") && x.includes("3721077979") && x.includes("BG-2026-007") && x.includes("•") && !x.includes("{{") && !x.includes("BẢN NHÁP"));
  assert.ok(QC.docxFiles(Object.assign({}, d, { status: "draft" }), co, {})["word/document.xml"].includes("BẢN NHÁP"));
  assert.strictEqual(QC.fileName(d, "docx"), "BG-2026-007_HTX_A_B_x.docx"); }
// Kiểm tra: đỏ khi thiếu đầu mối, sai tài khoản BVI, cam kết cấp mã; vàng khi giá cũ, ô [ ]
{ const bvi = { code: "bvi", name: "Công ty Cổ phần BVI", short_name: "BVI", tax_id: "6001653877", rep_name: "Trương Công Tài", banks: [{ number: "3721077979" }] };
  const base = { kind: "quote", customer: { name: "HTX A", contact_name: "Anh B", contact_title: "GĐ", contact_phone: "0905 111 222" }, body: { blocks: [{ t: "items", rows: [{ name: "Gói", qty: 1, price: 5000000 }], vat: 8 }, { t: "bank" }] } };
  const lv = (d, co) => QC.check(d, co || bvi);
  eq(lv(base), []);
  const noC = QC.clone(base); noC.customer.contact_name = ""; noC.customer.contact_phone = "12";
  assert.ok(lv(noC).filter(x => x.lvl === "err").length === 2);
  const badBank = QC.clone(bvi); badBank.banks = [{ number: "0123456789" }];
  assert.ok(lv(base, badBank).some(x => x.lvl === "err" && /3721077979/.test(x.msg)));
  const prom = QC.clone(base); prom.body.blocks.unshift({ t: "text", html: "<p>BVI cam kết cấp mã trong 30 ngày, giá 30-40 triệu/mã, liên hệ 0901 403 819 [ngày]</p>" });
  const r = lv(prom); assert.ok(r.filter(x => x.lvl === "err").length === 2 && r.some(x => /giá cũ/.test(x.msg)) && r.some(x => /chưa điền/.test(x.msg)));
  const ok2 = QC.clone(base); ok2.body.blocks.unshift({ t: "text", html: "<p>BVI không cam kết cấp mã. 10 ha là khuyến nghị, không bắt buộc.</p>" }); eq(lv(ok2), []);
  const zero = QC.clone(base); zero.body.blocks[0].rows[0].price = 0; assert.ok(lv(zero).some(x => x.lvl === "err" && /tổng bằng 0/.test(x.msg)));
  const lt = { kind: "letter", customer: { name: "UBND xã X", contact_name: "Chị C", contact_title: "PCT", contact_phone: "0911423839" }, body: { subtitle: "đề nghị", to: "Kính gửi: Ủy ban nhân dân {{xa}}", blocks: [{ t: "sign" }] } };
  assert.ok(lv(lt).some(x => x.lvl === "err" && /xã, phường/.test(x.msg)));
  lt.customer.xa = "xã X"; eq(lv(lt), []);
  const h = QC.render(Object.assign({ status: "approved", number: "CV-2026-001", created_at: "2026-11-21T03:00:00Z" }, lt), bvi, {});
  assert.ok(h.includes("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM") && h.includes("Số: CV-2026-001") && h.includes("V/v đề nghị") && h.includes("Ủy ban nhân dân xã X") && h.includes("ngày 21 tháng 11 năm 2026") && h.includes("Nơi nhận"));
  const x = QC.docxFiles(Object.assign({ status: "approved", number: "CV-2026-001" }, lt), bvi, {})["word/document.xml"]; assert.ok(x.includes("Ủy ban nhân dân xã X") && x.includes('w:val="nil"')); }
// guessXa dùng được từ trang; check() nhận người lập để không báo nhầm {{nguoi_lap}}
eq(QC.guessXa({ name: "UBND xã Ea Kiết" }), "xã Ea Kiết");
{ const d = { kind: "quote", customer: { name: "A", contact_name: "B", contact_title: "C", contact_phone: "0912345678" }, body: { blocks: [{ t: "text", html: "<p>{{nguoi_lap}}</p>" }, { t: "items", rows: [{ name: "x", unit: "gói", qty: 1, price: 1000 }], vat: 8 }] } };
  const co = { name: "BVI", code: "bvi", tax_id: "6001653877", rep_name: "T", banks: [{ number: "3721077979" }] };
  assert.ok(QC.check(d, co).some(x => /nguoi_lap/.test(x.msg)));
  eq(QC.check(d, co, { name: "Huy" }), []); }
eq(QC.vars({ customer: {} }, { address: "150 Phan Huy Chú" }, {}).noi_lap, "Đắk Lắk");
eq(QC.vars({ customer: {} }, { address: "150 Phan Huy Chú, Phường Thành Nhất, tỉnh Đắk Lắk" }, {}).noi_lap, "Đắk Lắk");
eq(QC.vars({ customer: {} }, { address: "12 Lê Lợi, TP. Hồ Chí Minh" }, {}).noi_lap, "Hồ Chí Minh");
// Phụ lục sang trang mới (xem, PDF, Word); thứ tự thẻ trong w:pPr đúng chuẩn để Word mở không lỗi
{ const d = { kind: "contract", status: "draft", customer: { name: "A" }, body: { title: "HĐ", blocks: [{ t: "text", h: "Điều 1", html: "<p>x</p>" }, { t: "text", h: "Phụ lục 1. Phạm vi", html: "<p>y</p>" }] } };
  const h = QC.render(d, { name: "BVI" }, {}); assert.ok(/<h3 class="qd-pb">Phụ lục 1/.test(h) && !/<h3 class="qd-pb">Điều 1/.test(h));
  const x = QC.docxFiles(d, { name: "BVI" }, {})["word/document.xml"]; assert.ok(/<w:pageBreakBefore\/>[^]*?Phụ lục 1/.test(x));
  const ord = ["keepNext", "keepLines", "pageBreakBefore", "pBdr", "spacing", "ind", "jc"];
  (x.match(/<w:pPr>.*?<\/w:pPr>/g) || []).forEach(pp => { const tags = (pp.match(/<w:(\w+)/g) || []).map(t => t.slice(3)).filter(t => ord.includes(t)); assert.deepStrictEqual(tags, [...tags].sort((a, b) => ord.indexOf(a) - ord.indexOf(b)), pp); }); }
// Bảng giá tham khảo (bảng trong đoạn văn, không có bảng tính tiền) không bị báo đỏ
{ const co = { name: "BVI", code: "bvi", tax_id: "6001653877", rep_name: "T", banks: [{ number: "3721077979" }] }, cu = { name: "A", contact_name: "B", contact_title: "C", contact_phone: "0912345678" };
  const d = { kind: "quote", customer: cu, body: { blocks: [{ t: "text", html: "<table><tr><td>Hạng mục</td><td>3.000.000 đ/ha</td></tr></table>" }] } };
  eq(QC.check(d, co, { name: "H" }).filter(x => x.lvl === "err"), []);
  assert.ok(QC.check({ kind: "quote", customer: cu, body: { blocks: [{ t: "text", html: "<p>x</p>" }] } }, co, { name: "H" }).some(x => x.lvl === "err" && /bảng giá/.test(x.msg))); }
// Xăng xe công tác khoán 2 triệu/ngày, không tính theo km
{ const co = { name: "BVI", code: "bvi", tax_id: "6001653877", rep_name: "T", banks: [{ number: "3721077979" }] }, cu = { name: "A", contact_name: "B", contact_title: "C", contact_phone: "0912345678" };
  const d = { kind: "letter", customer: cu, body: { layout: "doc", blocks: [{ t: "text", html: "<p>Phí xăng xe 8.000 đ/km</p>" }] } };
  assert.ok(QC.check(d, co, { name: "H" }).some(x => x.lvl === "warn" && /khoán 2\.000\.000/.test(x.msg))); }
console.log("OK");
