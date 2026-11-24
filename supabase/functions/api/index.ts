// BVI Điều hành: API cho bên thứ 3. Chủ yếu chỉ đọc; riêng nhu cầu khách hàng có thể gửi vào (quyền leads_write).
// Dữ liệu: GET /functions/v1/api/v1/<resource>[/<id>]  header  X-API-Key: bvi_...
// Gửi nhu cầu khách hàng: POST /functions/v1/api/v1/leads  (một bản ghi, hoặc {"leads":[...]} tối đa 100)
// Đồng bộ một chiều từ extension FarmBase: POST /functions/v1/api/v1/farmbase-sync  (quyền farmbase_sync, chỉ ghi danh sách Vùng FarmBase)
// Quản lý khóa: POST /functions/v1/api/admin  (JWT của owner)
// Khóa chỉ lưu dạng SHA-256 trong bảng app_secrets (chỉ service role đọc được).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, x-client-info, apikey, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};
const json = (b: unknown, s = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...extra } });

export const RESOURCES: Record<string, string> = {
  zones: "Vùng trồng", tasks: "Công việc", events: "Lịch công tác", leaves: "Lịch nghỉ",
  daily: "Báo cáo ngày", units: "Công ty, khách hàng", people: "Nhân sự", faqs: "Hỏi đáp",
  supports: "Yêu cầu hỗ trợ", contracts: "Hợp đồng (không có số tiền)", leads: "Lead khách hàng, pipeline sales (che SĐT, email, MST)",
};
// quyền ghi: không phải loại dữ liệu đọc được
export const WRITES: Record<string, string> = { leads_write: "Gửi nhu cầu khách hàng (chỉ ghi)", farmbase_sync: "Đồng bộ hồ sơ vùng từ extension FarmBase (chỉ ghi)" };
// lead khách hàng nằm ở bảng sales_leads (trang sales.html); docs loại contacts type "lead" là dữ liệu cũ, không trả nữa
const COL_OF: Record<string, string> = {};
const colOf = (res: string) => COL_OF[res] || res;
const rowOk = (res: string, d: any) => res === "leads" ? d?.type === "lead" : res === "contacts" ? d?.type !== "lead" : true;
const PFX = "apikey:";
const USE = "apiuse:";

// ---- làm sạch dữ liệu: không bao giờ trả CCCD, sổ đỏ, SĐT, số tiền, link Drive ----
const DENY = new Set(["phone", "sdt", "tel", "mobile", "zalo", "email", "price", "amount", "total", "money", "cost", "chiphi",
  "value", "paid", "paidat", "fee", "cccdno", "cccd_no", "idno", "cmnd", "sodono", "gcn", "bank", "bankaccount", "link", "url", "holder"]);
function scrub(v: unknown, depth = 0): unknown {
  // chuỗi số dài (SĐT, CCCD, số sổ đỏ) trong ghi chú tự do cũng bị che
  if (typeof v === "string") return v.replace(/(?:\+?84)?\d(?:[\s.\-]?\d){8,}/g, "•••");
  if (depth > 8 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => scrub(x, depth + 1));
  const o: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (DENY.has(k.toLowerCase())) continue;
    o[k] = scrub(x, depth + 1);
  }
  return o;
}
export function clean(col: string, d: Record<string, unknown>): Record<string, unknown> {
  const x = { ...d };
  if (col === "zones") { delete x.drv; delete x.ownerNote; if (x.fbs && typeof x.fbs === "object") { const { by: _by, ...f } = x.fbs as Record<string, unknown>; x.fbs = f; } }
  if (col === "events") delete x.photos;
  if (col === "people") { delete x.canLeave; delete x.canPlan; delete x.canExpense; delete x.canRecon; delete x.rcDaily; }
  if (col === "leads") { delete x.type; delete x.hist; }
  return scrub(x) as Record<string, unknown>;
}

function lastMod(r: any): string {
  const c = [r.updated_at, r.data?.updatedAt, r.data?.createdAt, r.data?.at, r.data?.decidedAt, r.data?.doneAt]
    .map((x) => { const d = new Date(x); return x && !isNaN(+d) ? d.toISOString() : ""; }).filter(Boolean).sort();
  return c[c.length - 1] || "";
}
async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
}
function newKey() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint32Array(40));
  return "bvi_" + Array.from(r, (x) => a[x % a.length]).join("");
}

// ---- giới hạn tốc độ: 120 lượt/phút mỗi khóa (theo từng máy chạy) ----
const RL = new Map<string, { t: number; n: number }>();
function limited(id: string) {
  const now = Date.now(); const r = RL.get(id);
  if (!r || now - r.t > 60000) { RL.set(id, { t: now, n: 1 }); return false; }
  r.n++; return r.n > 120;
}

