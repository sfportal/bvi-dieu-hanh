alter table public.docs drop constraint if exists docs_col_check;
alter table public.docs add constraint docs_col_check check (col = any (array['zones','people','tasks','contracts','daily','units','events','leaves','faqs','supports']));

create table if not exists public.activity_log(
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid, email text, name text,
  action text not null,
  col text, doc_id text, title text, summary text);
create index if not exists activity_log_at on public.activity_log(at desc);
create index if not exists activity_log_user on public.activity_log(user_id, at desc);
alter table public.activity_log enable row level security;
drop policy if exists log_read on public.activity_log;
create policy log_read on public.activity_log for select to authenticated using (public.is_active() and public.my_role() in ('owner','manager'));
revoke insert, update, delete on public.activity_log from anon, authenticated;

create or replace function public.log_pn(p text) returns text language sql stable security definer set search_path=public as $$
  select coalesce((select data->>'name' from docs where col='people' and id=p), nullif(p,''), '—') $$;

create or replace function public.log_d(v jsonb) returns text language sql immutable as $$
  select case when v is null or v='null'::jsonb or v#>>'{}'='' then '—'
              when v#>>'{}' ~ '^\d{4}-\d{2}-\d{2}' then substr(v#>>'{}',9,2)||'/'||substr(v#>>'{}',6,2)
              else v#>>'{}' end $$;

create or replace function public.log_label(c text, k text) returns text language sql immutable as $$
  select case k
    when 'name' then 'tên' when 'title' then 'tên việc' when 'next' then 'việc kế tiếp' when 'blocker' then 'vướng mắc'
    when 'note' then 'ghi chú' when 'smart' then 'mục tiêu SMART' when 'C' then 'người phối hợp' when 'I' then 'người được báo'
    when 'ward' then 'xã/phường' when 'province' then 'tỉnh' when 'unit' then 'đơn vị' when 'unitId' then 'đơn vị'
    when 'customer' then 'khách hàng' when 'code' then 'mã vùng' when 'flag' then 'cờ cảnh báo' when 'needFrom' then 'việc cần khách'
    when 'custNote' then 'ghi chú cho khách' when 'photos' then 'ảnh' when 'docs' then 'tài liệu' when 'signs' then 'ký nhận'
    when 'items' then 'hạng mục' when 'payments' then 'đợt thanh toán' when 'final' then 'câu trả lời' when 'answers' then 'góp ý trả lời'
    when 'q' then 'câu hỏi' when 'done' then 'đã làm' when 'block' then 'vướng' when 'reason' then 'lý do' when 'handover' then 'bàn giao'
    when 'role' then 'vai trò' when 'team' then 'nhóm' when 'phone' then 'SĐT' when 'rep' then 'người đại diện' when 'tax' then 'MST'
    when 'address' then 'địa chỉ' when 'legal' then 'tên pháp lý' when 'zones' then 'vùng gắn' when 'zone' then 'vùng gắn'
    when 'parent' then 'việc cha' when 'kind' then 'loại việc' when 'cat' then 'nhóm FAQ' when 'aud' then 'đối tượng'
    when 'ha' then 'diện tích (ha)' when 'plots' then 'số lô' when 'hh' then 'số hộ' when 'ordered' then 'đặt hàng'
    when 'checks' then 'checklist bước' when 'gates' then 'cổng kiểm soát' when 'files' then 'hồ sơ 19 phần'
    when 'helper' then 'người hỗ trợ' when 'detail' then 'chi tiết' when 'result' then 'kết quả' when 'task' then 'việc gắn'
    when 'place' then 'địa điểm' when 'start' then 'thời gian' when 'end' then 'thời gian' when 'people' then 'người tham gia'
    else k end $$;

