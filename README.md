# BVI Điều hành

Ứng dụng quản lý nội bộ của Công ty CP BVI: mã số vùng trồng, công việc, lịch công tác, hồ sơ, hợp đồng, nhân sự, nghỉ phép, thu chi, báo cáo cho khách, API cho đối tác.

| Thành phần | Địa chỉ |
|---|---|
| Ứng dụng | https://sfportal.github.io/bvi-dieu-hanh/ |
| Báo cáo công khai cho khách | https://sfportal.github.io/bvi-dieu-hanh/bao-cao.html?t=… |
| Hướng dẫn API cho đối tác | https://sfportal.github.io/bvi-dieu-hanh/api.html |
| Mã nguồn | https://github.com/sfportal/bvi-dieu-hanh (nhánh `main`) |
| Dữ liệu, đăng nhập | Supabase, project ref `pkckduidwfcncipwzdxa` |

Đẩy code lên nhánh `main` là GitHub Pages tự xuất bản lại sau khoảng 1 đến 2 phút. Không có bước build trên máy chủ: file `index.html` trong repo chính là file chạy.

---

## 1. Cho tài khoản Claude khác (hoặc người mới) cùng làm

### 1.1 Cấp quyền một lần

1. **GitHub**: owner repo vào *Settings › Collaborators* của `sfportal/bvi-dieu-hanh`, mời tài khoản GitHub của người mới với quyền **Write**.
2. **Claude kết nối GitHub**: người mới đăng nhập claude.ai bằng tài khoản Claude của họ, vào https://claude.ai/connect-github để nối GitHub. Nếu Claude chưa thấy repo, cài Claude GitHub App cho repo tại https://github.com/apps/claude/installations/select_target (chọn `sfportal`, chọn repo `bvi-dieu-hanh`).
3. **Supabase (chỉ khi cần sửa máy chủ, cơ sở dữ liệu)**: owner vào Supabase Dashboard › Organization › Team, mời email người mới. Người mới thêm connector Supabase trong claude.ai (*Settings › Connectors*) và đăng nhập bằng tài khoản đã được mời. Không có quyền này thì Claude vẫn sửa được giao diện web, chỉ không sửa được Edge Function và dữ liệu.

### 1.2 Bắt đầu một phiên làm việc

- **Claude Code trên web** (claude.ai/code): tạo phiên mới, chọn repo `sfportal/bvi-dieu-hanh`. Claude tự đọc `CLAUDE.md` và file này.
- **Claude Code trên máy**:
  ```bash
  git clone https://github.com/sfportal/bvi-dieu-hanh.git
  cd bvi-dieu-hanh
  claude
  ```
- Câu mở đầu gợi ý: *"Đọc README.md và CLAUDE.md. Sau đó: <việc cần làm>. Sửa trong tools/, chạy bash tools/check.sh, commit và push lên main."*

### 1.3 Quy tắc khi nhiều người cùng sửa

- Luôn `git pull origin main` trước khi sửa và trước khi push.
- Mỗi việc một commit nhỏ, thông điệp nói rõ đã đổi gì. Không `push --force` lên `main`.
- **Xung đột ở `index.html`**: đừng sửa tay. Giải quyết xung đột ở `tools/core.js`, `tools/source.html`, `tools/build.py`, rồi chạy lại `bash tools/check.sh` để dựng lại `index.html` và commit.
- Sửa Edge Function: sửa file trong `supabase/functions/<tên>/index.ts`, triển khai, rồi commit cùng lúc để repo luôn khớp với bản đang chạy.

---

## 2. Cấu trúc repo

```
index.html              Ứng dụng (file DỰNG RA, không sửa tay)
bao-cao.html            Trang báo cáo công khai cho khách (sửa trực tiếp)
api.html                Trang hướng dẫn API, MCP cho đối tác (sửa trực tiếp)
huong-dan/              Tài liệu hướng dẫn sử dụng (PDF)
tools/
  source.html           Bản gốc giao diện: toàn bộ màn hình, CSS, logic chính
  core.js               Lớp Supabase và các tính năng thêm sau: đăng nhập, tài khoản,
                        nhật ký, API đối tác, báo cáo cho khách, thu chi…
  build.py              Ghép source.html + core.js và áp các thay thế R(cũ, mới) -> ../index.html
  check.sh              Dựng lại index.html và kiểm tra cú pháp JavaScript
supabase/
  functions/            Edge Function (Deno), mỗi thư mục một hàm
  *.sql                 SQL đã chạy cho các bảng phụ (tham khảo)
apps-script/Code.gs     Apps Script cầu nối Google Drive (dán vào script.google.com)
```

### 2.1 Sửa giao diện, thêm tính năng

1. Sửa `tools/core.js` (ưu tiên cho tính năng mới) hoặc `tools/source.html`.
2. Nếu cần chèn vào chỗ có sẵn trong `source.html` (thêm trang, thêm nút ở trang cũ), thêm một dòng `R('chuỗi cũ', 'chuỗi mới')` vào `tools/build.py`, **đặt trước** dòng ghi file cuối. `R` báo lỗi nếu chuỗi cũ không xuất hiện đúng 1 lần.
3. Chạy `bash tools/check.sh` (cần `python3` và `node`).
4. Thử: mở `index.html` bằng trình duyệt. Lưu ý trang dùng **dữ liệu thật** trên Supabase sau khi đăng nhập.
5. Commit cả `tools/*` và `index.html`, push.

