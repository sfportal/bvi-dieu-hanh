// BVI Điều hành: phiếu tự đánh giá nhân sự (công việc hiện tại, năng lực theo 8 đầu việc, định hướng).
// POST /functions/v1/danh-gia (JWT) {action: get|save|list|note}
// Mỗi tài khoản gắn nhân sự chỉ đọc, ghi phiếu của mình. Chỉ owner xem tất cả và ghi nhận xét.
// Phiếu lưu trong app_secrets (chỉ service role đọc): "dg:<đợt>:<person_id>", nhận xét owner "dgn:<đợt>:<person_id>".
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
const ROUND = "2026-11";
const str = (v: unknown, n = 1500) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const sc = (v: unknown) => { const n = Math.round(Number(v)); return n >= 1 && n <= 5 ? n : 0; };
const key = (v: unknown) => (typeof v === "string" && /^[a-z0-9_]{1,24}$/.test(v) ? v : "");
const AREAS = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"], COMMON = ["c1", "c2", "c3", "c4"];
const WANT = ["no", "maybe", "yes"], LOAD = ["low", "ok", "high", "over"];
const TOPICS = ["mvt", "txng", "tuvan", "cd10000"];
// Che chuỗi số dài (CCCD, sổ đỏ, số điện thoại) nếu lỡ gõ vào ô chữ.
const mask = (s: string) => s.replace(/\d[\d .-]{7,}\d/g, "•••");
const txt = (v: unknown, n = 1500) => mask(str(v, n));

function clean(b: any) {
  const areas: Record<string, any> = {};
  for (const a of AREAS) {
    const x = b?.areas?.[a] || {};
    areas[a] = { s: [0, 1, 2].map((i) => sc(x.s?.[i])), want: WANT.includes(x.want) ? x.want : "", note: txt(x.note, 300) };
  }
  const common: Record<string, number> = {};
  for (const c of COMMON) common[c] = sc(b?.common?.[c]);
  const pick = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.filter((x) => AREAS.includes(x)))].slice(0, max) : []);
  return {
    now: txt(b.now), sat: sc(b.sat), load: LOAD.includes(b.load) ? b.load : "",
    good: txt(b.good), hard: txt(b.hard), help: txt(b.help),
    areas, common,
    lead: pick(b.lead, 2), support: pick(b.support, 2).filter((x) => !pick(b.lead, 2).includes(x)),
    learn: txt(b.learn), topics: Array.isArray(b.topics) ? b.topics.filter((t: string) => TOPICS.includes(t)) : [],
    other: txt(b.other),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: who } = await db.auth.getUser(jwt);
    if (!who?.user) return json({ error: "not_signed_in" }, 401);
    const { data: me } = await db.from("profiles").select("*").eq("id", who.user.id).single();
    if (!me || !me.active) return json({ error: "inactive" }, 403);
    const owner = me.role === "owner";
    let body: any; try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
    const log = async (action: string, title: string, id: string) => {
      try { await db.from("activity_log").insert({ user_id: me.id, email: me.email, name: me.name || me.email, action, col: "selfeval", doc_id: id, title, summary: "" }); } catch (_) { /* không chặn */ }
    };
    const read = async (k: string) => {
      const { data } = await db.from("app_secrets").select("v").eq("k", k).maybeSingle();
      return data ? JSON.parse(data.v as string) : null;
    };

    if (body.action === "get") {
      if (!me.person_id) return json({ round: ROUND, rec: null, owner, noPerson: true });
      return json({ round: ROUND, owner, rec: await read("dg:" + ROUND + ":" + me.person_id) });
    }

    if (body.action === "save") {
      if (!me.person_id) return json({ error: "no_person" }, 400);
      if (me.role === "viewer") return json({ error: "no_permission" }, 403);
      const k = "dg:" + ROUND + ":" + me.person_id, old = await read(k), now = new Date().toISOString();
      const submit = body.submit === true;
      const rec = { ...clean(body.rec || {}), personId: me.person_id, by: me.id, byName: me.name || me.email,
        createdAt: old?.createdAt || now, updatedAt: now,
        submittedAt: submit ? now : (old?.submittedAt || ""), status: submit || old?.submittedAt ? "sent" : "draft" };
      const { error } = await db.from("app_secrets").upsert({ k, v: JSON.stringify(rec) });
      if (error) return json({ error: error.message }, 500);
      if (submit) await log(old?.submittedAt ? "update" : "create", "Phiếu tự đánh giá " + ROUND, me.person_id);
      return json({ ok: true, rec });
    }

    if (body.action === "list") {
      if (!owner) return json({ error: "no_permission" }, 403);
      const { data, error } = await db.from("app_secrets").select("k,v").or("k.like.dg:" + ROUND + ":%,k.like.dgn:" + ROUND + ":%").limit(500);
      if (error) return json({ error: error.message }, 500);
      const recs: Record<string, any> = {}, notes: Record<string, any> = {};
      for (const r of data || []) { const [p, , pid] = String(r.k).split(":"); try { (p === "dg" ? recs : notes)[pid] = JSON.parse(r.v as string); } catch (_) { /* bỏ */ } }
      return json({ round: ROUND, recs, notes });
    }

    if (body.action === "note") {
      if (!owner) return json({ error: "no_permission" }, 403);
      const pid = key(body.personId); if (!pid) return json({ error: "bad_person" }, 400);
      const sco: Record<string, number> = {};
      for (const a of AREAS) sco[a] = sc(body.note?.sco?.[a]);
      const n = { sco, text: txt(body.note?.text, 3000), updatedAt: new Date().toISOString() };
      const { error } = await db.from("app_secrets").upsert({ k: "dgn:" + ROUND + ":" + pid, v: JSON.stringify(n) });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, note: n });
    }
    return json({ error: "bad_action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
