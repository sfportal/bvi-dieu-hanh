import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const OWNER_EMAIL = "minhducuy@gmail.com";
const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const ROLES = ["owner", "manager", "staff", "viewer"];
function tempPw() {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint32Array(10));
  return "Bvi-" + Array.from(r, (x) => a[x % a.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const act = body?.action;

  // one-time bootstrap of the owner account
  if (act === "bootstrap") {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "owner");
    if ((count ?? 0) > 0) return json({ error: "already_bootstrapped" }, 403);
    const code = String(body.code || "").trim().toUpperCase();
    const pw = String(body.password || "");
    if (pw.length < 8) return json({ error: "Mật khẩu cần ít nhất 8 ký tự" }, 400);
    const { data: sec } = await admin.from("app_secrets").select("v").eq("k", "bootstrap_sha256").single();
    const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)))).map((x) => x.toString(16).padStart(2, "0")).join("");
    if (!sec || h !== sec.v) return json({ error: "Mã khởi tạo không đúng" }, 403);
    const { data, error } = await admin.auth.admin.createUser({ email: OWNER_EMAIL, password: pw, email_confirm: true });
    if (error) return json({ error: error.message }, 400);
    await admin.from("profiles").insert({ id: data.user.id, email: OWNER_EMAIL, name: "Anh Uy", person_id: "tai", role: "owner", can_finance: true, must_change_pw: false });
    await admin.from("app_secrets").delete().eq("k", "bootstrap_sha256");
    return json({ ok: true, email: OWNER_EMAIL });
  }

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(token);
  if (!who?.user) return json({ error: "not_signed_in" }, 401);
  const { data: me } = await admin.from("profiles").select("*").eq("id", who.user.id).single();
  if (!me || !me.active || me.role !== "owner") return json({ error: "owner_only" }, 403);
  const RL: Record<string, string> = { owner: "Owner", manager: "Quản lý", staff: "Nhân viên", viewer: "Chỉ xem" };
  const log = async (summary: string, title: string, docId: string | null) => {
    try { await admin.from("activity_log").insert({ user_id: me.id, email: me.email, name: me.name || me.email, action: "account", col: "accounts", doc_id: docId, title, summary }); } catch (_) { /* nhật ký lỗi không chặn thao tác */ }
  };

  if (act === "list") {
    const { data, error } = await admin.from("profiles").select("*").order("created_at");
    if (error) return json({ error: error.message }, 400);
    const { data: au } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const last: Record<string, string | null> = {};
    (au?.users || []).forEach((u) => (last[u.id] = u.last_sign_in_at ?? null));
    return json({ users: (data || []).map((p) => ({ ...p, last_sign_in_at: last[p.id] ?? null })) });
  }
  if (act === "create") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Email không hợp lệ" }, 400);
    const role = ROLES.includes(body.role) && body.role !== "owner" ? body.role : "staff";
    const pw = body.password && String(body.password).length >= 8 ? String(body.password) : tempPw();
    const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (error) return json({ error: error.message }, 400);
    const { error: e2 } = await admin.from("profiles").insert({ id: data.user.id, email, name: String(body.name || ""), person_id: body.person_id || null, role, can_finance: !!body.can_finance, must_change_pw: true });
    if (e2) { await admin.auth.admin.deleteUser(data.user.id); return json({ error: e2.message }, 400); }
    await log("tạo tài khoản, vai trò " + RL[role] + (body.can_finance ? ", được xem tài chính" : ""), email, data.user.id);
    return json({ ok: true, id: data.user.id, email, password: pw });
  }
  const id = String(body.id || "");
  const { data: target } = await admin.from("profiles").select("*").eq("id", id).single();
  if (!target) return json({ error: "Không thấy tài khoản" }, 404);
  const self = target.id === me.id;

  if (act === "update") {
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") patch.name = body.name;
    if ("person_id" in body) patch.person_id = body.person_id || null;
    if (!self) {
      if (ROLES.includes(body.role)) patch.role = body.role;
      if (typeof body.can_finance === "boolean") patch.can_finance = body.can_finance;
    }
    const { error } = await admin.from("profiles").update(patch).eq("id", id);
    if (error) return json({ error: error.message }, 400);
    const ch: string[] = [];
    if ("role" in patch && patch.role !== target.role) ch.push("vai trò: " + RL[target.role] + " → " + RL[String(patch.role)]);
    if ("can_finance" in patch && patch.can_finance !== target.can_finance) ch.push(patch.can_finance ? "bật quyền xem tài chính" : "tắt quyền xem tài chính");
    if ("name" in patch && patch.name !== target.name) ch.push("sửa tên hiển thị");
    if ("person_id" in patch && patch.person_id !== target.person_id) ch.push("đổi nhân sự gắn với tài khoản");
    if (ch.length) await log(ch.join("; "), target.email, id);
    return json({ ok: true });
  }
  if (act === "set_active") {
    if (self) return json({ error: "Không tự khóa tài khoản owner" }, 400);
    const on = !!body.active;
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: on ? "none" : "876000h" });
    if (error) return json({ error: error.message }, 400);
    await admin.from("profiles").update({ active: on }).eq("id", id);
    await log(on ? "mở khóa tài khoản" : "khóa tài khoản", target.email, id);
    return json({ ok: true });
  }
  if (act === "reset_password") {
    const pw = body.password && String(body.password).length >= 8 ? String(body.password) : tempPw();
    const { error } = await admin.auth.admin.updateUserById(id, { password: pw });
    if (error) return json({ error: error.message }, 400);
    await admin.from("profiles").update({ must_change_pw: !self }).eq("id", id);
    await log("đặt lại mật khẩu", target.email, id);
    return json({ ok: true, password: pw });
  }
  if (act === "delete") {
    if (self) return json({ error: "Không xóa tài khoản owner đang dùng" }, 400);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return json({ error: error.message }, 400);
    await log("xóa tài khoản", target.email, id);
    return json({ ok: true });
  }
  return json({ error: "unknown_action" }, 400);
});
