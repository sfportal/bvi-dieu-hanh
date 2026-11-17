// Kiểm thử logic trang sales: node tools/sales-core.test.js
const assert = require("assert");
const SC = require("../sales-core.js");
const eq = assert.deepStrictEqual;

// normPhones
eq(SC.normPhones("0901694999, 0977469999 (danh bạ)"), ["0901694999", "0977469999"]);
eq(SC.normPhones("+84 983 408 009"), ["0983408009"]);
eq(SC.normPhones("0983.408.009"), ["0983408009"]);
eq(SC.normPhones("02623852747"), ["02623852747"]);
eq(SC.normPhones(""), []);
eq(SC.normPhones(null), []);

// vnToday: 18:30 UTC ngày 15 = 01:30 sáng 16 giờ VN
assert.strictEqual(SC.vnToday(new Date("2026-11-15T18:30:00Z")), "2026-11-16");
assert.strictEqual(SC.vnToday(new Date("2026-11-16T03:00:00Z")), "2026-11-16");

// nextPreset
assert.strictEqual(SC.nextPreset("1d", "2026-11-16"), "2026-11-17");
assert.strictEqual(SC.nextPreset("3d", "2026-11-30"), "2026-12-03");
assert.strictEqual(SC.nextPreset("1w", "2026-11-16"), "2026-11-23");

// buckets
const now = new Date("2026-11-16T03:00:00Z"), uid = "u1";
const H = 3600e3, D = 24 * H, iso = ms => new Date(now - ms).toISOString();
const L = [
  { id: "od", stage: 2, owner_id: uid, next_at: "2026-11-14", last_touch_at: iso(3 * D) },
  { id: "td", stage: 3, owner_id: uid, next_at: "2026-11-16", last_touch_at: iso(1 * D) },
  { id: "hot", stage: 2, owner_id: uid, priority: "A", next_at: "2026-11-20", last_touch_at: iso(3 * D) },
  { id: "warm8", stage: 2, owner_id: uid, priority: "B", next_at: "2026-11-25", last_touch_at: iso(8 * D) },
  { id: "fresh", stage: 1, owner_id: uid, assigned_at: iso(30 * H), last_touch_at: null },
  { id: "fresh_new", stage: 1, owner_id: uid, assigned_at: iso(2 * H), last_touch_at: null, next_at: null },
  { id: "nonext", stage: 3, owner_id: uid, last_touch_at: iso(1 * D), next_at: null },
  { id: "won", stage: 6, owner_id: uid, next_at: "2026-11-01" },
  { id: "other", stage: 2, owner_id: "u2", next_at: "2026-11-10" },
];
const B = SC.buckets(L, uid, now), ids = k => B[k].map(x => x.id);
eq(ids("overdue"), ["od"]);
eq(ids("today"), ["td"]);
eq(ids("hot"), ["hot", "warm8"]);
eq(ids("fresh"), ["fresh"]);
eq(ids("nonext"), ["fresh_new", "nonext"]);
// mỗi lead chỉ một nhóm
assert.strictEqual(new Set(Object.values(B).flat().map(x => x.id)).size, Object.values(B).flat().length);
// mine=false (nhân viên xem toàn bộ): lead của người khác cũng tính
assert.ok(SC.buckets(L, null, now).overdue.some(x => x.id === "other"));

// applyAct
assert.strictEqual(SC.applyAct({ stage: 1 }, { result: "talked" }).stage, 2);
assert.strictEqual(SC.applyAct({ stage: 0 }, { result: "noans" }).stage, 0);
assert.strictEqual(SC.applyAct({ stage: 4 }, { result: "talked" }).stage, 4);
assert.strictEqual(SC.applyAct({ stage: 3 }, { result: "refused" }).stage, 7);
assert.strictEqual(SC.applyAct({ stage: 3, temp: "cold" }, { result: "talked", temp_after: "hot" }).temp, "hot");
assert.strictEqual(SC.applyAct({ stage: 3, temp: "cold" }, { result: "talked" }).temp, "cold");

// callMinutes
assert.strictEqual(SC.callMinutes(0, 5000), 0);
assert.strictEqual(SC.callMinutes(0, 61000), 2);
assert.strictEqual(SC.callMinutes(0, 121 * 60e3), null);