create or replace function public.log_change(c text, k text, ov jsonb, nv jsonb) returns text language plpgsql stable security definer set search_path=public as $$
declare t jsonb := '{"todo":"Chưa làm","doing":"Đang làm","wait":"Chờ người khác","done":"Xong","pending":"Chờ duyệt","approved":"Đã duyệt","rejected":"Từ chối","open":"Đang mở"}';
begin
  if k='step' then return 'bước '||coalesce(ov#>>'{}','chưa rõ')||' → '||coalesce(nv#>>'{}','chưa rõ'); end if;
  if k='status' and c='supports' then t:='{"wait":"Chờ hỗ trợ","doing":"Đang thực hiện","done":"Đã hoàn tất","declined":"Không hỗ trợ"}'; end if;
  if k='updates' then return 'thêm trao đổi'; end if;
  if k='status' then return 'trạng thái: '||coalesce(t->>(ov#>>'{}'),ov#>>'{}','—')||' → '||coalesce(t->>(nv#>>'{}'),nv#>>'{}','—'); end if;
  if k in ('owner','R','A','person') then return case k when 'owner' then 'phụ trách' when 'R' then 'người làm' when 'A' then 'người duyệt' else 'người' end
       ||': '||coalesce(log_pn(ov#>>'{}'),'—')||' → '||coalesce(log_pn(nv#>>'{}'),'—'); end if;
  if k='priority' then return 'ưu tiên: '||log_d(ov)||' → '||log_d(nv); end if;
  if k in ('T','due','from','to','date','signed') then return case k when 'T' then 'mốc T' when 'due' then 'hạn' when 'signed' then 'ngày ký' else 'ngày' end||': '||log_d(ov)||' → '||log_d(nv); end if;
  if k in ('ha','plots','hh') then return log_label(c,k)||': '||log_d(ov)||' → '||log_d(nv); end if;
  if k='active' then return case when nv='true'::jsonb then 'hiện lại' else 'ẩn khỏi danh sách' end; end if;
  if k in ('photos','docs','signs') and jsonb_typeof(nv)='array' and jsonb_typeof(ov)='array' then
    return case when jsonb_array_length(nv)>jsonb_array_length(ov) then 'thêm '||log_label(c,k) when jsonb_array_length(nv)<jsonb_array_length(ov) then 'bớt '||log_label(c,k) else 'sửa '||log_label(c,k) end; end if;
  if ov is null or ov='null'::jsonb or ov#>>'{}'='' then return 'ghi '||log_label(c,k); end if;
  return 'sửa '||log_label(c,k);
end $$;

create or replace function public.log_actor(out uid uuid, out em text, out nm text) language plpgsql stable security definer set search_path=public as $$
begin uid:=auth.uid(); if uid is null then em:=null; nm:='Hệ thống'; return; end if;
  select p.email, coalesce(nullif(p.name,''),p.email) into em,nm from profiles p where p.id=uid; end $$;

create or replace function public.log_write(p_action text, p_col text, p_id text, p_title text, p_summary text) returns void language plpgsql security definer set search_path=public as $$
declare a record; l record; merged text; part text;
begin
  select * into a from log_actor();
  if p_action in ('update','finance') then
    select * into l from activity_log where user_id is not distinct from a.uid and col is not distinct from p_col and doc_id is not distinct from p_id
      and action in (p_action,'create') and at > now()-interval '3 minutes' order by id desc limit 1;
    if found then
      if l.action='create' then update activity_log set at=now(), title=p_title where id=l.id; return; end if;
      merged:=l.summary;
      foreach part in array string_to_array(p_summary,'; ') loop
        if position(part in coalesce(merged,''))=0 then merged:=coalesce(merged||'; ','')||part; end if; end loop;
      update activity_log set at=now(), title=p_title, summary=left(merged,400) where id=l.id; return;
    end if;
  end if;
  insert into activity_log(user_id,email,name,action,col,doc_id,title,summary) values(a.uid,a.em,a.nm,p_action,p_col,p_id,left(p_title,200),left(p_summary,400));
end $$;

create or replace function public.log_docs() returns trigger language plpgsql security definer set search_path=public as $$
declare o jsonb; n jsonb; c text; i text; act text; ttl text; parts text[]:='{}'; k text; s text; d jsonb;
begin
  if coalesce(current_setting('bvi.bulk',true),'')='1' then return null; end if;
  if tg_op='DELETE' then o:=old.data; c:=old.col; i:=old.id; act:='delete';
  elsif tg_op='INSERT' then n:=new.data; c:=new.col; i:=new.id; act:='create';
  else o:=old.data; n:=new.data; c:=new.col; i:=new.id; act:='update'; if o=n then return null; end if; end if;
  d:=coalesce(n,o);
  ttl:=coalesce(nullif(d->>'name',''),nullif(d->>'title',''),nullif(d->>'q',''),nullif(d->>'number',''),
     case c when 'daily' then 'Báo cáo ngày '||log_d(d->'date')||' của '||log_pn(d->>'person')
            when 'leaves' then case when d->>'type'='early' then 'Đơn về sớm ' else 'Đơn nghỉ ' end||log_d(d->'from')||' của '||log_pn(d->>'person') end, i);
  if act='update' then
    for k in select key from jsonb_each(n) union select key from jsonb_each(o) loop
      if k in ('updatedAt','updatedBy','stepLog','createdAt','at','doneAt','approvedAt','approvedBy','order','pendingEdit') then continue; end if;
      if (o->k) is distinct from (n->k) then s:=log_change(c,k,o->k,n->k); if not s = any(parts) then parts:=parts||s; end if; end if;
    end loop;
    if coalesce(array_length(parts,1),0)=0 then return null; end if;
    s:=array_to_string(parts[1:6],'; ')||case when array_length(parts,1)>6 then '; …' else '' end;
  elsif act='create' then s:=case c when 'daily' then 'gửi báo cáo' when 'leaves' then 'gửi đơn' else 'thêm mới' end;
  else s:='đã xóa'; end if;
  perform log_write(act,c,i,ttl,s);
  return null;
end $$;
drop trigger if exists docs_log on public.docs;
create trigger docs_log after insert or update or delete on public.docs for each row execute function public.log_docs();

create or replace function public.log_fin() returns trigger language plpgsql security definer set search_path=public as $$
declare o jsonb; n jsonb; parts text[]:='{}'; j int; ttl text; idv text;
begin
  idv:=coalesce(new.id,old.id); if tg_op='DELETE' then return null; end if;
  if coalesce(current_setting('bvi.bulk',true),'')='1' then return null; end if;
  o:=case when tg_op='UPDATE' then old.data else '{}'::jsonb end; n:=new.data; if o=n then return null; end if;
  if (o->'prices') is distinct from (n->'prices') then parts:=parts||'cập nhật đơn giá'::text; end if;
  for j in 0..greatest(coalesce(jsonb_array_length(n->'paid'),0)-1,-1) loop
    if (o->'paid'->j) is distinct from (n->'paid'->j) then parts:=parts||('đợt '||(j+1)||': '||case when n->'paid'->j='true'::jsonb then 'đã thu' else 'bỏ đánh dấu đã thu' end); end if; end loop;
  if coalesce(array_length(parts,1),0)=0 then parts:=parts||'cập nhật thanh toán'::text; end if;
  select coalesce(data->>'number',idv) into ttl from docs where col='contracts' and id=idv;
  perform log_write('finance','contracts',idv,coalesce(ttl,idv),array_to_string(parts,'; '));
  return null;
end $$;
drop trigger if exists fin_log on public.contract_fin;
create trigger fin_log after insert or update on public.contract_fin for each row execute function public.log_fin();

create or replace function public.log_event(p_action text, p_summary text default null) returns void language plpgsql security definer set search_path=public as $$
declare a record;
begin
  if auth.uid() is null or not is_active() then return; end if;
  if p_action not in ('login','open','logout','password','import') then raise exception 'bad action'; end if;
  if p_action='import' and my_role()<>'owner' then raise exception 'owner only'; end if;
  if p_action='open' and exists(select 1 from activity_log where user_id=auth.uid() and action in ('login','open') and at>now()-interval '6 hours') then return; end if;
  if p_action='login' then delete from activity_log where at < now()-interval '365 days'; end if;
  select * into a from log_actor();
  insert into activity_log(user_id,email,name,action,summary) values(a.uid,a.em,a.nm,p_action,
    left(coalesce(p_summary, case p_action when 'login' then 'đăng nhập' when 'open' then 'mở ứng dụng (đang đăng nhập sẵn)' when 'logout' then 'đăng xuất' when 'password' then 'đổi mật khẩu' else p_action end),300));
end $$;

create or replace function public.import_docs(p_rows jsonb) returns int language plpgsql security invoker set search_path=public as $$
declare n int;
begin
  if my_role()<>'owner' then raise exception 'owner only'; end if;
  perform set_config('bvi.bulk','1',true);
  insert into docs(col,id,data) select x->>'col', x->>'id', x->'data' from jsonb_array_elements(p_rows) x
    on conflict (col,id) do update set data=excluded.data, updated_at=now();
  get diagnostics n = row_count; return n;
end $$;

revoke execute on function public.log_write(text,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.log_change(text,text,jsonb,jsonb) from public, anon, authenticated;
revoke execute on function public.log_actor() from public, anon, authenticated;
revoke execute on function public.log_pn(text) from public, anon, authenticated;
revoke execute on function public.log_docs() from public, anon, authenticated;
revoke execute on function public.log_fin() from public, anon, authenticated;
revoke execute on function public.log_event(text,text) from public, anon;
grant execute on function public.log_event(text,text) to authenticated;
revoke execute on function public.import_docs(jsonb) from public, anon;
grant execute on function public.import_docs(jsonb) to authenticated;