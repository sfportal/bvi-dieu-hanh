-- Chuyển lead cho người khác + trạng thái liên hệ. Chạy lại an toàn.

-- 1) kết quả và kênh mới: không liên hệ được, sai số, chưa tìm được liên hệ; kênh "Tìm thông tin"
alter table public.sales_acts drop constraint if exists sales_acts_result_check;
alter table public.sales_acts add constraint sales_acts_result_check
  check (result in ('noans','later','talked','interested','sent','refused','unreach','wrong','nofind'));
alter table public.sales_acts drop constraint if exists sales_acts_channel_check;
alter table public.sales_acts add constraint sales_acts_channel_check
  check (channel in ('call','zalo','meet','email','other','search'));

-- 2) trạng thái liên hệ gần nhất trên lead
alter table public.sales_leads add column if not exists last_result text;

create or replace function public.sales_acts_ai() returns trigger
language plpgsql security definer set search_path = public as $$
declare st int;
begin
  if new.kind <> 'act' then return new; end if;
  select stage into st from sales_leads where id = new.lead_id;
  st := coalesce(new.stage_after, st);
  if new.result = 'refused' then st := 7;
  elsif st <= 1 and new.result is not null and new.result not in ('noans','unreach','wrong','nofind') then st := 2;
  end if;
  update sales_leads set
    last_touch_at = new.at,
    first_touch_at = coalesce(first_touch_at, new.at),
    touch_count = touch_count + 1,
    stage = st,
    last_result = coalesce(new.result, last_result),
    temp = coalesce(new.temp_after, temp),
    fit = coalesce(new.fit_after, fit),
    needs = coalesce(new.needs_after, needs),
    next_type = case when new.next_at is not null or new.next_type is not null then new.next_type else next_type end,
    next_at = case when new.next_at is not null or new.next_type is not null then new.next_at else next_at end,
    next_note = case when new.next_at is not null or new.next_type is not null then new.next_note else next_note end,
    lat = coalesce(lat, case when new.channel = 'meet' then new.lat end),
    lng = coalesce(lng, case when new.channel = 'meet' then new.lng end)
  where id = new.lead_id;
  return new;
end $$;

-- 3) trigger lead: cho phép đổi người phụ trách khi đi qua hàm chuyển lead
create or replace function public.sales_leads_bi() returns trigger
language plpgsql set search_path = public as $$
begin
  new.phones := sales_norm_phones(concat_ws(',', new.org_phone, new.contact_phone, new.contact_zalo));
  new.name_key := sales_norm_name(new.name);
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if my_role() = 'ctv' and coalesce(current_setting('sales.transfer', true), '') <> '1' then
      new.owner_id := old.owner_id; new.brought_by := old.brought_by; new.created_by := old.created_by;
    end if;
    if new.owner_id is distinct from old.owner_id then new.assigned_at := now(); end if;
  else
    if my_role() = 'ctv' then new.brought_by := auth.uid(); new.created_by := auth.uid(); end if;
    if new.owner_id is not null and new.assigned_at is null then new.assigned_at := now(); end if;
  end if;
  return new;
end $$;

-- 4) chuyển lead: người đang giữ lead (nhân viên hoặc cộng tác viên) hoặc quản lý
create or replace function public.sales_transfer(p_lead uuid, p_to uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare cur uuid; me text; them text; who text;
begin
  if my_role() is null or not is_active() then raise exception 'not_active'; end if;
  select owner_id into cur from sales_leads where id = p_lead;
  if not found then raise exception 'no_lead'; end if;
  if cur is distinct from auth.uid() and not sales_mgr() then raise exception 'not_owner'; end if;
  if p_to is null or p_to = cur then raise exception 'bad_target'; end if;
  select name into them from profiles where id = p_to and active and role in ('owner','manager','staff','ctv');
  if them is null then raise exception 'bad_target'; end if;
  select name into me from profiles where id = auth.uid();
  perform set_config('sales.transfer', '1', true);
  update sales_leads set owner_id = p_to, next_at = null where id = p_lead;
  perform set_config('sales.transfer', '', true);
  who := coalesce(nullif(me,''), 'Người giữ lead') || ' chuyển cho ' || coalesce(nullif(them,''), 'người khác');
  insert into sales_acts(lead_id, "by", kind, note)
    values (p_lead, auth.uid(), 'assign', who || case when nullif(trim(coalesce(p_note,'')),'') is not null then ': ' || left(trim(p_note), 500) else '' end);
end $$;
revoke all on function public.sales_transfer(uuid, uuid, text) from public, anon;
grant execute on function public.sales_transfer(uuid, uuid, text) to authenticated;

-- 5) cộng tác viên cần thấy tên người nhận khi chuyển lead (chỉ tên, không email)
create or replace function public.sales_people() returns table(id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select p.id,
         case when sales_staff() or my_role() = 'viewer' or p.id = auth.uid() then coalesce(nullif(p.name,''), p.email)
              else coalesce(nullif(p.name,''), 'Đồng nghiệp') end,
         p.role
  from profiles p
  where p.active and is_active()
    and (sales_staff() or my_role() = 'viewer' or p.id = auth.uid()
         or (my_role() = 'ctv' and p.role in ('owner','manager','staff','ctv')))
$$;
revoke all on function public.sales_people() from public, anon;
grant execute on function public.sales_people() to authenticated;
