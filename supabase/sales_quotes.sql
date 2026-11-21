-- Báo giá, hợp đồng (trang bao-gia.html): doanh nghiệp cung cấp, mẫu, tài liệu gửi khách và luồng duyệt.
-- Quy tắc: owner, manager quản lý doanh nghiệp, mẫu và duyệt. Nhân viên, cộng tác viên soạn từ mẫu, gửi duyệt;
-- chỉ bản đã duyệt mới được đánh dấu gửi khách. Người lập chỉ sửa được bản Nháp hoặc bản bị Trả lại.
-- Chạy lại an toàn. Sau file này chạy tiếp sales_quotes_seed.sql để nạp dữ liệu mẫu.

-- 1. Bảng
create table if not exists public.sales_companies (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null, short_name text, tax_id text, address text, phone text, email text, website text,
  rep_name text, rep_title text,
  banks jsonb not null default '[]'::jsonb,   -- [{bank, branch, number, holder}]
  note text, active boolean not null default true, sort int not null default 0,
  updated_at timestamptz not null default now(), updated_by uuid default auth.uid()
);
create table if not exists public.sales_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  kind text not null default 'quote' check (kind in ('quote','contract','letter')),
  name text not null, description text,
  company_id uuid references public.sales_companies(id) on delete set null,
  body jsonb not null default '{}'::jsonb,
  active boolean not null default true, sort int not null default 0,
  updated_at timestamptz not null default now(), updated_by uuid default auth.uid()
);
create table if not exists public.sales_docs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'quote' check (kind in ('quote','contract','letter')),
  number text unique,
  title text,
  template_id uuid references public.sales_templates(id) on delete set null,
  company_id uuid references public.sales_companies(id) on delete set null,
  company_snap jsonb,          -- thông tin doanh nghiệp chốt lúc duyệt
  bank int not null default 0, -- tài khoản thứ mấy của doanh nghiệp
  lead_id uuid references public.sales_leads(id) on delete set null,
  customer jsonb not null default '{}'::jsonb,
  body jsonb not null default '{}'::jsonb,
  total numeric not null default 0,
  status text not null default 'draft' check (status in ('draft','pending','rejected','approved','sent','cancelled')),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  submitted_at timestamptz, reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, review_note text,
  sent_at timestamptz, sent_by uuid references public.profiles(id), sent_via text
);
create index if not exists sales_docs_status on public.sales_docs(status);
create index if not exists sales_docs_by on public.sales_docs(created_by);
create index if not exists sales_docs_lead on public.sales_docs(lead_id);

-- 2. Quyền
alter table public.sales_companies enable row level security;
alter table public.sales_templates enable row level security;
alter table public.sales_docs enable row level security;

create or replace function public.sales_any() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_active() and my_role() in ('owner','manager','staff','ctv','viewer'), false)
$$;

drop policy if exists sc_read on public.sales_companies;
create policy sc_read on public.sales_companies for select to authenticated using (sales_any());
drop policy if exists sc_write on public.sales_companies;
create policy sc_write on public.sales_companies for all to authenticated using (sales_mgr()) with check (sales_mgr());

drop policy if exists st_read on public.sales_templates;
create policy st_read on public.sales_templates for select to authenticated using (sales_any());
drop policy if exists st_write on public.sales_templates;
create policy st_write on public.sales_templates for all to authenticated using (sales_mgr()) with check (sales_mgr());

drop policy if exists sd_read on public.sales_docs;
create policy sd_read on public.sales_docs for select to authenticated
  using (sales_mgr() or my_role() = 'viewer' or created_by = auth.uid());
drop policy if exists sd_ins on public.sales_docs;
create policy sd_ins on public.sales_docs for insert to authenticated
  with check (sales_any() and my_role() <> 'viewer' and created_by = auth.uid());
drop policy if exists sd_upd on public.sales_docs;
create policy sd_upd on public.sales_docs for update to authenticated
  using (sales_mgr() or created_by = auth.uid()) with check (sales_mgr() or created_by = auth.uid());
drop policy if exists sd_del on public.sales_docs;
create policy sd_del on public.sales_docs for delete to authenticated
  using (sales_mgr() or (created_by = auth.uid() and status in ('draft','rejected')));

-- 3. Khóa trạng thái: người lập không tự duyệt, không sửa bản đang chờ duyệt hoặc đã duyệt
create or replace function public.sales_docs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('sales.doc_rpc', true) = '1' then new.updated_at := now(); return new; end if;
  if tg_op = 'INSERT' then
    if not sales_mgr() then
      new.status := 'draft'; new.created_by := auth.uid(); new.number := null; new.company_snap := null;
      new.reviewed_by := null; new.reviewed_at := null; new.review_note := null; new.sent_at := null; new.sent_by := null; new.sent_via := null; new.submitted_at := null;
    end if;
    return new;
  end if;
  if sales_mgr() then
    if new.status is distinct from old.status then raise exception 'use_rpc'; end if;
    new.updated_at := now(); return new;
  end if;
  if old.created_by is distinct from auth.uid() then raise exception 'not_owner'; end if;
  if old.status not in ('draft','rejected') then raise exception 'locked'; end if;
  if new.status is distinct from old.status or new.created_by is distinct from old.created_by or new.number is distinct from old.number
     or new.company_snap is distinct from old.company_snap or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at
     or new.review_note is distinct from old.review_note or new.sent_at is distinct from old.sent_at or new.sent_by is distinct from old.sent_by
     or new.submitted_at is distinct from old.submitted_at then
    raise exception 'forbidden';
  end if;
  new.updated_at := now(); return new;