async function handleAdmin(req: Request) {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = await db.auth.getUser(token);
  if (!who?.user) return json({ error: "not_signed_in" }, 401);
  const { data: me } = await db.from("profiles").select("*").eq("id", who.user.id).single();
  if (!me || !me.active || me.role !== "owner") return json({ error: "owner_only" }, 403);
  let body: any; try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const log = async (action: string, title: string, summary: string, id: string) => {
    try { await db.from("activity_log").insert({ user_id: me.id, email: me.email, name: me.name || me.email, action, col: "api_keys", doc_id: id, title, summary }); } catch (_) { /* không chặn */ }
  };
  const all = async () => {
    const { data } = await db.from("app_secrets").select("k,v").like("k", PFX + "%");
    return (data || []).map((r) => ({ k: r.k as string, m: JSON.parse(r.v as string) }));
  };
  const scopesOf = (s: unknown) => (Array.isArray(s) ? s.filter((x) => typeof x === "string" && (RESOURCES[x] || WRITES[x])) : []);
  const act = body?.action;
  if (act === "fb_status") {
    const { data: r0 } = await db.from("app_secrets").select("v").eq("k", FBS_LAST).maybeSingle();
    return json({ last: r0 ? JSON.parse(r0.v as string) : null });
  }
  if (act === "fb_pair") {
    // owner ghép tay một vùng FarmBase chưa khớp với một vùng trên app
    const fbId = fbStr(body.fbId, 64), zid = fbStr(body.zone, 120);
    if (!fbId || !zid) return json({ error: "Thiếu vùng" }, 400);
    const { data: r0 } = await db.from("app_secrets").select("v").eq("k", FBS_LAST).maybeSingle();
    const last = r0 ? JSON.parse(r0.v as string) : null;
    const row = (last?.unmatched || []).find((x: any) => x.id === fbId);
    if (!row) return json({ error: "Không còn vùng này trong danh sách chưa ghép, hãy đồng bộ lại từ extension" }, 404);
    const { data: zr } = await db.from("docs").select("data").eq("col", "zones").eq("id", zid).maybeSingle();
    if (!zr) return json({ error: "Không có vùng này trên app" }, 404);
    const { data: other } = await db.from("docs").select("id").eq("col", "zones").neq("id", zid).filter("data->>fbId", "eq", fbId).limit(1);
    if (other && other.length) return json({ error: "Vùng FarmBase này đã ghép với vùng khác (" + other[0].id + ")" }, 409);
    const d = zr.data || {};
    const nd = { ...d, fbId, fbs: fbSnap(row, last.ranAt, last.syncedAt, "owner") };
    const { error } = await db.from("docs").update({ data: nd }).eq("col", "zones").eq("id", zid);
    if (error) return json({ error: "Chưa lưu được" }, 500);
    last.unmatched = last.unmatched.filter((x: any) => x.id !== fbId);
    try { const { data: u0 } = await db.from("app_secrets").select("v").eq("k", FBS_UNITS).maybeSingle();
      if (u0) { const U = JSON.parse(u0.v as string); if (U.units?.[fbId]) { U.units[fbId].zone = zid; await db.from("app_secrets").upsert({ k: FBS_UNITS, v: JSON.stringify(U) }); } } } catch (_) { /* */ }
    await db.from("app_secrets").upsert({ k: FBS_LAST, v: JSON.stringify(last) });
    await log("fb_pair", d.name || zid, "ghép vùng FarmBase " + (row.name || fbId) + " với vùng " + (d.name || zid), zid);
    return json({ ok: true, unmatched: last.unmatched.length });
  }
  if (act === "list") {
    const rows = await all();
    const { data: us } = await db.from("app_secrets").select("k,v").like("k", USE + "%");
    const use: Record<string, any> = {}; (us || []).forEach((r) => (use[(r.k as string).slice(USE.length)] = JSON.parse(r.v as string)));
    return json({ keys: rows.map((r) => ({ ...r.m, ...(use[r.m.id] || {}) })).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")), resources: RESOURCES });
  }
  if (act === "create") {
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) return json({ error: "Cần đặt tên cho khóa (ví dụ tên đối tác)" }, 400);
    const scopes = scopesOf(body.scopes); if (!scopes.length) return json({ error: "Chọn ít nhất một loại dữ liệu" }, 400);
    const days = Number(body.days) || 0;
    const key = newKey(); const h = await sha256(key);
    const m = { id: crypto.randomUUID(), name, prefix: key.slice(0, 10), scopes, created_at: new Date().toISOString(), created_by: me.email,
      expires_at: days > 0 ? new Date(Date.now() + days * 864e5).toISOString() : null, revoked_at: null };
    const { error } = await db.from("app_secrets").insert({ k: PFX + h, v: JSON.stringify(m) });
    if (error) return json({ error: error.message }, 400);
    await log("create", name, "tạo khóa API " + m.prefix + "…, dữ liệu: " + scopes.join(", ") + (m.expires_at ? ", hết hạn sau " + days + " ngày" : ""), m.id);
    return json({ ok: true, key, meta: m });
  }
  const rows = await all(); const row = rows.find((r) => r.m.id === body.id);
  if (!row) return json({ error: "Không thấy khóa" }, 404);
  if (act === "update") {
    const m = row.m; const scopes = body.scopes !== undefined ? scopesOf(body.scopes) : m.scopes;
    if (!scopes.length) return json({ error: "Chọn ít nhất một loại dữ liệu" }, 400);
    m.scopes = scopes; if (body.name) m.name = String(body.name).trim().slice(0, 80);
    await db.from("app_secrets").update({ v: JSON.stringify(m) }).eq("k", row.k);
    await log("update", m.name, "sửa khóa API " + m.prefix + "…, dữ liệu: " + scopes.join(", "), m.id);
    return json({ ok: true, meta: m });
  }
  if (act === "revoke") {
    const m = row.m; if (!m.revoked_at) m.revoked_at = new Date().toISOString();
    await db.from("app_secrets").update({ v: JSON.stringify(m) }).eq("k", row.k);
    await log("update", m.name, "thu hồi khóa API " + m.prefix + "…", m.id);
    return json({ ok: true, meta: m });
  }
  if (act === "delete") {
    await db.from("app_secrets").delete().eq("k", row.k);
    await db.from("app_secrets").delete().eq("k", USE + row.m.id);
    await log("delete", row.m.name, "xóa khóa API " + row.m.prefix + "…", row.m.id);
    return json({ ok: true });
  }
  return json({ error: "unknown_action" }, 400);
}


// ---- trang "Vùng FarmBase" trong app: owner, quản lý xem danh sách vùng FarmBase đã đồng bộ ----
async function handleFbView(req: Request) {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = await db.auth.getUser(token);
  if (!who?.user) return json({ error: "not_signed_in" }, 401);
  const { data: me } = await db.from("profiles").select("role,active").eq("id", who.user.id).single();
  if (!me || !me.active || !["owner", "manager"].includes(me.role)) return json({ error: "Chỉ owner, quản lý xem được" }, 403);
  const body = await req.json().catch(() => ({}));
  if (body && body.action === "note") {
    // ghi chú, ngày vụ, bước tiếp theo của một vùng FarmBase (lưu ở app_secrets fbsync:notes), giữ nguyên tiến độ hồ sơ giấy (prog)
    const id = fbStr(body.id, 64); if (!id) return json({ error: "Thiếu id vùng" }, 400);
    const d = body.data || {};
    const mask = (t: string) => t.replace(/\d{9,}/g, (x) => "*".repeat(x.length));
    const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
    const steps = (Array.isArray(d.steps) ? d.steps : []).slice(0, 60).map((x: any) => ({ d: day(x?.d), act: mask(fbStr(x?.act, 300)), res: mask(fbStr(x?.res, 300)), done: !!x?.done })).filter((x: any) => x.act || x.res);
    const { data: n0 } = await db.from("app_secrets").select("v").eq("k", FBS_NOTES).maybeSingle();
    const N = n0 ? JSON.parse(n0.v as string) : {};
    const cur = N[id] || {};
    N[id] = { ...cur, harvest: day(d.harvest), seasonEnd: day(d.seasonEnd), note: mask(String(d.note ?? "").replace(/\u0000/g, "").slice(0, 2000)), steps, name: fbStr(d.name, 160) || cur.name || "", updatedAt: new Date().toISOString(), updatedBy: who.user.id };
    await db.from("app_secrets").upsert({ k: FBS_NOTES, v: JSON.stringify(N) });
    return json({ ok: true, note: N[id] });
  }
  const { data: u0 } = await db.from("app_secrets").select("v").eq("k", FBS_UNITS).maybeSingle();
  const { data: n1 } = await db.from("app_secrets").select("v").eq("k", FBS_NOTES).maybeSingle();
  const { data: l0 } = await db.from("app_secrets").select("v").eq("k", FBS_LAST).maybeSingle();
  const U = u0 ? JSON.parse(u0.v as string) : { units: {} }, L = l0 ? JSON.parse(l0.v as string) : null;
  return json({ syncedAt: U.syncedAt || null, units: Object.values(U.units || {}), notes: n1 ? JSON.parse(n1.v as string) : {}, last: L ? { ranAt: L.ranAt, syncedAt: L.syncedAt, sent: L.sent, counts: L.counts, unmatched: (L.unmatched || []).length } : null });
}

// ---- trang "Mục tiêu công ty": chỉ owner và quản lý được owner cấp quyền xem; quản lý ghi nhận, phân công ----
// Lưu ở app_secrets (không có policy, chỉ service role đọc) nên nhân viên, chỉ xem, API đối tác không bao giờ đọc được.
// goals:data = { items: [{ id, title, detail, period, due, kpi, prio, status, to[], acks{uid:{at,name,note}}, checks[{id,t,st,by,at,doneBy,doneAt}], createdAt, updatedAt }] }
// goals:access = { users: [uid quản lý được xem] }
const GOALS = "goals:data";
const GOALS_ACC = "goals:access";
const G_PRIO = ["high", "mid", "low"];
const G_STATUS = ["open", "done", "pause"];
async function handleGoals(req: Request) {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = await db.auth.getUser(token);
  if (!who?.user) return json({ error: "not_signed_in" }, 401);
  const { data: me } = await db.from("profiles").select("id,email,name,role,active").eq("id", who.user.id).single();
  if (!me || !me.active) return json({ error: "no_access" }, 403);
  const read = async (k: string, d: any) => { const { data } = await db.from("app_secrets").select("v").eq("k", k).maybeSingle(); try { return data ? JSON.parse(data.v as string) : d; } catch { return d; } };
  const A = await read(GOALS_ACC, { users: [] });
  const granted: string[] = Array.isArray(A.users) ? A.users : [];
  const owner = me.role === "owner";
  if (!owner && !(me.role === "manager" && granted.includes(me.id))) return json({ error: "no_access" }, 403);
  const body = await req.json().catch(() => ({}));
  const act = String(body?.action || "list");
  const log = async (action: string, summary: string, id: string) => {
    // không ghi nội dung mục tiêu vào nhật ký
    try { await db.from("activity_log").insert({ user_id: me.id, email: me.email, name: me.name || me.email, action, col: "goals", doc_id: id, title: "Mục tiêu công ty", summary }); } catch (_) { /* không chặn */ }
  };
  const mask = (t: string) => t.replace(/\d{9,}/g, (x) => "*".repeat(x.length));
  const txt = (v: unknown, n: number) => mask(String(v ?? "").replace(/\u0000/g, "").trim().slice(0, n));
  const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
  const G = await read(GOALS, { items: [] });
  const items: any[] = Array.isArray(G.items) ? G.items : [];
  const save = async () => { await db.from("app_secrets").upsert({ k: GOALS, v: JSON.stringify({ items }) }); };
  // danh sách tài khoản quản lý đang hoạt động; chỉ người được cấp quyền mới hiện trong mục tiêu, được giao
  const managers = async () => { const { data } = await db.from("profiles").select("id,name,email,role,active").in("role", ["manager"]); return (data || []).filter((p: any) => p.active).map((p: any) => ({ id: p.id, name: p.name || p.email })); };
  if (act === "list") {
    const M = await managers();
    return json({ items, me: { id: me.id, owner }, managers: M.filter((p) => granted.includes(p.id)), access: owner ? granted : undefined });
  }
  if (act === "ack") {
    const g = items.find((x) => x.id === body.id); if (!g) return json({ error: "Không thấy mục tiêu" }, 404);
    g.acks = g.acks && typeof g.acks === "object" ? g.acks : {};
    g.acks[me.id] = { at: new Date().toISOString(), name: me.name || me.email, note: txt(body.note, 2000) };
    await save(); await log("goal_ack", "ghi nhận mục tiêu", g.id);
    return json({ ok: true, goal: g });
  }
  if (act === "check") {
    // checklist việc của mục tiêu (owner, quản lý được xem): thêm, xong, hủy, mở lại, xóa
    const g = items.find((x) => x.id === body.id); if (!g) return json({ error: "Không thấy mục tiêu" }, 404);
    g.checks = Array.isArray(g.checks) ? g.checks : [];
    const now = new Date().toISOString(), nm = me.name || me.email;
    if (body.op === "add") {
      const t = txt(body.text, 300); if (!t) return json({ error: "Nhập nội dung việc" }, 400);
      if (g.checks.length >= 200) return json({ error: "Tối đa 200 việc mỗi mục tiêu" }, 400);
      g.checks.push({ id: "c" + crypto.randomUUID().replace(/-/g, "").slice(0, 10), t, st: "open", by: nm, at: now });
    } else {
      const c = g.checks.find((x: any) => x.id === body.item); if (!c) return json({ error: "Không thấy việc" }, 404);
      if (body.op === "del") g.checks = g.checks.filter((x: any) => x !== c);
      else if (["open", "done", "cancel"].includes(body.st)) { c.st = body.st; c.doneBy = body.st === "open" ? "" : nm; c.doneAt = body.st === "open" ? "" : now; }
      else return json({ error: "unknown_action" }, 400);
    }
    await save(); await log("goal_check", "cập nhật checklist mục tiêu", g.id);
    return json({ ok: true, goal: g });
  }
  if (!owner) return json({ error: "Chỉ owner sửa mục tiêu" }, 403);
  if (act === "save") {
    const d = body.data || {}; const title = txt(d.title, 200); if (!title) return json({ error: "Nhập tên mục tiêu" }, 400);
    const M = await managers(); const ok = new Set(M.filter((p) => granted.includes(p.id)).map((p) => p.id));
    const now = new Date().toISOString();
    let g = body.id ? items.find((x) => x.id === body.id) : null;
    if (body.id && !g) return json({ error: "Không thấy mục tiêu" }, 404);
    if (!g) { if (items.length >= 300) return json({ error: "Tối đa 300 mục tiêu" }, 400); g = { id: "g" + crypto.randomUUID().replace(/-/g, "").slice(0, 12), createdAt: now, acks: {} }; items.push(g); }
    Object.assign(g, { title, detail: txt(d.detail, 4000), period: txt(d.period, 60), due: day(d.due), kpi: txt(d.kpi, 1000),
      prio: G_PRIO.includes(d.prio) ? d.prio : "mid", status: G_STATUS.includes(d.status) ? d.status : "open",
      to: (Array.isArray(d.to) ? d.to : []).filter((x: unknown) => typeof x === "string" && ok.has(x)).slice(0, 50), updatedAt: now });
    if (d.reack && g.acks) g.acks = {}; // nội dung đổi nhiều: yêu cầu quản lý ghi nhận lại
    await save(); await log(body.id ? "update" : "create", body.id ? "sửa mục tiêu" : "thêm mục tiêu", g.id);
    return json({ ok: true, goal: g });
  }
  if (act === "delete") {
    const i = items.findIndex((x) => x.id === body.id); if (i < 0) return json({ error: "Không thấy mục tiêu" }, 404);
    items.splice(i, 1); await save(); await log("delete", "xóa mục tiêu", String(body.id));
    return json({ ok: true });
  }
  if (act === "access") {
    // cấp hoặc bỏ quyền xem cho một quản lý: {user, on}
    const M = await managers(); const uid = String(body.user || "");
    if (!M.some((p) => p.id === uid)) return json({ error: "Chỉ cấp cho tài khoản quản lý" }, 400);
    const set = new Set(granted.filter((x) => M.some((p) => p.id === x)));
    if (body.on) set.add(uid); else set.delete(uid);
    await db.from("app_secrets").upsert({ k: GOALS_ACC, v: JSON.stringify({ users: [...set] }) });
    await log("update", (body.on ? "cấp" : "bỏ") + " quyền xem mục tiêu cho " + ((M.find((p) => p.id === uid) || {}).name || ""), uid);
    return json({ ok: true, access: [...set] });
  }
  return json({ error: "unknown_action" }, 400);
}

// ---- xác thực khóa (dùng chung cho REST và MCP) ----
async function authKey(req: Request, override: string | null): Promise<{ m: any } | { resp: Response }> {
  const raw = override || req.headers.get("x-api-key") || (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!/^bvi_[A-Za-z0-9]{40}$/.test(raw)) return { resp: json({ error: "missing_api_key", message: "Gửi khóa trong header X-API-Key" }, 401) };
  const k = PFX + await sha256(raw);
  const { data: rec } = await db.from("app_secrets").select("v").eq("k", k).maybeSingle();
  if (!rec) return { resp: json({ error: "invalid_api_key" }, 401) };
  const m = JSON.parse(rec.v as string);
  if (m.revoked_at) return { resp: json({ error: "revoked_api_key" }, 401) };
  if (m.expires_at && new Date(m.expires_at) < new Date()) return { resp: json({ error: "expired_api_key" }, 401) };
  if (limited(m.id)) return { resp: json({ error: "rate_limited", message: "Tối đa 120 lượt mỗi phút" }, 429, { "Retry-After": "60" }) };
  // lượt dùng lưu ở dòng riêng (apiuse:<id>) để không bao giờ ghi đè trạng thái thu hồi của khóa
  const bump = (async () => {
    const uk = USE + m.id;
    const { data: u0 } = await db.from("app_secrets").select("v").eq("k", uk).maybeSingle();
    const u = u0 ? JSON.parse(u0.v as string) : { use_count: 0 };
    u.use_count = (u.use_count || 0) + 1; u.last_used_at = new Date().toISOString();
    u.last_ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 45) || null;
    await db.from("app_secrets").upsert({ k: uk, v: JSON.stringify(u) });
  })().catch(() => {});
  (globalThis as any).EdgeRuntime?.waitUntil?.(bump);
  return { m };
}

