import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Cầu nối giữa web BVI Điều hành và Google Drive (qua Apps Script chạy bằng tài khoản chủ thư mục).
// Không tin ID thư mục do trình duyệt gửi: luôn tra từ bảng docs theo mã vùng + loại thư mục.
const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GAS_URL = Deno.env.get("DRIVE_GAS_URL") || "";
const GAS_TOKEN = Deno.env.get("DRIVE_GAS_TOKEN") || "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SCAN_KEYS = ["hs01_ky", "hs01_scan", "hs01_anh", "tq_ky", "tq_scan", "tq_anh", "cccd", "sodo", "fly", "kho", "bay", "thu"];
const KEYS = ["hs01_ky", "hs01_scan", "hs01_anh", "tq_ky", "tq_scan", "tq_anh", "cccd", "sodo", "fly", "kho", "bay", "thu", "hs01", "tq", "img", "root"];
const UPLOAD_KEYS = KEYS.filter((k) => !["root", "hs01", "tq", "img"].includes(k));
const MAX_B64 = 28 * 1024 * 1024; // khoảng 20 MB file gốc

async function gas(body: Record<string, unknown>) {
  if (!GAS_URL || !GAS_TOKEN) return { error: "not_configured" };
  const r = await fetch(GAS_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...body, token: GAS_TOKEN }), redirect: "follow" });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { error: "gas_bad_response", status: r.status }; }
}
function cleanName(s: string) {
  return String(s || "file").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 140) || "file";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(token);
  if (!who?.user) return json({ error: "not_signed_in" }, 401);
  const { data: me } = await admin.from("profiles").select("id,role,active,name,email").eq("id", who.user.id).single();
  if (!me || !me.active || !["owner", "manager", "staff"].includes(me.role)) return json({ error: "no_permission" }, 403);
  const mgr = me.role === "owner" || me.role === "manager";
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const act = body?.action;
  if (act === "ping") { const r = await gas({ action: "ping" }); return json(r); }

  const zoneDoc = async (id: string) => {
    const { data } = await admin.from("docs").select("id,data").eq("col", "zones").eq("id", id).single();
    return data as { id: string; data: any } | null;
  };

  if (act === "upload") {
    const key = String(body.key || "");
    if (!UPLOAD_KEYS.includes(key)) return json({ error: "bad_folder" }, 400);
    const z = await zoneDoc(String(body.zone || ""));
    const fid = z?.data?.drv?.[key];
    if (!fid) return json({ error: "no_folder" }, 404);
    const data = String(body.data || "");
    if (!data || data.length > MAX_B64) return json({ error: "too_big" }, 413);
    const d = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const name = d + "_" + cleanName(body.name);
    const r = await gas({ action: "upload", folderId: fid, name, mime: String(body.mime || "application/octet-stream").slice(0, 100), data });
    if (r?.error) return json(r, 502);
    return json({ ok: true, id: r.id, url: r.url });
  }

  if (act === "scan") {
    // đếm số file trong từng thư mục của một vùng, hoặc mọi vùng (quản lý)
    let rows: { id: string; data: any }[] = [];
    if (Array.isArray(body.zones) && body.zones.length) {
      const want = body.zones.map(String).slice(0, 8);
      const { data } = await admin.from("docs").select("id,data").eq("col", "zones").in("id", want); rows = (data || []) as any;
    }
    else if (body.zone) { const z = await zoneDoc(String(body.zone)); if (z) rows = [z]; }
    else if (body.list) { const { data } = await admin.from("docs").select("id,data").eq("col", "zones"); return json({ ok: true, ids: ((data || []) as any[]).filter((r) => r.data?.drv).map((r) => r.id) }); }
    else if (mgr) { const { data } = await admin.from("docs").select("id,data").eq("col", "zones"); rows = (data || []) as any; }
    else return json({ error: "manager_only" }, 403);
    rows = rows.filter((r) => r.data?.drv);
    // chia 4 vùng mỗi lần gọi Apps Script và gọi song song, để không vượt 150 giây của máy chủ
    const chunks: string[][] = [];
    for (let i = 0; i < rows.length; i += 4) {
      const ids: string[] = [];
      rows.slice(i, i + 4).forEach((r) => SCAN_KEYS.forEach((k) => { const v = r.data.drv[k]; if (v) ids.push(v); }));
      if (ids.length) chunks.push(ids);
    }
    if (!chunks.length) return json({ ok: true, zones: {} });
    const res = await Promise.all(chunks.map((ids) => gas({ action: "stats", ids }).catch(() => ({ error: "gas_fetch" }))));
    const ok = res.filter((x: any) => !x?.error);
    if (!ok.length) return json(res[0], 502);
    const r: any = { counts: Object.assign({}, ...ok.map((x: any) => x.counts || {})), deep: ok.every((x: any) => x.deep) };
    const out: Record<string, Record<string, number>> = {};
    rows.forEach((z) => { const m: Record<string, number> = {}; SCAN_KEYS.forEach((k) => { const v = z.data.drv[k]; if (v && typeof r.counts?.[v] === "number") m[k] = r.counts[v]; }); if (Object.keys(m).length) out[z.id] = m; });
    return json({ ok: true, zones: out, at: new Date().toISOString(), deep: !!r.deep });
  }

  if (act === "rename") {
    if (!mgr) return json({ error: "manager_only" }, 403);
    const z = await zoneDoc(String(body.zone || ""));
    const fid = z?.data?.drv?.root;
    if (!fid) return json({ error: "no_folder" }, 404);
    const r = await gas({ action: "rename", folderId: fid, name: cleanName(z!.data.name) });
    if (r?.error) return json(r, 502);
    return json({ ok: true, name: r.name });
  }

  if (act === "ensure") {
    if (!mgr) return json({ error: "manager_only" }, 403);
    const z = await zoneDoc(String(body.zone || ""));
    if (!z) return json({ error: "no_zone" }, 404);
    const have = { ...(z.data.drv || {}) };
    if (have.thu && !have.thung) have.thung = have.thu; // Code.gs cũ còn tên khóa thung
    const r = await gas({ action: "ensure", name: cleanName(z.data.name), code: body.code ? cleanName(String(body.code)).slice(0, 12) : "", have });
    if (r?.error) return json(r, 502);
    const drv = { ...(r.drv || {}) };
    if (drv.thung && !drv.thu) drv.thu = drv.thung;
    delete drv.thung;
    return json({ ok: true, drv });
  }
  return json({ error: "unknown_action" }, 400);
});