Thêm một trang mới: thêm mã trang vào `NAV`, `VLAB` và `navOk` trong `source.html`, thêm route trong `build.py` (xem các dòng có `"api"` và `"thu-chi"` làm mẫu), viết `vTenTrang()` và `bindTenTrang(A)` trong `core.js`.

---

## 3. Máy chủ (Supabase)

### 3.1 Bảng dữ liệu (schema `public`, đều bật RLS)

| Bảng | Nội dung |
|---|---|
| `docs` | Mọi dữ liệu nghiệp vụ dạng JSON: cột `col` (loại), `id`, `data`. Các loại `col` được phép: zones, people, tasks, contracts, daily, units, events, leaves, faqs, supports, contacts (ràng buộc `docs_col_check`). Muốn thêm loại mới phải sửa ràng buộc này. |
| `profiles` | Tài khoản đăng nhập: `role` (owner, manager, staff, viewer), `person_id` (gắn nhân sự), `can_finance`, `active`. |
| `contract_fin` | Số tiền hợp đồng, chỉ owner và người có `can_finance` đọc được. |
| `app_secrets` | Khóa, giá trị. Không có policy nên chỉ Edge Function (service role) đọc ghi. Tiền tố khóa: `apikey:` khóa API (chỉ lưu sha256), `apiuse:` lượt dùng, `share:` bản báo cáo đã phát hành, `shareview:` lượt xem, `sharedraft:` bản nháp báo cáo, `exp:` phiếu thu chi. |
| `activity_log` | Nhật ký thao tác. Không ghi số tiền. |

Quyền ghi `docs`: owner, manager ghi mọi loại; staff ghi mọi loại trừ people, units, contracts; viewer chỉ đọc.

Quyền tính năng bật theo từng nhân sự (trong `docs` loại people): `canPlan` (kế hoạch tuần), `canLeave` (duyệt nghỉ phép), `canExpense` (ghi thu chi). Owner bật trong trang Tài khoản.

Storage: bucket `files` (công khai, tệp đính kèm thường), bucket `receipts` (riêng tư, ảnh chứng từ thu chi, chỉ xem qua link ký có hạn).

### 3.2 Edge Function

Tất cả đặt `verify_jwt = false` vì mỗi hàm tự kiểm tra đăng nhập và vai trò.

| Hàm | Việc | Secret cần |
|---|---|---|
| `admin-users` | Tạo, sửa, khóa tài khoản (chỉ owner) | không |
| `api` | API REST chỉ đọc cho đối tác `/api/v1/...`, quản lý khóa `/api/admin`, máy chủ MCP `/api/mcp` | không |
| `share` | Bản nháp, phát hành, thu hồi link báo cáo khách; trang công khai đọc bằng `GET ?t=` | không |
| `expense` | Thu chi: tải ảnh, tự đọc chứng từ, lưu, duyệt | `ANTHROPIC_API_KEY` (đọc ảnh tự động), `OCR_MODEL` (tùy chọn) |
| `drive` | Tải tệp lên Google Drive, đếm tệp hồ sơ qua Apps Script | `DRIVE_GAS_URL`, `DRIVE_GAS_TOKEN` |

Secret đặt ở Supabase Dashboard › Edge Functions › Secrets. **Không bao giờ ghi secret vào repo hay vào chat.**

Triển khai một hàm:
- Bằng Supabase CLI: `supabase functions deploy <tên> --project-ref pkckduidwfcncipwzdxa --no-verify-jwt`
- Hoặc qua connector Supabase trong Claude (công cụ deploy edge function), dán đúng nội dung file trong repo.

### 3.3 Thay đổi cơ sở dữ liệu

Tạo bảng, sửa ràng buộc, policy là thay đổi trên hệ thống thật: **phải được owner đồng ý trước**. Lưu câu SQL đã chạy vào `supabase/<tên>.sql`. Không tạo tài khoản bằng SQL, dùng trang Tài khoản (hàm `admin-users`).

---

## 4. Nghiệp vụ cần biết

Các bước mã vùng trồng (trường `step` của zones, từ 0 đến 8):

0 Mở quan hệ xã · 1 Gom dân, chốt hình thức · 2 Khảo sát từng lô · 3 Thu giấy tờ · 4 Tập huấn, ký hồ sơ · 5 Xã kiểm tra · 6 Nộp DVC, chờ mã nội địa · 7 Phía Trung Quốc bổ sung · 8 Mã GACC, duy trì

Lịch (`events`): `status` là draft (nháp, tự tạo từ công việc), plan (đã duyệt), done, cancel. Gắn vùng qua `zoneId`, `unitId` hoặc `taskIds`.

---

## 5. Bảo mật dữ liệu (bắt buộc)

- Không đưa CCCD, số sổ đỏ, số điện thoại nông hộ, chi phí nội bộ ra bất kỳ chỗ nào khách hay đối tác thấy (báo cáo khách, API, MCP, file xuất). API, báo cáo khách đều có lớp lọc che chuỗi số dài (`•••`); giữ nguyên lớp lọc này khi sửa.
- Số tiền chỉ hiện cho owner và tài khoản có quyền xem tài chính. Nhật ký không ghi số tiền.
- Mật khẩu (kể cả mật khẩu FarmBase của khách) không lưu trong hệ thống, gửi riêng qua Zalo.
- Không commit dữ liệu thật (bản sao lưu, ảnh hồ sơ, danh sách nông hộ) vào repo. Ảnh minh họa dùng dữ liệu mẫu.
- Khóa `sb_publishable_…` trong `index.html` là khóa công khai được phép; dữ liệu được bảo vệ bằng RLS. Khóa service role chỉ nằm trong Edge Function.
