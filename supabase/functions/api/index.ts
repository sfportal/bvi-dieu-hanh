// BVI Điều hành: API chỉ đọc cho bên thứ 3.
// Dữ liệu: GET /functions/v1/api/v1/<resource>[/<id>]  header  X-API-Key: bvi_...
// Quản lý khóa: POST /functions/v1/api/admin  (JWT của owner)
// Khóa chỉ lưu dạng SHA-256 trong bảng app_secrets (chỉ service role đọc được).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...extra } });

export const RESOURCES: Record<string, string> = {
  zones: "Vùng trồng", tasks: "Công việc", events: "Lịch công tác", leaves: "Lịch nghỉ",
  daily: "Báo cáo ngày", units: "Công ty, khách hàng", people: "Nhân sự", faqs: "Hỏi đáp",
  supports: "Yêu cầu hỗ trợ", contracts: "Hợp đồng (không có số tiền)",
};
const PFX = "apikey:";
const USE = "apiuse:";

// ---- làm sạch dữ liệu: không bao giờ trả CCCD, sổ đỏ, SĐT, số tiền, link Drive ----
const DENY = new Set(["phone", "sdt", "tel", "mobile", "zalo", "email", "price", "amount", "total", "money", "cost", "chiphi",
  "value", "paid", "paidat", "fee", "cccdno", "cccd_no", "idno", "cmnd", "sodono", "gcn", "bank", "bankaccount", "link", "url", "holder"]);
function scrub(v: unknown, depth = 0): unknown {
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
  if (col === "people") { delete x.canLeave; delete x.canPlan; }
  return scrub(x) as Record<string, unknown>;
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
  const scopesOf = (s: unknown) => (Array.isArray(s) ? s.filter((x) => typeof x === "string" && RESOURCES[x]) : []);
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

async function handleData(req: Request, parts: string[]) {
  if (req.method !== "GET") return json({ error: "method_not_allowed", message: "API chỉ đọc, dùng GET" }, 405);
  const raw = req.headers.get("x-api-key") || (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!/^bvi_[A-Za-z0-9]{40}$/.test(raw)) return json({ error: "missing_api_key", message: "Gửi khóa trong header X-API-Key" }, 401);
  const k = PFX + await sha256(raw);
  const { data: rec } = await db.from("app_secrets").select("v").eq("k", k).maybeSingle();
  if (!rec) return json({ error: "invalid_api_key" }, 401);
  const m = JSON.parse(rec.v as string);
  if (m.revoked_at) return json({ error: "revoked_api_key" }, 401);
  if (m.expires_at && new Date(m.expires_at) < new Date()) return json({ error: "expired_api_key" }, 401);
  if (limited(m.id)) return json({ error: "rate_limited", message: "Tối đa 120 lượt mỗi phút" }, 429, { "Retry-After": "60" });
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

  const [res, id] = parts;
  if (!res) return json({ name: "BVI Điều hành API", version: "v1", key: m.name,
    resources: (m.scopes as string[]).map((s) => ({ id: s, label: RESOURCES[s], path: "/v1/" + s })),
    params: { updated_since: "ISO 8601, chỉ lấy bản ghi sửa từ thời điểm này", limit: "1-1000, mặc định 500", offset: "bỏ qua N bản ghi đầu" } });
  if (!RESOURCES[res]) return json({ error: "unknown_resource", resources: Object.keys(RESOURCES) }, 404);
  if (!(m.scopes as string[]).includes(res)) return json({ error: "forbidden_resource", message: "Khóa này không được đọc " + res }, 403);
  if (id) {
    const { data, error } = await db.from("docs").select("id,data,updated_at").eq("col", res).eq("id", id).maybeSingle();
    if (error) return json({ error: "server_error" }, 500);
    if (!data) return json({ error: "not_found" }, 404);
    return json({ data: { id: data.id, updated_at: data.updated_at, ...clean(res, data.data) } });
  }
  const u = new globalThis.URL(req.url);
  const limit = Math.min(1000, Math.max(1, Number(u.searchParams.get("limit")) || 500));
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  let q = db.from("docs").select("id,data,updated_at", { count: "exact" }).eq("col", res).order("id").range(offset, offset + limit - 1);
  const since = u.searchParams.get("updated_since");
  if (since) { const d = new Date(since); if (isNaN(+d)) return json({ error: "bad_updated_since" }, 400); q = q.gte("updated_at", d.toISOString()); }
  const { data, count, error } = await q;
  if (error) return json({ error: "server_error" }, 500);
  const rows = (data || []).map((r) => ({ id: r.id, updated_at: r.updated_at, ...clean(res, r.data) }));
  const next = offset + rows.length < (count || 0) ? offset + rows.length : null;
  return json({ resource: res, total: count, offset, limit, next_offset: next, data: rows });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const p = new globalThis.URL(req.url).pathname.split("/").filter(Boolean);
    const i = p.indexOf("api"); const rest = i >= 0 ? p.slice(i + 1) : p;
    if (rest[0] === "admin") return await handleAdmin(req);
    if (rest[0] === "v1") return await handleData(req, rest.slice(1));
    return json({ name: "BVI Điều hành API", docs: "Dùng /v1 với header X-API-Key" });
  } catch (_) { return json({ error: "server_error" }, 500); }
});
