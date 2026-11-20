-- Ghi chú chung cho lead: nhiều người cùng ghi, không tính là lần chạm.
-- Lưu trong sales_acts với kind = 'note'. Chạy lại an toàn.
alter table public.sales_acts drop constraint if exists sales_acts_kind_check;
alter table public.sales_acts add constraint sales_acts_kind_check check (kind in ('act','assign','claim','note'));

-- ctv được ghi tương tác và ghi chú trên lead của mình
drop policy if exists sa_ins on public.sales_acts;
create policy sa_ins on public.sales_acts for insert to authenticated
  with check (by = (select auth.uid()) and ((select sales_staff())
         or ((select my_role()) = 'ctv' and kind in ('act','note') and exists (select 1 from public.sales_leads l where l.id = lead_id and l.owner_id = (select auth.uid())))));
