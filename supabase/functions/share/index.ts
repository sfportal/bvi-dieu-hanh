// BVI Điều hành: link báo cáo tiến độ công khai cho khách.
// GET  /functions/v1/share?t=<token>  -> bản đã phát hành (không cần đăng nhập)
// POST /functions/v1/share  {action: drafts|draft_save} -> nhân sự soạn bản nháp; {action: publish|revoke|list} -> chỉ owner, quản lý (JWT)
// Bản phát hành lưu trong app_secrets (chỉ service role đọc), nhân sự chỉ sửa được bản nháp.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...extra } });
const PFX = "share:", VIEW = "shareview:", DRAFT = "sharedraft:";

// Lưới an toàn: xóa chuỗi số dài (SĐT, CCCD, số sổ đỏ) và mọi khóa nhạy cảm còn sót trong bản gửi khách.
const DENY = new Set(["phone", "sdt", "tel", "email", "cccd", "price", "amount", "cost", "chiphi", "link", "url", "drv", "owner", "by"]);
export function safe(v: unknown, d = 0): unknown {
  if (typeof v === "string") return v.replace(/(?:\+?84)?\d(?:[\s.\-]?\d){8,}/g, "•••").slice(0, 4000);
  if (d > 6 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.slice(0, 500).map((x) => safe(x, d + 1));
  const o: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (!DENY.has(k.toLowerCase())) o[k] = safe(x, d + 1);
  return o;
}
function token() {
  const a = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(22)), (x) => a[x % a.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method === "GET") {
      const t = new URL(req.url).searchParams.get("t") || "";
      if (!/^[A-Za-z0-9]{22}$/.test(t)) return json({ error: "not_found" }, 404);
      const { data } = await db.from("app_secrets").select("v").eq("k", PFX + t).maybeSingle();
      if (!data) return json({ error: "not_found" }, 404);
      const rec = JSON.parse(data.v as string);
      const bump = (async () => {
        const { data: v0 } = await db.from("app_secrets").select("v").eq("k", VIEW + t).maybeSingle();
        const v = v0 ? JSON.parse(v0.v as string) : { n: 0 };
        v.n = (v.n || 0) + 1; v.last = new Date().toISOString();
        await db.from("app_secrets").upsert({ k: VIEW + t, v: JSON.stringify(v) });
      })().catch(() => {});
      (globalThis as any).EdgeRuntime?.waitUntil?.(bump);
      return json({ snap: rec.snap, publishedAt: rec.at }, 200, { "Cache-Control": "no-store" });
    }
    if (req.method !== "POST") return json({ error: "method" }, 405);
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: who } = await db.auth.getUser(jwt);
    if (!who?.user) return json({ error: "not_signed_in" }, 401);
    const { data: me } = await db.from("profiles").select("*").eq("id", who.user.id).single();
    if (!me || !me.active || !["owner", "manager", "staff"].includes(me.role)) return json({ error: "no_permission" }, 403);
    let body: any; try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
    // Bản nháp: mọi nhân sự soạn được (lưu ở đây vì bảng docs không nhận loại "shares").
    if (body.action === "drafts") {
      const { data } = await db.from("app_secrets").select("k,v").like("k", DRAFT + "%").limit(2000);
      const out: Record<string, unknown> = {};
      for (const r of data || []) { try { out[(r.k as string).slice(DRAFT.length)] = JSON.parse(r.v as string); } catch (_) { /* bỏ qua */ } }
      return json({ drafts: out });
    }
    if (body.action === "draft_save") {
      const key = String(body.key || "").slice(0, 200);
      if (!/^d_[\w-]+$/.test(key) || !body.data || typeof body.data !== "object") return json({ error: "bad_request" }, 400);
      const { data: old } = await db.from("app_secrets").select("v").eq("k", DRAFT + key).maybeSingle();
      const prev = old ? JSON.parse(old.v as string) : {};
      const d = { ...body.data, token: prev.token || "", pubAt: prev.pubAt || "", pubBy: prev.pubBy || "", updatedAt: new Date().toISOString(), updatedBy: me.person_id || me.name || "" };
      const s = JSON.stringify(d); if (s.length > 400000) return json({ error: "too_large" }, 400);
      await db.from("app_secrets").upsert({ k: DRAFT + key, v: s });
      return json({ ok: true, draft: d });
    }
    if (!["owner", "manager"].includes(me.role)) return json({ error: "manager_only" }, 403);
    const setPub = async (key: string, token: string, at: string, by: string) => {
      const { data: old } = await db.from("app_secrets").select("v").eq("k", DRAFT + key).maybeSingle();
      const d = old ? JSON.parse(old.v as string) : {};
      Object.assign(d, { token, pubAt: at, pubBy: by });
      await db.from("app_secrets").upsert({ k: DRAFT + key, v: JSON.stringify(d) });
      return d;
    };
    const log = async (action: string, title: string, summary: string, id: string) => {
      try { await db.from("activity_log").insert({ user_id: me.id, email: me.email, name: me.name || me.email, action, col: "shares", doc_id: id, title, summary }); } catch (_) { /* không chặn */ }
    };
    if (body.action === "publish") {
      const key = String(body.key || "").slice(0, 200);
      if (!key || !body.snap || typeof body.snap !== "object") return json({ error: "bad_request" }, 400);
      let t = typeof body.token === "string" && /^[A-Za-z0-9]{22}$/.test(body.token) ? body.token : "";
      if (t) { const { data: old } = await db.from("app_secrets").select("v").eq("k", PFX + t).maybeSingle(); if (!old || JSON.parse(old.v as string).key !== key) t = ""; }
      const fresh = !t; if (!t) t = token();
      const rec = { key, at: new Date().toISOString(), by: me.name || me.email, snap: safe(body.snap) };
      const s = JSON.stringify(rec); if (s.length > 900000) return json({ error: "too_large" }, 400);
      const { error } = await db.from("app_secrets").upsert({ k: PFX + t, v: s });
      if (error) return json({ error: error.message }, 400);
      const title = String((body.snap as any).legal || key).slice(0, 120);
      await log(fresh ? "create" : "update", title, (fresh ? "phát hành link báo cáo cho khách" : "cập nhật bản phát hành báo cáo cho khách"), key);
      const draft = await setPub(key, t, rec.at, rec.by);
      return json({ ok: true, token: t, at: rec.at, by: rec.by, draft });
    }
    if (body.action === "revoke") {
      const t = String(body.token || "");
      const { data: old } = await db.from("app_secrets").select("v").eq("k", PFX + t).maybeSingle();
      const k0 = String(body.key || "").slice(0, 200);
      if (!old) return json({ ok: true, draft: /^d_[\w-]+$/.test(k0) ? await setPub(k0, "", "", "") : null });
      const rec = JSON.parse(old.v as string);
      await db.from("app_secrets").delete().eq("k", PFX + t);
      await db.from("app_secrets").delete().eq("k", VIEW + t);
      await log("delete", String(rec.snap?.legal || rec.key).slice(0, 120), "thu hồi link báo cáo cho khách", rec.key);
      return json({ ok: true, draft: await setPub(rec.key, "", "", "") });
    }
    if (body.action === "list") {
      const { data } = await db.from("app_secrets").select("k,v").like("k", PFX + "%");
      const { data: vs } = await db.from("app_secrets").select("k,v").like("k", VIEW + "%");
      const views: Record<string, any> = {}; (vs || []).forEach((r) => (views[(r.k as string).slice(VIEW.length)] = JSON.parse(r.v as string)));
      return json({ shares: (data || []).map((r) => { const t = (r.k as string).slice(PFX.length); const m = JSON.parse(r.v as string); return { token: t, key: m.key, at: m.at, by: m.by, legal: m.snap?.legal || "", views: views[t]?.n || 0, lastView: views[t]?.last || null }; }) });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (_) { return json({ error: "server_error" }, 500); }
});
