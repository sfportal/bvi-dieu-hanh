-- Thêm người đại diện cho lead (có thể trùng hoặc khác người liên hệ).
-- Chạy một lần trong Supabase SQL Editor.
alter table public.sales_leads add column if not exists rep_name text;
alter table public.sales_leads add column if not exists rep_title text;
notify pgrst, 'reload schema';
