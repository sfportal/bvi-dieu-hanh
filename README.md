# BVI Điều hành

Ứng dụng quản lý nội bộ Công ty CP BVI: mã số vùng trồng, công việc, lịch, hợp đồng, nhân sự, FAQ, thống kê.

- Giao diện: `index.html` (trang tĩnh, chạy trên GitHub Pages).
- Dữ liệu, đăng nhập, phân quyền: Supabase (project `bvi-dieu-hanh`). Khóa trong `index.html` là khóa publishable, được phép công khai; dữ liệu được bảo vệ bằng Row Level Security.
- Quản lý tài khoản: Edge Function `supabase/functions/admin-users`.
- `tools/build.py` tạo `index.html` từ bản trang gốc và `tools/core.js`.

Vai trò: Owner, Quản lý, Nhân viên, Chỉ xem. Quyền xem tài chính bật riêng từng tài khoản.