// ---- lead khách hàng: bảng sales_leads ----
const LEAD_ST = ["new", "contact", "quote", "won", "lost"];
const STAGE_L = ["Cần tìm liên hệ", "Mới", "Đã liên hệ", "Đang tư vấn", "Đã báo giá", "Thương lượng", "Đã ký", "Không theo"];
const stStatus = (s: number) => (s <= 1 ? "new" : s <= 3 ? "contact" : s <= 5 ? "quote" : s === 6 ? "won" : "lost");
const NEED_L: Record<string, string> = { msvt: "Mã số vùng trồng", csdg: "Cơ sở đóng gói", txng: "Truy xuất nguồn gốc, FarmBase", qr: "Tem QR", kt: "Tư vấn kỹ thuật", khac: "Khác" };
// chỉ đọc các cột này: không bao giờ lấy SĐT, email, MST ra khỏi DB
const LEAD_COLS = "id,name,contact_name,contact_title,segment,org_type,province,area,address,crops,scale,priority,needs,need_note,need_signal,offer,source,referrer,stage,temp,fit,owner_id,next_at,next_type,last_touch_at,touch_count,created_at,updated_at";
function leadOut(r: any): Record<string, unknown> {
  const st = typeof r.stage === "number" ? r.stage : 1;
  const o = scrub({ name: r.name, contact_name: r.contact_name, contact_title: r.contact_title, segment: r.segment, org_type: r.org_type, province: r.province, area: r.area, address: r.address,
    crops: r.crops, scale: r.scale, priority: r.priority, needs: (r.needs || []).map((k: string) => NEED_L[k] || k), need_note: r.need_note, need_signal: r.need_signal, offer: r.offer,
    source: r.source, referrer: r.referrer, status: stStatus(st), stage: st, stage_label: STAGE_L[st], temp: r.temp || null, fit: r.fit || null, owner_id: r.owner_id || null,
    next_contact: r.next_at || null, next_type: r.next_type || null, last_touch: r.last_touch_at || null, touch_count: r.touch_count || 0, received: String(r.created_at || "").slice(0, 10) }) as Record<string, unknown>;
  return { id: r.id, ...o, updated_at: r.updated_at || "" };
}
async function loadLeads(): Promise<any[]> {
  const all: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("sales_leads").select(LEAD_COLS).order("name").range(from, from + 999);
    if (error) throw new Error("db");
    all.push(...(data || []).map(leadOut)); if (!data || data.length < 1000) break;
  }
  return all;
}
async function ownerNames(): Promise<Record<string, string>> {
  const { data } = await db.from("profiles").select("id,name");
  return Object.fromEntries((data || []).map((p: any) => [p.id, p.name]));
}
function normPhones(s: string): string[] {
  const out: string[] = [];
  String(s || "").split(/[,;/]|[A-Za-zÀ-ỹ]+/).forEach((t) => { let d = t.replace(/\D/g, ""); if (/^84\d{9,10}$/.test(d)) d = "0" + d.slice(2); if (d.length >= 9 && d.length <= 11 && !out.includes(d)) out.push(d); });
  return out;
}
function needKeys(arr: string[]): string[] {
  const n = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
  const out = new Set<string>();
  arr.forEach((x) => { const t = n(x); if (/vung trong|msvt/.test(t)) out.add("msvt"); else if (/dong goi|csdg/.test(t)) out.add("csdg"); else if (/truy xuat|farmbase/.test(t)) out.add("txng"); else if (/\bqr\b|tem/.test(t)) out.add("qr"); else if (/ky thuat/.test(t)) out.add("kt"); else out.add("khac"); });
  return [...out];
}