// ago
assert.strictEqual(SC.ago(new Date(now - 20e3).toISOString(), now), "vừa xong");
assert.strictEqual(SC.ago(new Date(now - 5 * 60e3).toISOString(), now), "5 phút trước");
assert.strictEqual(SC.ago(new Date(now - 3 * D).toISOString(), now), "3 ngày trước");
assert.strictEqual(SC.ago(null, now), "chưa chạm");

// href
assert.strictEqual(SC.telHref(""), "");
assert.strictEqual(SC.telHref("0983.408.009"), "tel:0983408009");
assert.strictEqual(SC.zaloHref("+84 983 408 009"), "https://zalo.me/0983408009");
assert.strictEqual(SC.zaloHref(null), "");

// distance (haversine, mét)
const d = SC.distM(12.68, 108.05, 12.68108, 108.05);
assert.ok(d > 110 && d < 130, "distM " + d);

// norm (tìm không dấu)
assert.strictEqual(SC.norm("Công ty Dũng Thái Sơn"), "cong ty dung thai son");

assert.strictEqual(SC.STAGES.length, 8);
assert.strictEqual(SC.STAGES[7][1], "Không theo");

// contactOf: có SĐT, email, địa chỉ hay chưa
eq(SC.contactOf({ phones: ["0901694999"], contact_email: "", org_email_web: "www.abc.vn", address: " " }), { ph: true, em: false, ad: false });
eq(SC.contactOf({ phones: [], org_email_web: "info@abc.vn", address: "Thôn 3, Cư M'gar" }), { ph: false, em: true, ad: true });
eq(SC.contactOf({ contact_phone: "0983 408 009" }), { ph: true, em: false, ad: false });
eq(SC.contactOf({}), { ph: false, em: false, ad: false });

// provKey: gộp cách viết khác nhau của cùng một tỉnh
assert.strictEqual(SC.provKey("Tỉnh Khánh Hòa"), "Khánh Hòa");
assert.strictEqual(SC.provKey("tỉnh Khánh Hòa"), "Khánh Hòa");
assert.strictEqual(SC.provKey("TP HCM"), "TP.HCM");
assert.strictEqual(SC.provKey("Thành phố Hồ Chí Minh"), "TP.HCM");
assert.strictEqual(SC.provKey("TP Đà Nẵng"), "Đà Nẵng");
assert.strictEqual(SC.provKey("Đắk Lắk"), "Đắk Lắk");
assert.strictEqual(SC.provKey(""), "Chưa rõ");
assert.strictEqual(SC.provKey(null), "Chưa rõ");
assert.strictEqual(SC.contactMatch({ ph: false, em: false, ad: true }, "none"), true);
assert.strictEqual(SC.contactMatch({ ph: true, em: false, ad: true }, "none"), false);
assert.strictEqual(SC.contactMatch({ ph: true, em: false, ad: false }, "noad"), true);
assert.strictEqual(SC.contactMatch({ ph: true, em: false, ad: false }, ""), true);
// ưu tiên High/Normal/Low lưu A/B/C
eq(SC.PRIOS, [["A", "High"], ["B", "Normal"], ["C", "Low"]]);
assert.strictEqual(SC.prioOf({ priority: "A" }), "A");
assert.strictEqual(SC.prioOf({ priority: " b " }), "B");
assert.strictEqual(SC.prioOf({ priority: "high" }), "A");
assert.strictEqual(SC.prioOf({ priority: "Low" }), "C");
assert.strictEqual(SC.prioOf({ priority: "" }), "");
assert.strictEqual(SC.prioOf({}), "");
// nóng cũ không còn quyết định nhóm "lâu chưa chạm"
eq(SC.buckets([{ id: "t", stage: 2, owner_id: uid, temp: "hot", next_at: "2026-11-20", last_touch_at: iso(3 * D) }], uid, now).hot, []);
eq(SC.buckets([{ id: "c", stage: 2, owner_id: uid, priority: "C", next_at: "2026-11-20", last_touch_at: iso(30 * D) }], uid, now).hot, []);
console.log("OK");
