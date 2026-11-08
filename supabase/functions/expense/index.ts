// BVI Điều hành: ghi nhận thu chi bằng ảnh chứng từ thanh toán.
// POST /functions/v1/expense (JWT) {action: ocr|save|list|review|delete|image}
// Quyền ghi: owner, hoặc nhân sự được owner bật "Ghi thu chi" (people.canExpense).
// Xem tất cả, duyệt: owner và tài khoản được xem tài chính. Người ghi chỉ thấy phiếu của mình.
// Phiếu lưu trong app_secrets (chỉ service role đọc), ảnh trong bucket riêng "receipts" (không công khai).
// Đọc ảnh tự động bằng Claude khi có secret ANTHROPIC_API_KEY; thiếu khóa vẫn nhập tay được.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
const PFX = "exp:", BUCKET = "receipts";
export const COMPANIES = ["salefronts", "bvi", "annong", "other"];
const CO_L: Record<string, string> = { salefronts: "Salefronts", bvi: "BVI", annong: "HTX An Nông", other: "Khác" };
const str = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const rid = () => Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(5)), (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 8);

export function clean(b: any, base: any = {}) {
  const amount = Math.round(Number(String(b.amount ?? "").replace(/[^\d.-]/g, "")) || 0);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : "";
  const company = COMPANIES.includes(b.company) ? b.company : "";
  return {
    ...base,
    type: b.type === "in" ? "in" : "out",
    company,
    companyOther: company === "other" ? str(b.companyOther, 80) : "",
    amount: Math.max(0, Math.min(amount, 1e12)),
    date,
    time: /^\d{1,2}:\d{2}/.test(b.time || "") ? String(b.time).slice(0, 5) : "",
    payer: str(b.payer, 120),
    payerBank: str(b.payerBank, 60),
    payee: str(b.payee, 120),
    payeeBank: str(b.payeeBank, 60),
    content: str(b.content, 300),
    ref: str(b.ref, 60),
    note: str(b.note, 300),
  };
}

// Đọc ảnh chứng từ bằng Claude, ép trả về đúng cấu trúc qua tool.
const OCR_TOOL = {
  name: "ghi_chung_tu",
  description: "Ghi lại dữ liệu đọc được từ ảnh chứng từ thanh toán (ảnh chuyển khoản ngân hàng, ví điện tử, hóa đơn, phiếu thu chi).",
  input_schema: {
    type: "object",
    properties: {
      is_payment: { type: "boolean", description: "Ảnh có phải chứng từ thanh toán hoặc hóa đơn không" },
      amount: { type: "number", description: "Số tiền VND, số nguyên, không dấu chấm phẩy. 0 nếu không thấy" },
      date: { type: "string", description: "Ngày giao dịch dạng YYYY-MM-DD, rỗng nếu không thấy" },
      time: { type: "string", description: "Giờ HH:MM nếu có" },
      payer: { type: "string", description: "Tên người hoặc đơn vị chuyển tiền (bên trả)" },
      payer_bank: { type: "string", description: "Ngân hàng hoặc ví của bên chuyển, nếu có" },
      payee: { type: "string", description: "Tên người hoặc đơn vị nhận tiền (bên thụ hưởng)" },
      payee_bank: { type: "string", description: "Ngân hàng hoặc ví của bên nhận, nếu có" },
      content: { type: "string", description: "Nội dung chuyển khoản hoặc diễn giải, giữ nguyên chữ" },
      ref: { type: "string", description: "Mã giao dịch, số tham chiếu, số hóa đơn nếu có" },
    },
    required: ["is_payment", "amount", "date", "payer", "payee", "content"],
  },
};
async function ocr(b64: string, mime: string) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { status: "no_key" };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OCR_MODEL") || "claude-haiku-5-5",
      max_tokens: 800,
      tool_choice: { type: "tool", name: OCR_TOOL.name },
      tools: [OCR_TOOL],
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
        { type: "text", text: "Đây là ảnh chứng từ thanh toán ở Việt Nam. Đọc và ghi lại: số tiền, ngày, bên chuyển, bên nhận, nội dung, mã giao dịch. Không đoán thông tin không có trong ảnh. Không ghi số tài khoản, số CCCD hay số điện thoại vào các trường tên." },
      ] }],
    }),
  });
  if (!r.ok) return { status: "fail", http: r.status };
  const j = await r.json();
  const t = (j.content || []).find((c: any) => c.type === "tool_use");
  if (!t) return { status: "fail" };
  const x = t.input || {};
  return { status: x.is_payment === false ? "not_payment" : "ok", fields: {
    amount: Math.round(Number(x.amount) || 0), date: str(x.date, 10), time: str(x.time, 5),
    payer: str(x.payer, 120), payerBank: str(x.payer_bank, 60), payee: str(x.payee, 120), payeeBank: str(x.payee_bank, 60),
    content: str(x.content, 300), ref: str(x.ref, 60),
  } };
}