// ---- đồng bộ một chiều từ extension FarmBase (12 tiêu chí hồ sơ vùng) ----
// Chỉ ghi danh sách Vùng FarmBase (app_secrets fbsync:units), không ghép, không sửa vùng trồng trên app. Không nhận số CCCD, SĐT, số tờ, số thửa; có tên nông hộ, mã lô kèm cờ thiếu (chỉ owner, quản lý xem).
const FBS_LAST = "fbsync:last";
const FB_N = 12;
const FBS_NOTES = "fbsync:notes"; // ghi chú, ngày vụ, bước tiếp theo, tiến độ hồ sơ giấy theo id vùng FarmBase
const FBS_UNITS = "fbsync:units"; // toàn bộ vùng FarmBase đã đồng bộ (trang "Vùng FarmBase")
const FB_STATUS = ["ACTIVE", "PENDING", "INACTIVE"];
const FB_DEEP = ["f", "fNoId", "fNoImg", "p", "pNoImg", "pNoPage", "pNoPlot", "pNoTrees", "pNoArea", "pZero", "dup", "issues"];
const fbStr = (v: unknown, n = 160) => (v === undefined || v === null ? "" : String(v)).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, n);
const fbIso = (v: unknown) => { const d = new Date(String(v || "")); return v && !isNaN(+d) ? d.toISOString() : null; };
function fbRow(x: any) {
  if (!x || typeof x !== "object") return null;
  const id = fbStr(x.id, 64); if (!id) return null;
  const flags = Array.isArray(x.flags) ? x.flags.slice(0, FB_N).map((f: unknown) => (f === 1 || f === 0 || f === -1 ? f : -1)) : [];
  if (flags.length !== FB_N) return null;
  const num = (v: unknown) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Math.max(0, Math.round(Number(v) * 100) / 100));
  // kiểm tra nông hộ và lô: số đếm, mã lô trùng, danh sách hộ, lô còn thiếu (không số CCCD, số tờ, số thửa)
  let deep: any = null;
  if (x.deep && typeof x.deep === "object") {
    if (x.deep.error) deep = { error: true };
    else { deep = {}; for (const k of FB_DEEP) deep[k] = Math.max(0, Math.floor(Number(x.deep[k]) || 0));
      deep.dupPlots = Array.isArray(x.deep.dupPlots) ? x.deep.dupPlots.slice(0, 30).map((c: unknown) => fbStr(c, 60)).filter(Boolean) : [];
      // chi tiết: tên nông hộ, mã lô, cờ thiếu (0/1), số cây, diện tích; che chuỗi số dài phòng khi lẫn CCCD
      const b = (v: unknown) => (v ? 1 : 0), nm = (v: unknown) => fbStr(v, 120).replace(/\d{9,}/g, "•••");
      const n0 = (v: unknown) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
      if (Array.isArray(x.deep.farmers)) deep.farmers = x.deep.farmers.slice(0, 300).map((f: any) => ({ n: nm(f?.n), i: b(f?.i), f: b(f?.f), b: b(f?.b) }));
      if (Array.isArray(x.deep.plots)) deep.plots = x.deep.plots.slice(0, 300).map((p: any) => ({ c: fbStr(p?.c, 60), o: nm(p?.o), img: b(p?.img), pg: b(p?.pg), pl: b(p?.pl), t: b(p?.t), a: b(p?.a), z: b(p?.z), d: b(p?.d), trees: n0(p?.trees), area: n0(p?.area) }));
      if (Array.isArray(x.deep.dupG)) deep.dupG = x.deep.dupG.slice(0, 50).map((g: unknown) => (Array.isArray(g) ? g.slice(0, 20).map((c: unknown) => fbStr(c, 60)).filter(Boolean) : [])).filter((g: string[]) => g.length > 1); }
  }
  return { id, code: fbStr(x.code, 60), name: fbStr(x.name, 160), province: fbStr(x.province, 80), ward: fbStr(x.ward, 80), vendor: fbStr(x.vendor, 160),
    vendorId: fbStr(x.vendorId, 64), status: FB_STATUS.includes(x.status) ? x.status : "", crop: fbStr(x.crop, 80),
    farmerCount: num(x.farmerCount), plotCount: num(x.plotCount), areaM2: num(x.areaM2),
    checkedAt: fbIso(x.checkedAt), flags, missing: flags.filter((f: number) => f === 1).length, deep,
    // số file scan hồ sơ (tên chứa "scan_hoso" trong thư viện vùng): -1 lỗi đọc, null chưa kiểm tra
    scan: x.scan === null || x.scan === undefined || !isFinite(Number(x.scan)) ? null : Math.max(-1, Math.min(999, Math.floor(Number(x.scan)))) };
}
function fbSnap(r: any, ranAt: string, syncedAt: string, by: string) {
  return { ranAt, syncedAt, by, checkedAt: r.checkedAt, flags: r.flags, missing: r.missing, code: r.code, name: r.name, status: r.status || undefined, deep: r.deep || undefined };
}
async function farmbaseSync(body: any, m: any) {
  const ranAt = fbIso(body?.ranAt);
  if (!ranAt) return json({ error: "bad_request", message: "Thiếu ranAt (thời điểm extension lấy dữ liệu)" }, 400);
  if (Array.isArray(body?.criteria) && body.criteria.length !== FB_N) return json({ error: "bad_criteria", message: "Extension khác phiên bản: cần đúng " + FB_N + " tiêu chí" }, 400);
  const list = Array.isArray(body?.rows) ? body.rows : null;
  if (!list || !list.length || list.length > 3000) return json({ error: "bad_request", message: "Gửi 1 đến 3000 vùng mỗi lần" }, 400);
  const rows = list.map(fbRow);
  // Danh sách Vùng FarmBase độc lập: chỉ ghi fbsync:units, không ghép, không sửa vùng trồng trên app
  const syncedAt = new Date().toISOString(), results: any[] = [];
  const cnt: Record<string, number> = { updated: 0, same: 0, old: 0, unmatched: 0, invalid: 0 };
  const { data: u0 } = await db.from("app_secrets").select("v").eq("k", FBS_UNITS).maybeSingle();
  const U = u0 ? JSON.parse(u0.v as string) : { units: {} };
  U.units ||= {};
  const sigOf = (r: any) => JSON.stringify([r.status, r.checkedAt, r.flags, r.deep, r.farmerCount, r.plotCount, r.areaM2, r.name, r.code, r.vendor, r.scan ?? null]);
  rows.forEach((r: any, i: number) => {
    if (!r) { cnt.invalid++; results.push({ i, status: "invalid" }); return; }
    const prev = U.units[r.id];
    if (prev?.ranAt && prev.ranAt > ranAt) { cnt.old++; results.push({ id: r.id, status: "old", message: "App đang giữ bản mới hơn (" + prev.ranAt + ")" }); return; }
    const same = !!prev && sigOf(prev) === sigOf(r);
    U.units[r.id] = { ...r, ranAt, syncedAt: same && prev.syncedAt ? prev.syncedAt : syncedAt, seenAt: syncedAt };
    if (same) cnt.same++; else cnt.updated++;
    results.push({ id: r.id, status: same ? "same" : "updated" });
  });
  U.syncedAt = syncedAt;
  const { error: ue } = await db.from("app_secrets").upsert({ k: FBS_UNITS, v: JSON.stringify(U) });
  if (ue) return json({ error: "server_error" }, 500);
  const { data: r0 } = await db.from("app_secrets").select("v").eq("k", FBS_LAST).maybeSingle();
  const last0 = r0 ? JSON.parse(r0.v as string) : null;
  if (!last0 || !last0.ranAt || last0.ranAt <= ranAt)
    await db.from("app_secrets").upsert({ k: FBS_LAST, v: JSON.stringify({ ranAt, syncedAt, key: fbStr(m.name, 80), sent: rows.length, counts: cnt, unmatched: [] }) });
  try { await db.from("activity_log").insert({ action: "farmbase_sync", col: "zones", doc_id: "farmbase", title: "Đồng bộ FarmBase", name: "API: " + fbStr(m.name, 80),
    summary: "nhận " + rows.length + " vùng FarmBase: cập nhật " + cnt.updated + ", giữ nguyên " + cnt.same + (cnt.old ? ", bỏ qua bản cũ " + cnt.old : "") }); } catch (_) { /* không chặn */ }
  return json({ ok: true, ranAt, syncedAt, counts: cnt, results });
}

