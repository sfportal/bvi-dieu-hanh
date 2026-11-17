-- Kiểm thử phân quyền trang sales. Chạy cả file trong một giao dịch, cuối cùng ROLLBACK: không để lại dữ liệu.
-- Giả lập CTV bằng cách tạm đổi vai trò tài khoản thuê ngoài (truonghuy) thành 'ctv' trong giao dịch.
begin;

create temp table t_ids as
select (select id from profiles where person_id='truonghuy') ctv,
       (select id from profiles where person_id='minh') staff,
       (select id from profiles where person_id='trinh') mgr;
grant select on t_ids to authenticated;

update profiles set role='ctv' where person_id='truonghuy';

-- dữ liệu thử (chạy bằng quyền postgres)
insert into sales_leads(id,name,org_phone,owner_id,stage) select '00000000-0000-0000-0000-0000000000a1','T Lead CTV',null,ctv,1 from t_ids;
insert into sales_leads(id,name,org_phone,owner_id,stage) select '00000000-0000-0000-0000-0000000000a2','T Lead Staff','0983.408.009',null,1 from t_ids;

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
end $$;
create or replace function pg_temp.as_admin() returns void language plpgsql as $$
begin perform set_config('role','postgres', true); end $$;

-- ctv_cannot_read_docs
select pg_temp.as_user(ctv) from t_ids;
do $$ begin assert (select count(*) from docs)=0, 'ctv_cannot_read_docs'; end $$;
-- ctv_reads_only_own_leads
do $$ begin assert (select count(*) from sales_leads where name like 'T Lead%')=1, 'ctv_reads_only_own_leads'; end $$;
-- ctv_insert_forces_owner
do $$ declare ok boolean:=false; begin
  begin insert into sales_leads(name,owner_id) values ('T x',(select staff from t_ids)); exception when others then ok:=true; end;
  assert ok, 'ctv_insert_forces_owner';
end $$;
-- ctv_cannot_reassign
do $$ begin
  begin update sales_leads set owner_id=(select staff from t_ids) where id='00000000-0000-0000-0000-0000000000a1'; exception when others then null; end;
end $$;
select pg_temp.as_admin();
do $$ begin assert (select owner_id from sales_leads where id='00000000-0000-0000-0000-0000000000a1')=(select ctv from t_ids), 'ctv_cannot_reassign'; end $$;

-- dup_phone_formats (ctv gọi): kho chung -> pool:<id>
select pg_temp.as_user(ctv) from t_ids;
do $$ begin assert sales_dup('+84 983 408 009',null,null)='pool:00000000-0000-0000-0000-0000000000a2', 'dup_phone_pool'; end $$;
do $$ begin assert sales_dup(null,null,'t lead ctv')='mine', 'dup_mine'; end $$;
do $$ begin assert sales_dup('0911111111',null,'khong co')='none', 'dup_none'; end $$;

-- claim_flow
do $$ begin perform sales_claim('00000000-0000-0000-0000-0000000000a2'); end $$;
select pg_temp.as_user(mgr) from t_ids;
do $$ begin perform sales_claim_decide((select id from sales_claims where lead_id='00000000-0000-0000-0000-0000000000a2'), true); end $$;
select pg_temp.as_admin();
do $$ begin
  assert (select owner_id from sales_leads where id='00000000-0000-0000-0000-0000000000a2')=(select ctv from t_ids), 'claim_owner';
  assert (select brought_by from sales_leads where id='00000000-0000-0000-0000-0000000000a2')=(select ctv from t_ids), 'claim_brought_by';
end $$;
-- giờ lead a2 thuộc ctv; chuyển sang staff để thử "owned"
update sales_leads set owner_id=(select staff from t_ids) where id='00000000-0000-0000-0000-0000000000a2';
select pg_temp.as_user(ctv) from t_ids;
do $$ begin assert sales_dup('0983408009',null,null)='owned', 'dup_owned'; end $$;

-- staff_reads_all_leads
select pg_temp.as_user(staff) from t_ids;
do $$ begin assert (select count(*) from sales_leads where name like 'T Lead%')=2, 'staff_reads_all_leads'; end $$;
-- act_updates_lead (staff ghi act)
do $$ begin insert into sales_acts(lead_id,channel,result,temp_after,next_at) values ('00000000-0000-0000-0000-0000000000a2','call','talked','hot','2026-11-20'); end $$;
select pg_temp.as_admin();
do $$ declare l record; begin
  select * into l from sales_leads where id='00000000-0000-0000-0000-0000000000a2';
  assert l.touch_count=1 and l.temp='hot' and l.next_at='2026-11-20' and l.first_touch_at is not null and l.stage=2, 'act_updates_lead';
end $$;
-- refused_sets_stage7
select pg_temp.as_user(staff) from t_ids;
do $$ begin insert into sales_acts(lead_id,channel,result) values ('00000000-0000-0000-0000-0000000000a2','call','refused'); end $$;
select pg_temp.as_admin();
do $$ begin assert (select stage from sales_leads where id='00000000-0000-0000-0000-0000000000a2')=7, 'refused_sets_stage7'; end $$;

-- ctv không đọc act của lead không thuộc mình
select pg_temp.as_user(ctv) from t_ids;
do $$ begin assert (select count(*) from sales_acts where lead_id='00000000-0000-0000-0000-0000000000a2')=0, 'ctv_no_foreign_acts'; end $$;
-- ctv_storage_own_folder
do $$ declare ok boolean:=false; begin
  begin insert into storage.objects(bucket_id,name) values ('sales',(select staff from t_ids)::text||'/x.jpg'); exception when others then ok:=true; end;
  assert ok, 'ctv_storage_own_folder';
end $$;
do $$ declare ok boolean:=true; begin
  begin insert into storage.objects(bucket_id,name) values ('sales',(select ctv from t_ids)::text||'/a1/x.jpg'); exception when others then ok:=false; end;
  assert ok, 'ctv_storage_own_folder_allowed';
end $$;
-- ctv không đọc profiles người khác
do $$ begin assert (select count(*) from profiles)<=1, 'ctv_profiles_self_only'; end $$;

select pg_temp.as_admin();
select 'ALL SALES TESTS PASSED' as result;
rollback;
