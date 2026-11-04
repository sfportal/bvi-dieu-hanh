-- Danh bạ liên hệ: cho phép collection 'contacts' trong bảng docs; thêm nhãn nhật ký cho trường mới
alter table public.docs drop constraint if exists docs_col_check;
alter table public.docs add constraint docs_col_check check (col = any (array['zones','people','tasks','contracts','daily','units','events','leaves','faqs','supports','contacts']));
create or replace function public.log_label(c text, k text) returns text language sql immutable as $function$
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
    when 'prio' then 'độ ưu tiên' when 'eta' then 'ngày dự kiến có mã' when 'inspected' then 'xã đã kiểm tra' when 'party' then 'bên phụ trách'
    when 'org' then 'cơ quan' when 'zalo' then 'Zalo' when 'email' then 'email' when 'type' then 'loại'
    else k end $function$;