// ---- tạo lead từ hệ thống khác (form web, Zapier, Apps Script, AI qua MCP) ----
const str = (v: unknown, n = 300) => (v === undefined || v === null ? "" : String(v)).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, n);
async function createLead(x: any, m: any): Promise<any> {
  if (!x || typeof x !== "object") return { ok: false, error: "bad_lead", message: "Mỗi nhu cầu là một object JSON" };
  const needs = (Array.isArray(x.needs) ? x.needs : typeof x.needs === "string" ? x.needs.split(/[,;]/) : []).map((s: unknown) => str(s, 80)).filter(Boolean).slice(0, 10);
  const person = str(x.name, 120), org = str(x.org ?? x.company, 160), phone = str(x.phone, 40), zalo = str(x.zalo, 40), email = str(x.email, 160);
  if (!person && !org) return { ok: false, error: "missing_name", message: "Cần name (họ tên) hoặc org (đơn vị)" };
  if (!phone && !zalo && !email) return { ok: false, error: "missing_contact", message: "Cần ít nhất phone, zalo hoặc email" };
  const ext = str(x.external_id ?? x.id, 120);
  // trùng mã ngoài hoặc trùng số điện thoại: không tạo lại
  if (ext) {
    const { data: ex } = await db.from("sales_leads").select("id").eq("ext_id", "api:" + ext).limit(1);
    if (ex && ex.length) return { ok: true, id: ex[0].id, duplicate: true };
  }
  const ph = normPhones([phone, zalo].join(","));
  if (ph.length) {
    const { data: ex } = await db.from("sales_leads").select("id").overlaps("phones", ph).limit(1);
    if (ex && ex.length) return { ok: true, id: ex[0].id, duplicate: true };
  }
  const ha = str(x.ha ?? x.area_ha, 20), detail = str(x.detail ?? x.message ?? x.need, 4000), note = str(x.note, 2000), srcNote = str(x.source_note ?? x.sourceNote, 300);
  const row: Record<string, unknown> = {
    name: org || person, contact_name: person || null, contact_phone: phone || null, contact_zalo: zalo || null, contact_email: email || null,
    province: str(x.province, 80) || null, address: str(x.area ?? x.address, 200) || null, crops: str(x.crop, 80) || null, scale: ha ? ha + " ha" : null,
    needs: needKeys(needs), need_note: [needs.length ? "Quan tâm: " + needs.join(", ") : "", detail, note].filter(Boolean).join("\n") || null,
    source: str(x.source, 80) || "Hệ thống khác (form, API)", referrer: str(x.referrer ?? x.referred_by, 160) || null,
    verify: ["Nhận qua API: " + str(m.name, 80), srcNote].filter(Boolean).join("; "), ext_id: ext ? "api:" + ext : null, stage: 1,
  };
  const { data, error } = await db.from("sales_leads").insert(row).select("id").single();
  if (error || !data) return { ok: false, error: "server_error" };
  return { ok: true, id: data.id, status: "new" };
}

async function handleData(req: Request, parts: string[]) {
  const [res, id] = parts;
  if (req.method === "POST" && res === "leads" && !id) {
    const a = await authKey(req, null);
    if ("resp" in a) return a.resp;
    if (!(a.m.scopes as string[]).includes("leads_write")) return json({ error: "forbidden_resource", message: "Khóa này không được gửi nhu cầu khách hàng (cần quyền leads_write)" }, 403);
    let body: any; try { body = await req.json(); } catch { return json({ error: "bad_json", message: "Gửi JSON" }, 400); }
    const list = Array.isArray(body?.leads) ? body.leads : Array.isArray(body) ? body : [body];
    if (!list.length || list.length > 100) return json({ error: "bad_request", message: "Gửi 1 đến 100 nhu cầu mỗi lần" }, 400);
    const out: any[] = [];
    for (const x of list) out.push(await createLead(x, a.m));
    const okN = out.filter((r) => r.ok).length;
    return json(Array.isArray(body?.leads) || Array.isArray(body) ? { ok: okN > 0, created: okN, results: out } : out[0], okN ? 201 : 400);
  }
  if (req.method === "POST" && res === "farmbase-sync" && !id) {
    const a = await authKey(req, null);
    if ("resp" in a) return a.resp;
    if (!(a.m.scopes as string[]).includes("farmbase_sync")) return json({ error: "forbidden_resource", message: "Khóa này không được đồng bộ FarmBase (cần quyền farmbase_sync)" }, 403);
    let body: any; try { body = await req.json(); } catch { return json({ error: "bad_json", message: "Gửi JSON" }, 400); }
    try { return await farmbaseSync(body, a.m); } catch { return json({ error: "server_error" }, 500); }
  }
  if (req.method !== "GET") return json({ error: "method_not_allowed", message: "API chỉ đọc, dùng GET (riêng POST /v1/leads, POST /v1/farmbase-sync)" }, 405);
  const a = await authKey(req, null);
  if ("resp" in a) return a.resp;
  const m = a.m;

  if (!res) return json({ name: "BVI Điều hành API", version: "v1", key: m.name,
    resources: (m.scopes as string[]).filter((s) => RESOURCES[s]).map((s) => ({ id: s, label: RESOURCES[s], path: "/v1/" + s })),
    write: (m.scopes as string[]).filter((s) => WRITES[s]).map((s) => ({ id: s, label: WRITES[s], method: "POST", path: s === "farmbase_sync" ? "/v1/farmbase-sync" : "/v1/leads" })),
    params: { updated_since: "ISO 8601, chỉ lấy bản ghi sửa từ thời điểm này", limit: "1-1000, mặc định 500", offset: "bỏ qua N bản ghi đầu" } });
  if (!RESOURCES[res]) return json({ error: "unknown_resource", resources: Object.keys(RESOURCES) }, 404);
  if (!(m.scopes as string[]).includes(res)) return json({ error: "forbidden_resource", message: "Khóa này không được đọc " + res }, 403);
  if (res === "leads") {
    if (id) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ error: "not_found" }, 404);
      const { data, error } = await db.from("sales_leads").select(LEAD_COLS).eq("id", id).maybeSingle();
      if (error) return json({ error: "server_error" }, 500);
      if (!data) return json({ error: "not_found" }, 404);
      return json({ data: leadOut(data) });
    }
    const u0 = new globalThis.URL(req.url);
    const lim = Math.min(1000, Math.max(1, Number(u0.searchParams.get("limit")) || 500)), off = Math.max(0, Number(u0.searchParams.get("offset")) || 0);
    const sn = u0.searchParams.get("updated_since"); let si = "";
    if (sn) { const d = new Date(sn); if (isNaN(+d)) return json({ error: "bad_updated_since" }, 400); si = d.toISOString(); }
    let L: any[]; try { L = await loadLeads(); } catch { return json({ error: "server_error" }, 500); }
    if (si) L = L.filter((x) => new Date(x.updated_at).toISOString() >= si);
    const rows = L.slice(off, off + lim);
    return json({ resource: res, total: L.length, offset: off, limit: lim, next_offset: off + rows.length < L.length ? off + rows.length : null, data: rows });
  }
  if (id) {
    const { data, error } = await db.from("docs").select("id,data,updated_at").eq("col", colOf(res)).eq("id", id).maybeSingle();
    if (error) return json({ error: "server_error" }, 500);
    if (!data || !rowOk(res, data.data)) return json({ error: "not_found" }, 404);
    return json({ data: { id: data.id, ...clean(res, data.data), updated_at: lastMod(data) } });
  }
  const u = new globalThis.URL(req.url);
  const limit = Math.min(1000, Math.max(1, Number(u.searchParams.get("limit")) || 500));
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  const since = u.searchParams.get("updated_since");
  let sinceIso = "";
  if (since) { const d = new Date(since); if (isNaN(+d)) return json({ error: "bad_updated_since" }, 400); sinceIso = d.toISOString(); }
  // Thời điểm sửa thật nằm trong data.updatedAt (cột updated_at chỉ ghi lúc tạo), nên lọc sau khi đọc.
  const all: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("docs").select("id,data,updated_at").eq("col", colOf(res)).order("id").range(from, from + 999);
    if (error) return json({ error: "server_error" }, 500);
    all.push(...(data || []).filter((r) => rowOk(res, r.data))); if (!data || data.length < 1000) break;
  }
  const list = all.map((r) => ({ r, t: lastMod(r) })).filter((x) => !sinceIso || x.t >= sinceIso);
  const count = list.length;
  const rows = list.slice(offset, offset + limit).map(({ r, t }) => ({ id: r.id, ...clean(res, r.data), updated_at: t }));
  const next = offset + rows.length < count ? offset + rows.length : null;
  return json({ resource: res, total: count, offset, limit, next_offset: next, data: rows });
}

