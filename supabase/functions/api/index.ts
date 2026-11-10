// BVI Điều hành: API cho bên thứ 3. Chủ yếu chỉ đọc; riêng nhu cầu khách hàng có thể gửi vào (quyền leads_write).
// Dữ liệu: GET /functions/v1/api/v1/<resource>[/<id>]  header  X-API-Key: bvi_...
// Gửi nhu cầu khách hàng: POST /functions/v1/api/v1/leads  (một bản ghi, hoặc {"leads":[...]} tối đa 100)
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
  supports: "Yêu cầu hỗ trợ", contracts: "Hợp đồng (không có số tiền)", leads: "Nhu cầu khách hàng (che SĐT, email)",
};
// quyền ghi: không phải loại dữ liệu đọc được
export const WRITES: Record<string, string> = { leads_write: "Gửi nhu cầu khách hàng (chỉ ghi)" };
// loại dữ liệu ảo: nhu cầu khách hàng nằm trong docs loại contacts với type = "lead"
const COL_OF: Record<string, string> = { leads: "contacts" };
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
  if (col === "zones") { delete x.drv; delete x.ownerNote; }
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

// ---- tạo nhu cầu khách hàng từ hệ thống khác (form web, Zapier, Apps Script, AI qua MCP) ----
const LEAD_ST = ["new", "contact", "quote", "won", "lost"];
const str = (v: unknown, n = 300) => (v === undefined || v === null ? "" : String(v)).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, n);
async function createLead(x: any, m: any): Promise<any> {
  if (!x || typeof x !== "object") return { ok: false, error: "bad_lead", message: "Mỗi nhu cầu là một object JSON" };
  const needs = (Array.isArray(x.needs) ? x.needs : typeof x.needs === "string" ? x.needs.split(/[,;]/) : []).map((s: unknown) => str(s, 80)).filter(Boolean).slice(0, 10);
  const now = new Date().toISOString();
  const d: Record<string, unknown> = {
    type: "lead", status: "new", needs,
    name: str(x.name, 120), org: str(x.org ?? x.company, 160), phone: str(x.phone, 40), zalo: str(x.zalo, 40), email: str(x.email, 160),
    province: str(x.province, 80), area: str(x.area ?? x.address, 200), crop: str(x.crop, 80), ha: str(x.ha ?? x.area_ha, 20),
    detail: str(x.detail ?? x.message ?? x.need, 4000), source: str(x.source, 80) || "Hệ thống khác (form, API)", sourceNote: str(x.source_note ?? x.sourceNote, 300),
    referrer: str(x.referrer ?? x.referred_by, 160), note: str(x.note, 2000), extId: str(x.external_id ?? x.id, 120),
    via: "api:" + str(m.name, 80), createdAt: now, at: now, hist: [{ at: now, by: "", s: "new" }],
  };
  if (!d.name && !d.org) return { ok: false, error: "missing_name", message: "Cần name (họ tên) hoặc org (đơn vị)" };
  if (!d.phone && !d.zalo && !d.email) return { ok: false, error: "missing_contact", message: "Cần ít nhất phone, zalo hoặc email" };
  // trùng mã ngoài: không tạo lại
  if (d.extId) {
    const { data: ex } = await db.from("docs").select("id").eq("col", "contacts").eq("data->>type", "lead").eq("data->>extId", d.extId as string).limit(1);
    if (ex && ex.length) return { ok: true, id: ex[0].id, duplicate: true };
  }
  const id = "ld" + Date.now().toString(36) + crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 5);
  const { error } = await db.from("docs").insert({ col: "contacts", id, data: d });
  if (error) return { ok: false, error: "server_error" };
  return { ok: true, id, status: "new" };
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
  if (req.method !== "GET") return json({ error: "method_not_allowed", message: "API chỉ đọc, dùng GET (riêng POST /v1/leads để gửi nhu cầu khách hàng)" }, 405);
  const a = await authKey(req, null);
  if ("resp" in a) return a.resp;
  const m = a.m;

  if (!res) return json({ name: "BVI Điều hành API", version: "v1", key: m.name,
    resources: (m.scopes as string[]).filter((s) => RESOURCES[s]).map((s) => ({ id: s, label: RESOURCES[s], path: "/v1/" + s })),
    write: (m.scopes as string[]).filter((s) => WRITES[s]).map((s) => ({ id: s, label: WRITES[s], method: "POST", path: "/v1/leads" })),
    params: { updated_since: "ISO 8601, chỉ lấy bản ghi sửa từ thời điểm này", limit: "1-1000, mặc định 500", offset: "bỏ qua N bản ghi đầu" } });
  if (!RESOURCES[res]) return json({ error: "unknown_resource", resources: Object.keys(RESOURCES) }, 404);
  if (!(m.scopes as string[]).includes(res)) return json({ error: "forbidden_resource", message: "Khóa này không được đọc " + res }, 403);
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
    const L0 = await loadCol("leads"); let L = Object.values(L0);
    if (a.status) L = L.filter((x: any) => a.status === "open" ? !["won", "lost"].includes(x.status || "new") : (x.status || "new") === a.status);
    if (a.source) { const n = norm(a.source); L = L.filter((x: any) => norm(x.source || "").includes(n)); }
    if (a.since) L = L.filter((x: any) => (x.createdAt || "") >= a.since);
    if (a.q) { const n = norm(a.q); L = L.filter((x: any) => norm([x.name, x.org, x.province, x.area, x.crop, x.detail, x.referrer, x.sourceNote, (x.needs || []).join(" ")].join(" ")).includes(n)); }
    L.sort((x: any, y: any) => (y.createdAt || "").localeCompare(x.createdAt || ""));
    const lim = Math.min(200, a.limit || 50);
    const ST: Record<string, string> = { new: "Mới", contact: "Đã liên hệ", quote: "Đã báo giá", won: "Đã ký", lost: "Không theo" };
    return { total: L.length, leads: L.slice(0, lim).map((x: any) => ({ id: x.id, name: x.name, org: x.org, province: x.province, area: x.area, crop: x.crop, ha: x.ha, needs: x.needs, detail: x.detail, source: x.source, source_note: x.sourceNote, referrer: x.referrer, status: ST[x.status || "new"] || x.status, owner: P[x.owner]?.name || x.owner || null, next_contact: x.next || null, received: (x.createdAt || "").slice(0, 10), via: x.via })) };
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
    if (can("leads")) { const LD = Object.values(await loadCol("leads")); const c = (s: string) => LD.filter((x: any) => (x.status || "new") === s).length;
      out.leads = { total: LD.length, new: c("new"), in_progress: c("contact") + c("quote"), won: c("won"), lost: c("lost"), overdue_follow_up: LD.filter((x: any) => x.next && x.next < td && !["won", "lost"].includes(x.status || "new")).length }; }
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
    if (rest[0] === "v1") return await handleData(req, rest.slice(1));
    if (rest[0] === "mcp") return await handleMcp(req, rest[1] || null);
    return json({ name: "BVI Điều hành API", docs: "Dùng /v1 với header X-API-Key" });
  } catch (_) { return json({ error: "server_error" }, 500); }
});