async function putImage(path: string, bytes: Uint8Array, mime: string) {
  let { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
  if (error && /not.?found|bucket/i.test(error.message)) {
    await db.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 6 * 1024 * 1024 });
    ({ error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true }));
  }
  if (error) throw new Error(error.message);
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
    let canWrite = owner;
    if (!canWrite && me.person_id) {
      const { data: p } = await db.from("docs").select("data").eq("col", "people").eq("id", me.person_id).maybeSingle();
      canWrite = !!(p?.data as any)?.canExpense;
    }
    const reviewer = owner || !!me.can_finance;
    if (!canWrite && !reviewer) return json({ error: "no_permission" }, 403);
    let body: any; try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
    const log = async (action: string, title: string, summary: string, id: string) => {
      try { await db.from("activity_log").insert({ user_id: me.id, email: me.email, name: me.name || me.email, action, col: "expenses", doc_id: id, title, summary }); } catch (_) { /* không chặn */ }
    };
    const get = async (id: string) => {
      if (!/^[a-z0-9]{6,24}$/.test(id)) return null;
      const { data } = await db.from("app_secrets").select("v").eq("k", PFX + id).maybeSingle();
      return data ? JSON.parse(data.v as string) : null;
    };
    const mine = (r: any) => r && r.by === me.id;

    if (body.action === "ocr") {
      if (!canWrite) return json({ error: "no_permission" }, 403);
      const mime = ["image/jpeg", "image/png", "image/webp"].includes(body.mime) ? body.mime : "image/jpeg";
      const b64 = String(body.image || "").replace(/^data:[^,]+,/, "");
      if (!b64 || b64.length > 7_000_000) return json({ error: "bad_image" }, 400);
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const id = rid(); const path = new Date().toISOString().slice(0, 7) + "/" + me.id.slice(0, 8) + "_" + id + (mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg");
      const [o] = await Promise.all([ocr(b64, mime).catch(() => ({ status: "fail" })), putImage(path, bytes, mime)]);
      return json({ ok: true, id, img: path, ocr: o.status, fields: (o as any).fields || null });
    }

    if (body.action === "save") {
      const id = str(body.id, 24);
      const old = id ? await get(id) : null;
      if (old) {
        if (!(owner || (reviewer && canWrite) || (mine(old) && !old.checkedAt))) return json({ error: "locked" }, 403);
      } else if (!canWrite) return json({ error: "no_permission" }, 403);
      const img = str(body.img, 200);
      if (img && !old && !new RegExp("^\\d{4}-\\d{2}/" + me.id.slice(0, 8) + "_[a-z0-9]+\\.(jpg|png|webp)$").test(img)) return json({ error: "bad_image_path" }, 400);
      const rec = clean(body, old || {});
      if (!rec.company) return json({ error: "need_company" }, 400);
      if (!rec.amount) return json({ error: "need_amount" }, 400);
      if (!rec.date) rec.date = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const now = new Date().toISOString();
      const nid = old ? id : (/^[a-z0-9]{6,24}$/.test(id) ? id : rid());
      const out = old ? { ...rec, updatedAt: now, updatedBy: me.name || me.email } : { ...rec, id: nid, img: img || "", by: me.id, byName: me.name || me.email, personId: me.person_id || "", at: now, ocr: str(body.ocr, 20) };
      const { error } = await db.from("app_secrets").upsert({ k: PFX + nid, v: JSON.stringify(out) });
      if (error) return json({ error: error.message }, 400);
      const co = rec.company === "other" ? (rec.companyOther || "Khác") : CO_L[rec.company];
      await log(old ? "update" : "create", (rec.type === "in" ? "Thu" : "Chi") + " · " + co, (old ? "sửa phiếu " : "ghi phiếu ") + (rec.type === "in" ? "thu" : "chi") + " cho " + co + (rec.note ? ": " + rec.note.slice(0, 80) : ""), nid);
      return json({ ok: true, rec: out });
    }

    if (body.action === "list") {
      const month = /^\d{4}-\d{2}$/.test(body.month || "") ? body.month : "";
      const { data, error } = await db.from("app_secrets").select("v").like("k", PFX + "%").limit(5000);
      if (error) return json({ error: error.message }, 400);
      let rows = (data || []).map((r: any) => JSON.parse(r.v as string)).filter((r: any) => reviewer || r.by === me.id);
      if (month) rows = rows.filter((r: any) => (r.date || r.at || "").startsWith(month));
      rows.sort((a: any, b: any) => (b.date + (b.time || "") + b.at).localeCompare(a.date + (a.time || "") + a.at));
      return json({ rows, reviewer, canWrite, owner, me: me.id });
    }

    if (body.action === "image") {
      const r = await get(str(body.id, 24));
      if (!r || !r.img || !(reviewer || mine(r))) return json({ error: "not_found" }, 404);
      const { data, error } = await db.storage.from(BUCKET).createSignedUrl(r.img, 600);
      if (error) return json({ error: error.message }, 400);
      return json({ url: data.signedUrl });
    }

    if (body.action === "review") {
      if (!reviewer) return json({ error: "reviewer_only" }, 403);
      const id = str(body.id, 24); const r = await get(id);
      if (!r) return json({ error: "not_found" }, 404);
      if (body.ok) { r.checkedAt = new Date().toISOString(); r.checkedBy = me.name || me.email; } else { delete r.checkedAt; delete r.checkedBy; }
      await db.from("app_secrets").upsert({ k: PFX + id, v: JSON.stringify(r) });
      await log("update", (r.type === "in" ? "Thu" : "Chi") + " · " + (CO_L[r.company] || "Khác"), body.ok ? "đã kiểm phiếu thu chi" : "bỏ đánh dấu đã kiểm phiếu thu chi", id);
      return json({ ok: true, rec: r });
    }

    if (body.action === "delete") {
      const id = str(body.id, 24); const r = await get(id);
      if (!r) return json({ ok: true });
      if (!(owner || (mine(r) && !r.checkedAt))) return json({ error: "locked" }, 403);
      await db.from("app_secrets").delete().eq("k", PFX + id);
      if (r.img) await db.storage.from(BUCKET).remove([r.img]);
      await log("delete", (r.type === "in" ? "Thu" : "Chi") + " · " + (CO_L[r.company] || "Khác"), "xóa phiếu thu chi", id);
      return json({ ok: true });
    }

    if (body.action === "discard") { // bỏ ảnh đã tải khi người dùng hủy, chỉ ảnh của chính mình chưa gắn phiếu
      const img = str(body.img, 200);
      if (new RegExp("^\\d{4}-\\d{2}/" + me.id.slice(0, 8) + "_[a-z0-9]+\\.(jpg|png|webp)$").test(img)) {
        const m = img.match(/_([a-z0-9]+)\./); const r = m ? await get(m[1]) : null;
        if (!r) await db.storage.from(BUCKET).remove([img]);
      }
      return json({ ok: true });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