// ================= MCP (Model Context Protocol, Streamable HTTP, không trạng thái) =================
// URL: /functions/v1/api/mcp  — khóa qua header X-API-Key / Authorization: Bearer, hoặc ?key=bvi_...
const STEP_NAMES = ["Mở quan hệ xã", "Gom dân, chốt hình thức", "Khảo sát từng lô", "Thu giấy tờ", "Tập huấn, ký hồ sơ", "Xã kiểm tra", "Nộp DVC, chờ mã nội địa", "Phía Trung Quốc bổ sung", "Mã GACC, duy trì"];
async function loadCol(col: string): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  if (col === "leads") { (await loadLeads()).forEach((x) => (out[x.id as string] = x)); return out; }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("docs").select("id,data,updated_at").eq("col", colOf(col)).order("id").range(from, from + 999);
    if (error) throw new Error("db");
    (data || []).filter((r) => rowOk(col, r.data)).forEach((r) => (out[r.id] = { ...clean(col, r.data), id: r.id, updated_at: lastMod(r) }));
    if (!data || data.length < 1000) break;
  }
  return out;
}
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const today = () => new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10); // giờ Việt Nam
const addDays = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
function zoneBrief(z: any, P: Record<string, any>) {
  return { id: z.id, name: z.name, code: z.code || undefined, customer: z.customer || undefined, ward: z.ward, province: z.province, ha: z.ha, households: z.hh,
    priority: z.priority, step: z.step ?? null, step_name: z.step != null ? STEP_NAMES[z.step] : undefined, eta: z.eta || undefined,
    owner: P[z.owner]?.name || z.owner || undefined, next: z.next || undefined, blocker: z.blocker || undefined, inspected: z.inspected ?? undefined, active: z.active !== false, updated_at: z.updated_at };
}
function taskBrief(t: any, P: Record<string, any>, Z: Record<string, any>, T: Record<string, any>) {
  const nm = (id: string) => P[id]?.name || id;
  return { id: t.id, title: t.title, kind: t.kind, status: t.status, due: t.due || undefined, prio: t.prio || undefined, zone: t.zone ? (Z[t.zone]?.name || t.zone) : undefined, zone_id: t.zone || undefined,
    parent: t.parent ? (T[t.parent]?.title || t.parent) : undefined, R: t.R ? nm(t.R) : undefined, A: t.A ? nm(t.A) : undefined,
    C: Array.isArray(t.C) && t.C.length ? t.C.map(nm) : undefined, plan_date: t.planDate || undefined, done_at: t.doneAt || undefined, note: t.note ? String(t.note).slice(0, 400) : undefined };
}
function personMatch(P: Record<string, any>, q: string) {
  if (!q) return null; const n = norm(q);
  return Object.values(P).filter((p: any) => p.id === q || norm(p.name).includes(n)).map((p: any) => p.id);
}
const TOOLS = [
  { name: "bvi_overview", scope: ["zones"], description: "Tổng quan hệ thống BVI: số vùng trồng theo mức ưu tiên và bước tiến độ, việc quá hạn, việc tới hạn 7 ngày tới, lịch công tác 7 ngày tới, người đang nghỉ. Gọi đầu tiên khi cần bức tranh chung.", inputSchema: { type: "object", properties: {} } },
  { name: "bvi_search_zones", scope: ["zones"], description: "Tìm vùng trồng (mã số vùng trồng sầu riêng). Lọc theo tên/khách hàng/xã (q), ưu tiên (1, 2, 3, GACC), khoảng bước tiến độ 0-8, có vướng mắc hay không. Trả danh sách gọn.",
    inputSchema: { type: "object", properties: { q: { type: "string", description: "Từ khóa: tên vùng, khách hàng, xã, tỉnh, mã vùng (không phân biệt dấu)" }, priority: { type: "string", enum: ["1", "2", "3", "GACC"] }, step_min: { type: "integer", minimum: 0, maximum: 8 }, step_max: { type: "integer", minimum: 0, maximum: 8 }, has_blocker: { type: "boolean" }, include_inactive: { type: "boolean" }, limit: { type: "integer", minimum: 1, maximum: 200, default: 50 } } } },
  { name: "bvi_get_zone", scope: ["zones"], description: "Chi tiết một vùng trồng theo id hoặc tên: tiến độ, hồ sơ (chỉ trạng thái), số file minh chứng, việc còn mở, lịch sắp tới của vùng.", inputSchema: { type: "object", properties: { zone: { type: "string", description: "id (vd z014-hoi-buon-ho) hoặc tên vùng" } }, required: ["zone"] } },
  { name: "bvi_list_tasks", scope: ["tasks"], description: "Liệt kê công việc. Lọc theo vùng, trạng thái (todo, doing, done, open = chưa xong), người (R hoặc A, theo tên), loại (epic, task, sub), hạn từ/đến, quá hạn, từ khóa.",
    inputSchema: { type: "object", properties: { zone: { type: "string", description: "id hoặc tên vùng" }, status: { type: "string", enum: ["todo", "doing", "done", "open"] }, person: { type: "string", description: "tên hoặc mã nhân sự" }, kind: { type: "string", enum: ["epic", "task", "sub"] }, due_from: { type: "string", description: "YYYY-MM-DD" }, due_to: { type: "string", description: "YYYY-MM-DD" }, overdue: { type: "boolean" }, q: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 300, default: 100 } } } },
  { name: "bvi_list_events", scope: ["events"], description: "Lịch công tác, sự kiện trong khoảng ngày (mặc định hôm nay đến 14 ngày tới). Có thể lọc theo người hoặc vùng.", inputSchema: { type: "object", properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" }, person: { type: "string" }, zone: { type: "string" } } } },
  { name: "bvi_list_leaves", scope: ["leaves"], description: "Lịch nghỉ của nhân sự trong khoảng ngày (mặc định 30 ngày tới), kèm trạng thái duyệt.", inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, person: { type: "string" } } } },
  { name: "bvi_list_people", scope: ["people"], description: "Danh sách nhân sự: mã, tên, vai trò, nhóm, địa bàn. Dùng để tra tên từ mã.", inputSchema: { type: "object", properties: {} } },
  { name: "bvi_list_units", scope: ["units"], description: "Danh sách công ty, khách hàng, hợp tác xã và số vùng của từng đơn vị.", inputSchema: { type: "object", properties: { q: { type: "string" } } } },
  { name: "bvi_daily_reports", scope: ["daily"], description: "Báo cáo ngày của nhân sự: đã làm, vướng, việc tiếp. Lọc theo khoảng ngày (mặc định 7 ngày qua) và người.", inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, person: { type: "string" } } } },
  { name: "bvi_list_leads", scope: ["leads"], description: "Nhu cầu khách hàng (khách quan tâm dịch vụ mã số vùng trồng, cơ sở đóng gói, FarmBase, tem QR...): nhu cầu thực tế, nguồn, người giới thiệu, người phụ trách, trạng thái chăm sóc. Không có SĐT, email. Lọc theo trạng thái (open = chưa chốt), nguồn, từ khóa.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["open", ...LEAD_ST] }, q: { type: "string", description: "Tìm theo tên, đơn vị, tỉnh, nhu cầu, người giới thiệu" }, source: { type: "string" }, since: { type: "string", description: "YYYY-MM-DD, chỉ lấy nhu cầu nhận từ ngày này" }, limit: { type: "integer", minimum: 1, maximum: 200, default: 50 } } } },
  { name: "bvi_create_lead", scope: ["leads_write"], write: true, description: "Ghi một nhu cầu khách hàng mới vào hệ thống (trạng thái Mới, nhân sự sẽ liên hệ). Cần name hoặc org, và ít nhất phone, zalo hoặc email. Chỉ dùng khi khách đã đồng ý để lại thông tin.",
    inputSchema: { type: "object", properties: { name: { type: "string", description: "Họ tên người liên hệ" }, org: { type: "string", description: "Đơn vị, HTX, công ty" }, phone: { type: "string" }, zalo: { type: "string" }, email: { type: "string" }, province: { type: "string" }, area: { type: "string", description: "Địa chỉ, xã" }, crop: { type: "string" }, ha: { type: "string", description: "Diện tích (ha)" }, needs: { type: "array", items: { type: "string" }, description: "Dịch vụ quan tâm, ví dụ Mã số vùng trồng, Cơ sở đóng gói, FarmBase, truy xuất nguồn gốc, Tem QR" }, detail: { type: "string", description: "Mô tả nhu cầu thực tế" }, source: { type: "string", description: "Nguồn: Website, Facebook, Zalo, Hội thảo, Người giới thiệu, Đối tác..." }, source_note: { type: "string" }, referrer: { type: "string", description: "Ai giới thiệu" }, external_id: { type: "string", description: "Mã bản ghi bên hệ thống gửi, để không tạo trùng" } } } },
  { name: "bvi_get_records", scope: [], description: "Đọc dữ liệu thô của một loại (zones, tasks, events, leaves, daily, units, people, faqs, supports, contracts, leads), có thể lọc updated_since. Dùng khi các công cụ khác không đủ.",
    inputSchema: { type: "object", properties: { resource: { type: "string", enum: Object.keys(RESOURCES) }, ids: { type: "array", items: { type: "string" } }, updated_since: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 500, default: 100 }, offset: { type: "integer", minimum: 0, default: 0 } }, required: ["resource"] } },
];
async function callTool(name: string, a: any, scopes: string[]) {
  const tool = TOOLS.find((t) => t.name === name); if (!tool) throw new Error("Không có công cụ " + name);
  const need = name === "bvi_get_records" ? [a.resource] : tool.scope;
  for (const s of need) if (!scopes.includes(s)) throw new Error("Khóa API này chưa có quyền " + s + " (" + (RESOURCES[s] || WRITES[s] || s) + "). Nhờ owner cấp thêm quyền.");
  if (name === "bvi_create_lead") return await createLead(a, { name: "MCP" });
  const can = (s: string) => scopes.includes(s);
  const P = can("people") ? await loadCol("people") : {};
  const td = today();
  if (name === "bvi_get_records") {
    const R = await loadCol(a.resource); let L = Object.values(R);
    if (Array.isArray(a.ids) && a.ids.length) L = L.filter((r: any) => a.ids.includes(r.id));
    if (a.updated_since) { const d = new Date(a.updated_since); if (!isNaN(+d)) L = L.filter((r: any) => r.updated_at >= d.toISOString()); }
    const off = a.offset || 0, lim = Math.min(500, a.limit || 100);
    return { resource: a.resource, total: L.length, offset: off, next_offset: off + lim < L.length ? off + lim : null, data: L.slice(off, off + lim) };
  }
  if (name === "bvi_list_leads") {
    let L: any[] = Object.values(await loadCol("leads"));
    if (a.status) L = L.filter((x: any) => a.status === "open" ? !["won", "lost"].includes(x.status) : x.status === a.status);
    if (a.source) { const n = norm(a.source); L = L.filter((x: any) => norm(x.source || "").includes(n)); }
    if (a.since) L = L.filter((x: any) => (x.received || "") >= a.since);
    if (a.q) { const n = norm(a.q); L = L.filter((x: any) => norm([x.name, x.contact_name, x.province, x.area, x.address, x.crops, x.segment, x.need_note, x.need_signal, x.referrer, (x.needs || []).join(" ")].join(" ")).includes(n)); }
    L.sort((x: any, y: any) => String(y.updated_at || "").localeCompare(String(x.updated_at || "")));
    const lim = Math.min(200, a.limit || 50), O = await ownerNames();
    return { total: L.length, leads: L.slice(0, lim).map((x: any) => ({ ...x, owner: x.owner_id ? O[x.owner_id] || null : null, owner_id: undefined })) };
  }
  if (name === "bvi_list_people") return Object.values(P).map((p: any) => ({ id: p.id, name: p.name, role: p.role, team: p.team, provinces: p.provinces, active: p.active !== false }));
  const Z = can("zones") ? await loadCol("zones") : {};
  const T = can("tasks") ? await loadCol("tasks") : {};
  const findZone = (q: string) => { if (!q) return null; if (Z[q]) return Z[q]; const n = norm(q); return Object.values(Z).find((z: any) => norm(z.name) === n) || Object.values(Z).find((z: any) => norm(z.name).includes(n) || norm(z.id).includes(n)) || null; };
  if (name === "bvi_overview") {
    const act = Object.values(Z).filter((z: any) => z.active !== false);
    const byPri: Record<string, any> = {}; act.forEach((z: any) => { const k = z.priority || "?"; (byPri[k] ||= { zones: 0, ha: 0 }); byPri[k].zones++; byPri[k].ha = +(byPri[k].ha + (+z.ha || 0)).toFixed(2); });
    const byStep: Record<string, number> = {}; act.forEach((z: any) => { const k = z.step != null ? z.step + ". " + STEP_NAMES[z.step] : "Chưa có bước"; byStep[k] = (byStep[k] || 0) + 1; });
    const out: any = { today: td, zones_active: act.length, ha_total: +act.reduce((s: number, z: any) => s + (+z.ha || 0), 0).toFixed(2), by_priority: byPri, by_step: byStep,
      zones_with_blocker: act.filter((z: any) => z.blocker && ["1", "2", "GACC"].includes(z.priority)).map((z: any) => ({ id: z.id, name: z.name, priority: z.priority, blocker: z.blocker })).slice(0, 40) };
    if (can("tasks")) { const open = Object.values(T).filter((t: any) => t.status !== "done" && t.kind !== "epic");
      out.tasks_open = open.length; out.tasks_overdue = open.filter((t: any) => t.due && t.due < td).sort((x: any, y: any) => x.due.localeCompare(y.due)).slice(0, 40).map((t: any) => taskBrief(t, P, Z, T));
      out.tasks_due_7d = open.filter((t: any) => t.due && t.due >= td && t.due <= addDays(td, 7)).sort((x: any, y: any) => x.due.localeCompare(y.due)).slice(0, 40).map((t: any) => taskBrief(t, P, Z, T)); }
    if (can("events")) { const E = await loadCol("events"); out.events_7d = Object.values(E).filter((e: any) => e.date && e.date >= td && e.date <= addDays(td, 7)).sort((x: any, y: any) => x.date.localeCompare(y.date)).map((e: any) => ({ date: e.date, end: e.end, title: e.title, kind: e.kind, lead: P[e.lead]?.name || e.lead, people: (e.people || []).map((p: string) => P[p]?.name || p) })); }
    if (can("leads")) { const LD: any[] = Object.values(await loadCol("leads")); const c = (s: string) => LD.filter((x: any) => x.status === s).length;
      out.leads = { total: LD.length, need_contact_info: LD.filter((x: any) => x.stage === 0).length, new: c("new"), in_progress: c("contact") + c("quote"), won: c("won"), lost: c("lost"),
        hot: LD.filter((x: any) => x.temp === "hot" && !["won", "lost"].includes(x.status)).length, overdue_follow_up: LD.filter((x: any) => x.next_contact && x.next_contact < td && !["won", "lost"].includes(x.status)).length }; }
    if (can("leaves")) { const L = await loadCol("leaves"); out.on_leave_7d = Object.values(L).filter((l: any) => l.status !== "rejected" && l.to >= td && l.from <= addDays(td, 7)).map((l: any) => ({ person: P[l.person]?.name || l.person, from: l.from, to: l.to, status: l.status })); }
    return out;
  }
  if (name === "bvi_search_zones") {
    const n = norm(a.q || ""); let L = Object.values(Z).filter((z: any) => a.include_inactive || z.active !== false);
    if (n) L = L.filter((z: any) => norm([z.name, z.customer, z.unit, z.ward, z.province, z.code, z.id].join(" ")).includes(n));
    if (a.priority) L = L.filter((z: any) => String(z.priority) === a.priority);
    if (a.step_min != null) L = L.filter((z: any) => z.step != null && z.step >= a.step_min);
    if (a.step_max != null) L = L.filter((z: any) => z.step != null && z.step <= a.step_max);
    if (a.has_blocker != null) L = L.filter((z: any) => !!z.blocker === a.has_blocker);
    const lim = Math.min(200, a.limit || 50);
    return { total: L.length, zones: L.slice(0, lim).map((z: any) => zoneBrief(z, P)) };
  }
  if (name === "bvi_get_zone") {
    const z: any = findZone(a.zone); if (!z) return { error: "Không thấy vùng: " + a.zone };
    const out: any = { ...zoneBrief(z, P), documents: z.hs, hard_copy: z.bc, evidence_files: z.drvStat, gates: z.gates, step_log: z.stepLog, customer_note: z.custNote || undefined };
    if (can("tasks")) out.open_tasks = Object.values(T).filter((t: any) => t.zone === z.id && t.status !== "done").sort((x: any, y: any) => (x.due || "9").localeCompare(y.due || "9")).map((t: any) => taskBrief(t, P, Z, T));
    if (can("events")) { const E = await loadCol("events"); const tids = new Set(Object.values(T).filter((t: any) => t.zone === z.id).map((t: any) => t.id));
      out.upcoming_events = Object.values(E).filter((e: any) => e.date >= td && (e.zoneId === z.id || (e.taskIds || []).some((x: string) => tids.has(x)))).map((e: any) => ({ date: e.date, title: e.title, lead: P[e.lead]?.name || e.lead })); }
    return out;
  }
  if (name === "bvi_list_tasks") {
    let L = Object.values(T);
    if (a.zone) { const z: any = findZone(a.zone); if (!z) return { error: "Không thấy vùng: " + a.zone }; L = L.filter((t: any) => t.zone === z.id); }
    if (a.status) L = L.filter((t: any) => a.status === "open" ? t.status !== "done" : t.status === a.status);
    if (a.person) { const ids = personMatch(P, a.person) || [a.person]; L = L.filter((t: any) => ids.includes(t.R) || ids.includes(t.A)); }
    if (a.kind) L = L.filter((t: any) => t.kind === a.kind);
    if (a.due_from) L = L.filter((t: any) => t.due && t.due >= a.due_from);
    if (a.due_to) L = L.filter((t: any) => t.due && t.due <= a.due_to);
    if (a.overdue) L = L.filter((t: any) => t.status !== "done" && t.due && t.due < td);
    if (a.q) { const n = norm(a.q); L = L.filter((t: any) => norm(t.title + " " + (t.note || "")).includes(n)); }
    L.sort((x: any, y: any) => (x.due || "9").localeCompare(y.due || "9"));
    const lim = Math.min(300, a.limit || 100);
    return { total: L.length, tasks: L.slice(0, lim).map((t: any) => taskBrief(t, P, Z, T)) };
  }
  if (name === "bvi_list_events") {
    const E = await loadCol("events"); const f = a.from || td, to = a.to || addDays(td, 14);
    let L = Object.values(E).filter((e: any) => e.date && (e.end || e.date) >= f && e.date <= to);
    if (a.person) { const ids = personMatch(P, a.person) || [a.person]; L = L.filter((e: any) => ids.includes(e.lead) || (e.people || []).some((p: string) => ids.includes(p))); }
    if (a.zone) { const z: any = findZone(a.zone); if (z) { const tids = new Set(Object.values(T).filter((t: any) => t.zone === z.id).map((t: any) => t.id)); L = L.filter((e: any) => e.zoneId === z.id || (e.taskIds || []).some((x: string) => tids.has(x))); } }
    return { from: f, to, events: L.sort((x: any, y: any) => x.date.localeCompare(y.date)).map((e: any) => ({ id: e.id, date: e.date, end: e.end, time: e.time, title: e.title, kind: e.kind, place: e.place, status: e.status, lead: P[e.lead]?.name || e.lead, people: (e.people || []).map((p: string) => P[p]?.name || p), purpose: e.purpose, tasks: (e.taskIds || []).map((x: string) => T[x]?.title || x) })) };
  }
  if (name === "bvi_list_leaves") {
    const L0 = await loadCol("leaves"); const f = a.from || td, to = a.to || addDays(td, 30);
    let L = Object.values(L0).filter((l: any) => l.to >= f && l.from <= to);
    if (a.person) { const ids = personMatch(P, a.person) || [a.person]; L = L.filter((l: any) => ids.includes(l.person)); }
    return { from: f, to, leaves: L.map((l: any) => ({ person: P[l.person]?.name || l.person, from: l.from, from_session: l.fromSes, to: l.to, to_session: l.toSes, status: l.status, type: l.type, handover: l.handover })) };
  }
  if (name === "bvi_list_units") {
    const U = await loadCol("units"); const n = norm(a.q || "");
    return Object.values(U).filter((u: any) => !n || norm(u.name + " " + (u.legal || "")).includes(n)).map((u: any) => ({ id: u.id, name: u.name, legal: u.legal, type: u.type, province: u.province, zones: Object.values(Z).filter((z: any) => z.unitId === u.id && z.active !== false).length }));
  }
  if (name === "bvi_daily_reports") {
    const D = await loadCol("daily"); const f = a.from || addDays(td, -7), to = a.to || td;
    let L = Object.values(D).filter((r: any) => r.date >= f && r.date <= to);
    if (a.person) { const ids = personMatch(P, a.person) || [a.person]; L = L.filter((r: any) => ids.includes(r.person)); }
    return { from: f, to, reports: L.sort((x: any, y: any) => y.date.localeCompare(x.date)).map((r: any) => ({ date: r.date, person: P[r.person]?.name || r.person, done: r.done, blocked: r.block, next: r.next, location: r.loc })) };
  }
  throw new Error("Không có công cụ " + name);
}
const MCP_INSTR = "Máy chủ dữ liệu điều hành của Công ty CP BVI, chủ yếu chỉ đọc: vùng trồng (mã số vùng trồng sầu riêng xuất khẩu Trung Quốc), công việc, lịch công tác, lịch nghỉ, báo cáo ngày, nhu cầu khách hàng. Khóa có quyền leads_write thì ghi được nhu cầu khách hàng mới bằng bvi_create_lead. Bước tiến độ vùng 0-8: " + STEP_NAMES.map((s, i) => i + " " + s).join("; ") + ". Ưu tiên: 1, 2, 3, GACC (đã có mã nội địa). Ngày dạng YYYY-MM-DD, giờ Việt Nam. Bắt đầu bằng bvi_overview. Không có CCCD, sổ đỏ, số điện thoại, số tiền.";
async function handleMcp(req: Request, keyInPath: string | null) {
  if (req.method === "GET") return json({ error: "method_not_allowed", message: "MCP dùng POST (Streamable HTTP)" }, 405, { Allow: "POST" });
  if (req.method === "DELETE") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const u = new globalThis.URL(req.url);
  const a = await authKey(req, keyInPath || u.searchParams.get("key"));
  if ("resp" in a) { const b = await a.resp.clone().json().catch(() => ({})); return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: b.message || b.error || "unauthorized" } }, a.resp.status); }
  const scopes: string[] = a.m.scopes || [];
  let body: any; try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
  const one = async (msg: any) => {
    const id = msg?.id ?? null; const method = msg?.method;
    if (id === null || id === undefined) return null; // notification
    try {
      if (method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: ["2025-06-18", "2025-03-26", "2024-11-05"].includes(msg.params?.protocolVersion) ? msg.params.protocolVersion : "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "bvi-dieu-hanh", title: "BVI Điều hành", version: "1.1.0" }, instructions: MCP_INSTR + " Khóa: " + a.m.name + ". Quyền: " + scopes.join(", ") + "." } };
      if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
      if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS.filter((t) => t.scope.every((s) => scopes.includes(s))).map(({ name, description, inputSchema, write }: any) => ({ name, description, inputSchema, annotations: write ? { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } : { readOnlyHint: true, openWorldHint: false } })) } };
      if (method === "tools/call") {
        try { const r = await callTool(msg.params?.name, msg.params?.arguments || {}, scopes); return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(r) }], isError: !!(r as any)?.error } }; }
        catch (e) { return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: String((e as Error).message || e) }], isError: true } }; }
      }
      if (method === "resources/list") return { jsonrpc: "2.0", id, result: { resources: [] } };
      if (method === "prompts/list") return { jsonrpc: "2.0", id, result: { prompts: [] } };
      return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + method } };
    } catch (e) { return { jsonrpc: "2.0", id, error: { code: -32603, message: "Internal error" } }; }
  };
  if (Array.isArray(body)) { const r = (await Promise.all(body.map(one))).filter(Boolean); return r.length ? json(r) : new Response(null, { status: 202, headers: cors }); }
  const r = await one(body); return r ? json(r) : new Response(null, { status: 202, headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const p = new globalThis.URL(req.url).pathname.split("/").filter(Boolean);
    const i = p.indexOf("api"); const rest = i >= 0 ? p.slice(i + 1) : p;
    if (rest[0] === "admin") return await handleAdmin(req);
    if (rest[0] === "fb") return await handleFbView(req);
    if (rest[0] === "goals") return await handleGoals(req);
    if (rest[0] === "v1") return await handleData(req, rest.slice(1));
    if (rest[0] === "mcp") return await handleMcp(req, rest[1] || null);
    return json({ name: "BVI Điều hành API", docs: "Dùng /v1 với header X-API-Key" });
  } catch (_) { return json({ error: "server_error" }, 500); }
});