end $$;
drop trigger if exists sales_docs_guard on public.sales_docs;
create trigger sales_docs_guard before insert or update on public.sales_docs for each row execute function public.sales_docs_guard();

-- 4. Chuyển trạng thái
create or replace function public.sales_doc_submit(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d public.sales_docs;
begin
  select * into d from sales_docs where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if d.created_by <> auth.uid() and not sales_mgr() then raise exception 'not_owner'; end if;
  if d.status not in ('draft','rejected') then raise exception 'bad_status'; end if;
  perform set_config('sales.doc_rpc', '1', true);
  update sales_docs set status = 'pending', submitted_at = now() where id = p_id;
  perform set_config('sales.doc_rpc', '', true);
end $$;

create or replace function public.sales_doc_review(p_id uuid, p_ok boolean, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare d public.sales_docs; n text; pre text; yr text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY'); k int;
begin
  if not sales_mgr() then raise exception 'not_manager'; end if;
  select * into d from sales_docs where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if d.status not in ('pending','draft') then raise exception 'bad_status'; end if;
  perform set_config('sales.doc_rpc', '1', true);
  if not p_ok then
    update sales_docs set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(coalesce(p_note,'')),'') where id = p_id;
    perform set_config('sales.doc_rpc', '', true);
    return null;
  end if;
  n := d.number;
  if n is null then
    pre := case d.kind when 'contract' then 'HĐ' when 'letter' then 'CV' else 'BG' end || '-' || yr || '-';
    select coalesce(max(substring(number from length(pre) + 1)::int), 0) + 1 into k from sales_docs where number like pre || '%' and substring(number from length(pre) + 1) ~ '^\d+$';
    n := pre || lpad(k::text, 3, '0');
  end if;
  update sales_docs set status = 'approved', number = n, reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(coalesce(p_note,'')),''),
    company_snap = (select to_jsonb(c) - 'updated_by' from sales_companies c where c.id = d.company_id)
  where id = p_id;
  perform set_config('sales.doc_rpc', '', true);
  return n;
end $$;

create or replace function public.sales_doc_sent(p_id uuid, p_via text) returns void
language plpgsql security definer set search_path = public as $$
declare d public.sales_docs;
begin
  select * into d from sales_docs where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if d.created_by <> auth.uid() and not sales_mgr() then raise exception 'not_owner'; end if;
  if d.status not in ('approved','sent') then raise exception 'not_approved'; end if;
  perform set_config('sales.doc_rpc', '1', true);
  update sales_docs set status = 'sent', sent_at = now(), sent_by = auth.uid(), sent_via = p_via where id = p_id;
  perform set_config('sales.doc_rpc', '', true);
end $$;

-- Mở lại để sửa (bản đã duyệt hoặc đang chờ): quay về Nháp, phải duyệt lại; giữ số đã cấp.
create or replace function public.sales_doc_reopen(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d public.sales_docs;
begin
  select * into d from sales_docs where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if d.created_by <> auth.uid() and not sales_mgr() then raise exception 'not_owner'; end if;
  if d.status not in ('pending','approved','sent','cancelled') then raise exception 'bad_status'; end if;
  perform set_config('sales.doc_rpc', '1', true);
  update sales_docs set status = 'draft', company_snap = null where id = p_id;
  perform set_config('sales.doc_rpc', '', true);
end $$;

create or replace function public.sales_doc_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d public.sales_docs;
begin
  select * into d from sales_docs where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if d.created_by <> auth.uid() and not sales_mgr() then raise exception 'not_owner'; end if;
  perform set_config('sales.doc_rpc', '1', true);
  update sales_docs set status = 'cancelled' where id = p_id;
  perform set_config('sales.doc_rpc', '', true);
end $$;

revoke all on function public.sales_doc_submit(uuid), public.sales_doc_review(uuid,boolean,text), public.sales_doc_sent(uuid,text),
  public.sales_doc_reopen(uuid), public.sales_doc_cancel(uuid), public.sales_any() from public, anon;
grant execute on function public.sales_doc_submit(uuid), public.sales_doc_review(uuid,boolean,text), public.sales_doc_sent(uuid,text),
  public.sales_doc_reopen(uuid), public.sales_doc_cancel(uuid), public.sales_any() to authenticated;
grant select, insert, update, delete on public.sales_companies, public.sales_templates, public.sales_docs to authenticated;
