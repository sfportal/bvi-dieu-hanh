# Hướng dẫn cho Claude

Đọc `README.md` trước khi sửa. Tóm tắt các quy tắc bắt buộc:

- **Không sửa tay `index.html`.** Sửa `tools/core.js`, `tools/source.html` hoặc thêm `R(cũ, mới)` vào `tools/build.py` (trước dòng ghi file), rồi chạy `bash tools/check.sh` để dựng lại. `bao-cao.html` và `api.html` thì sửa trực tiếp.
- `git pull origin main` trước khi sửa và trước khi push. Commit nhỏ, không force push. Xung đột ở `index.html` thì giải quyết ở `tools/` rồi dựng lại.
- Push lên `main` là xuất bản thật (GitHub Pages). Chạy `bash tools/check.sh` trước mỗi lần push.
- Sửa Edge Function: sửa `supabase/functions/<tên>/index.ts`, triển khai (`verify_jwt = false`), commit cùng lúc.
- Tạo bảng, sửa ràng buộc, policy, xóa hoặc sửa hàng loạt dữ liệu thật: hỏi owner trước.
- Không ghi secret, mật khẩu, dữ liệu cá nhân (CCCD, sổ đỏ, số điện thoại nông hộ) vào repo, chat hay nơi khách thấy. Giữ nguyên các lớp lọc che số trong API, báo cáo khách.
- Chữ trên giao diện viết tiếng Việt, ngắn gọn, giao diện phải dùng tốt trên điện thoại (rộng 390px, không cuộn ngang).
- Địa chỉ web: https://sfportal.github.io/bvi-dieu-hanh/ . Supabase project ref: `pkckduidwfcncipwzdxa`.
