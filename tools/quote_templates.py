# Mẫu báo giá, hợp đồng nạp sẵn (từ báo giá TXNG ca cao 18/11/2026, báo giá tổng hợp FarmBase 18/11/2026 và khung hợp đồng dịch vụ BVI).
# Chạy: python3 tools/quote_templates.py > supabase/sales_quotes_seed.sql
import json

def ul(*xs): return "<ul>" + "".join("<li>" + x + "</li>" for x in xs) + "</ul>"
def tb(head, *rows):
    h = "<table><thead><tr>" + "".join("<th>" + x + "</th>" for x in head) + "</tr></thead><tbody>"
    return h + "".join("<tr>" + "".join("<td>" + c + "</td>" for c in r) + "</tr>" for r in rows) + "</tbody></table>"
def T(h, html): return {"t": "text", "h": h, "html": html}
def I(h, rows, vat=8, total_label="TỔNG THANH TOÁN", note="", per=""):
    return {"t": "items", "h": h, "rows": [dict(zip(["name", "unit", "qty", "price"], r)) for r in rows], "vat": vat, "total_label": total_label, "note": note, "per": per}

HIEU_LUC = "<p>Giá áp dụng đến hết 12/2026, có thay đổi sẽ được cập nhật. Đây là giá tham khảo, có thể điều chỉnh theo thực tế hoặc nội dung cụ thể khi hai bên trao đổi.</p>"
LIEN_HE = "<p>Tư vấn: {{nguoi_lap}} · Điện thoại/Zalo {{dien_thoai}} · Email: {{email}} · farmbase.vn</p><p>Trân trọng đồng hành cùng Quý đối tác.</p>"
CHUA_GOM = "Chưa gồm: tem, nhãn, in ấn vật lý; chứng nhận VietGAP, GlobalG.A.P., hữu cơ; xét nghiệm, kiểm nghiệm đất, nước, sản phẩm, dư lượng; lệ phí nhà nước; chi phí dịch vụ bên thứ ba."
TRACH_NHIEM = "Quý đơn vị chịu trách nhiệm xác nhận tính đúng của dữ liệu; việc {{cong_ty_ngan}} hỗ trợ nhập liệu không thay thế trách nhiệm của chủ thể sản xuất."
SETUP = "Thiết lập phần mềm FarmBase (một lần; mặc định quản lý 03 vùng trồng)"
MODULE = "Module kết nối hệ thống truy xuất nguồn gốc nông sản của Bộ Nông nghiệp và Môi trường"
VUNG4 = "Vùng trồng thêm, tính từ vùng thứ 4 trở đi"

txng = {"title": "BÁO GIÁ VÀ ĐỀ XUẤT GIẢI PHÁP TRUY XUẤT NGUỒN GỐC TRÊN FARMBASE", "subtitle": "[Tên vùng trồng · địa chỉ · diện tích · mã số vùng trồng nếu có]", "blocks": [
  T("", "<p>{{cong_ty}} trân trọng gửi {{khach_hang}} báo giá giải pháp truy xuất nguồn gốc, vận hành dữ liệu vùng trồng trên nền tảng FarmBase, giải pháp do BVI và Salefronts đồng phát triển. Nông sản tốt cần được chứng minh bằng hồ sơ vùng trồng minh bạch.</p>"),
  T("1. Hiểu nhu cầu của Quý đơn vị", ul(
    "Duy trì mã sau khi cấp: Nghị quyết 36/2026/NQ-CP chuyển sang hậu kiểm, tự khai và nhật ký điện tử; vùng cần nhật ký canh tác liên tục, đúng thực tế để giữ mã còn hiệu lực.",
    "Dữ liệu rời rạc: thông tin lô, nông hộ, nhật ký, thu hoạch nằm ở nhiều sổ, file và nhóm Zalo; khó tổng hợp khi cơ quan quản lý hoặc khách hàng hỏi.",
    "Truy xuất đến từng lô: khách mua và hệ thống truy xuất nguồn gốc nông sản quốc gia ngày càng yêu cầu chứng minh nguồn gốc theo vùng, theo lô, theo đợt thu hoạch.",
    "Phối hợp với nông hộ: cán bộ phải đi từng vườn để thu thông tin; nông hộ khó tự ghi chép bằng sổ giấy.")),
  T("2. Giải pháp đề xuất", tb(["Bước", "Nội dung", "Việc chính"],
    ["1", "Khảo sát dữ liệu", "Danh sách lô, nông hộ, bản đồ vùng đã dùng khi làm hồ sơ mã"],
    ["2", "Thiết lập", "Tài khoản tổ chức, phân quyền nhân viên; tạo vùng, lô, nông hộ (nhập Excel hàng loạt)"],
    ["3", "Nhật ký, dữ liệu", "Nông hộ ghi nhật ký trên Zalo Mini App (danh mục phân bón, thuốc, ảnh bao bì); {{cong_ty_ngan}} hỗ trợ nhập nhật ký nếu Quý đơn vị cần"],
    ["4", "Truy xuất, kết nối", "QR vùng và QR từng lô, trang truy xuất; đồng bộ nhật ký với hệ thống truy xuất nguồn gốc nông sản của Bộ Nông nghiệp và Môi trường"],
    ["5", "Duy trì", "Theo dõi số bản ghi cần đồng bộ, cập nhật thu hoạch theo đợt, hỗ trợ qua Zalo, email; sẵn sàng khi đón hậu kiểm"])
    + "<p>FarmBase không cấp mã; cấp mã thuộc cơ quan có thẩm quyền.</p>"),
  T("3. Phạm vi và đầu ra bàn giao", ul("Tài khoản tổ chức trên FarmBase và tài khoản nhân viên theo vai trò.", "Dữ liệu vùng trồng trên hệ thống; bản đồ vùng.", "QR vùng trồng và QR từng lô; trang truy xuất có thư viện ảnh, tài liệu.", "Hướng dẫn Zalo Mini App cho nông hộ; 01 buổi hướng dẫn ban đầu (online hoặc trực tiếp).")
    + "<p>Tiến độ dự kiến: bàn giao tài khoản, dữ liệu và QR trong khoảng 20 ngày kể từ khi nhận đủ dữ liệu vùng trồng.</p>"),
  I("4. Báo giá năm thứ nhất", [[SETUP, "lần", 1, 5000000], [MODULE, "năm", 1, 5000000], [VUNG4, "vùng/năm", 0, 2000000]], total_label="TỔNG THANH TOÁN NĂM THỨ NHẤT",
    note="<p>Căn cứ tính: [số] vùng trồng ([diện tích] ha), [số] vụ thu hoạch/năm. Phí phần mềm tính theo vùng trồng. Nếu chọn {{cong_ty_ngan}} hỗ trợ nhập nhật ký, cộng 5.000.000 đ/vụ/vùng (trước thuế).</p>"),
  I("Từ năm thứ hai (mỗi năm)", [["Duy trì phần mềm FarmBase (mặc định quản lý 03 vùng trồng)", "năm", 1, 5000000], [MODULE, "năm", 1, 5000000], [VUNG4, "vùng/năm", 0, 2000000]], total_label="TỔNG THANH TOÁN MỖI NĂM", per="/năm"),
  T("5. Thanh toán", ul("Năm thứ nhất: thanh toán 2 đợt, 50% khi ký hợp đồng và 50% còn lại khi bàn giao.", "Từ năm thứ hai: phí năm trả đầu năm.", "Dịch vụ kết nối chuyên gia kỹ thuật (nếu phát sinh): thanh toán theo thực tế từng lần.")),
  {"t": "bank", "h": ""},
  T("6. Điều kiện và nội dung chưa bao gồm", ul(CHUA_GOM, TRACH_NHIEM)),
  T("7. Hiệu lực báo giá", HIEU_LUC),
  T("8. Liên hệ tư vấn", LIEN_HE),
  {"t": "sign"}]}

saurieng = {"title": "BÁO GIÁ MÃ SỐ VÙNG TRỒNG VÀ TRUY XUẤT NGUỒN GỐC SẦU RIÊNG", "subtitle": "[Tên vùng · địa chỉ · diện tích ha · số hộ]", "blocks": [
  T("", "<p>{{cong_ty}} trân trọng gửi {{khach_hang}} báo giá hỗ trợ mã số vùng trồng và truy xuất nguồn gốc sầu riêng trên nền tảng FarmBase. Thị trường mặc định: xuất khẩu chính ngạch sang Trung Quốc.</p>"),
  T("1. Các gói dịch vụ (tính theo ha, chưa gồm thuế GTGT 8%)", tb(["Hạng mục", "Đơn giá"],
    ["Mã số vùng trồng: khảo sát, GPS, bản đồ, hồ sơ kỹ thuật, hỗ trợ đến khi có mã GACC", "3.000.000 đ/ha"],
    ["Gói Cơ bản: mã số vùng trồng + thiết lập phần mềm FarmBase; Quý đơn vị tự nhập nhật ký", "3.500.000 đ/ha"],
    ["Gói Trọn gói (khuyến nghị): Gói Cơ bản + hỗ trợ nhập nhật ký 12 tháng", "4.500.000 đ/ha"],
    ["Truy xuất có hỗ trợ nhập liệu (vùng đã có mã): phần mềm + nhập nhật ký 12 tháng", "1.500.000 đ/ha/năm"],
    ["Truy xuất tự nhập liệu: phần mềm FarmBase, Quý đơn vị tự nhập nhật ký", "800.000 đ/ha/năm"])
    + "<p>BVI khuyến nghị khoảng 10 ha mỗi mã vùng trồng để tối ưu chi phí; vùng nhỏ hơn vẫn nhận, có thể gộp các hộ liền kề qua HTX, tổ hợp tác.</p>"),
  I("2. Báo giá cho Quý đơn vị", [["Gói Trọn gói: mã số vùng trồng + thiết lập FarmBase + hỗ trợ nhập nhật ký 12 tháng", "ha", 10, 4500000]],
    note="<p>Kỳ sử dụng phần mềm: 12 tháng. Phí duy trì sau kỳ: [xác nhận] (tham chiếu 800.000 đ/ha/năm).</p>"),
  T("3. Thanh toán", ul("Đợt 1: 50% khi xác nhận triển khai.", "Đợt 2: 50% còn lại sau khi thiết lập, bàn giao.")),
  {"t": "bank", "h": ""},
  T("4. Điều kiện và nội dung chưa bao gồm", ul(CHUA_GOM, "{{cong_ty_ngan}} hỗ trợ kỹ thuật, hồ sơ và dữ liệu, không cấp mã. Việc cấp mã thuộc cơ quan có thẩm quyền và phía Trung Quốc (GACC), thời gian xét duyệt không nằm trong tiến độ cam kết.",
    "Đất đang tranh chấp không đăng ký được; đất thuê phải có hồ sơ thuê.", "Chưa gồm duy trì, hậu kiểm mã số vùng trồng hằng năm sau khi được cấp mã.", TRACH_NHIEM)),
  T("5. Hiệu lực báo giá", HIEU_LUC),
  T("6. Liên hệ tư vấn", LIEN_HE),
  {"t": "sign"}]}

tonghop = {"title": "BÁO GIÁ TỔNG HỢP DỊCH VỤ", "subtitle": "Mã số vùng trồng · Truy xuất nguồn gốc · Cơ sở đóng gói trên FarmBase", "blocks": [
  T("", "<p>{{cong_ty}} trân trọng gửi Quý đơn vị bảng giá tổng hợp các dịch vụ trên nền tảng FarmBase, giải pháp do BVI và Salefronts đồng phát triển. Đơn giá trong các bảng chưa gồm thuế GTGT 8%. Quý đơn vị chọn hạng mục phù hợp; chúng tôi lập báo giá chi tiết theo quy mô thực tế.</p>"),
  T("1. Sầu riêng: mã số vùng trồng và truy xuất nguồn gốc (tính theo ha)", tb(["Hạng mục", "Đơn giá"],
    ["Mã số vùng trồng: khảo sát, GPS, bản đồ, hồ sơ kỹ thuật, hỗ trợ đến khi có mã GACC", "3.000.000 đ/ha"],
    ["Gói Cơ bản: mã số vùng trồng + thiết lập phần mềm FarmBase; Quý đơn vị tự nhập nhật ký", "3.500.000 đ/ha"],
    ["Gói Trọn gói (khuyến nghị): Gói Cơ bản + hỗ trợ nhập nhật ký 12 tháng", "4.500.000 đ/ha"],
    ["Truy xuất có hỗ trợ nhập liệu (vùng đã có mã)", "1.500.000 đ/ha/năm"],
    ["Truy xuất tự nhập liệu", "800.000 đ/ha/năm"],
    ["Hỗ trợ nhập liệu thêm (tối thiểu 02 nhật ký/tháng/ha)", "700.000 đ/ha/năm"])
    + "<p>Hình thức đứng mã khác: doanh nghiệp/HTX do BVI giới thiệu đứng mã trả 3.500.000 đ/ha, trả trước 50% thì triển khai, miễn phí với nông hộ. Tổ hợp tác/HTX của bà con đứng tên: khoảng 20.000.000 đ/vùng, đợt 1 khoảng 15.000.000 đ khi triển khai, đợt 2 là 5.000.000 đ chỉ thu khi vùng được cấp mã GACC.</p>"),
  T("2. Cây trồng chủ lực khác (ca cao, cà phê, hồ tiêu, …): truy xuất nguồn gốc (tính theo vùng)", tb(["Hạng mục", "Đơn giá"],
    [SETUP, "5.000.000 đ"], ["Duy trì phần mềm FarmBase (từ năm thứ hai; mặc định 03 vùng trồng)", "5.000.000 đ/năm"], [MODULE, "5.000.000 đ/năm"],
    [VUNG4, "2.000.000 đ/vùng/năm"], ["Hỗ trợ nhập nhật ký (tùy chọn)", "5.000.000 đ/vụ/vùng"], ["Mã số vùng trồng cho cây trồng khác", "Báo giá sau khảo sát"])),
  T("3. Cơ sở đóng gói", tb(["Hạng mục", "Đơn giá"],
    ["Phần mềm cơ sở đóng gói (từ 11/2026)", "Thiết lập 5.000.000 đ (một lần); duy trì 5.000.000 đ/năm"],
    ["Kết nối GS1 + truy xuất nguồn gốc, đã gồm 03 sản phẩm (SKU)", "5.000.000 đ/năm"],
    ["Sản phẩm thêm, tên miền riêng", "Từ sản phẩm thứ 4: 2.000.000 đ/sản phẩm/năm; tên miền riêng 2.000.000 đ/năm; dùng tên miền BVI miễn phí"],
    ["Mã số cơ sở đóng gói sầu riêng", "Báo giá sau khi nhận thông tin, hình ảnh, video thực tế của cơ sở"])),
  T("4. Mã QR động truy xuất nguồn gốc", "<p>Giá giảm dần theo số lượng, tính lũy tiến từng bậc, hiệu lực 01 năm.</p>" + tb(["Số mã/năm", "Đơn giá"],
    ["Dưới 10.000 mã", "100 đ/mã"], ["Từ 10.000 – 50.000 mã", "80 đ/mã"], ["Trên 50.000 – 100.000 mã", "72 đ/mã"], ["Trên 100.000 – 200.000 mã", "64 đ/mã"], ["Trên 200.000 – 500.000 mã", "56 đ/mã"], ["Trên 500.000 mã", "50 đ/mã"])),
  T("5. Dịch vụ kết nối chuyên gia kỹ thuật canh tác theo nhu cầu", tb(["Hạng mục", "Đơn giá"],
    ["Tập huấn, hướng dẫn kỹ thuật canh tác (tối đa 20 người/buổi)", "Online 2.000.000 đ/chuyên gia/buổi; trực tiếp 4.000.000 đ/chuyên gia/buổi"],
    ["Công tác thực địa (nếu phát sinh)", "Xăng xe 2.000.000 đ/ngày; công tác phí 2.000.000 đ/ngày/người"])
    + "<p>Các gói phần mềm đã gồm 01 buổi hướng dẫn sử dụng FarmBase ban đầu và hỗ trợ qua Zalo, email, tài liệu.</p>"),
  T("6. Thanh toán", ul("Năm thứ nhất: 50% khi ký hợp đồng và 50% còn lại khi bàn giao.", "Từ năm thứ hai: phí năm thanh toán đầu năm. Hỗ trợ nhập nhật ký (nếu chọn): trả đầu vụ.", "Dịch vụ kết nối chuyên gia, công tác thực địa: thanh toán theo thực tế từng lần.")),
  {"t": "bank", "h": ""},
  T("7. Điều kiện và nội dung chưa bao gồm", ul(CHUA_GOM, "Hỗ trợ kỹ thuật, hồ sơ và dữ liệu; không cấp mã. Việc cấp mã thuộc cơ quan có thẩm quyền và phía Trung Quốc (GACC), thời gian xét duyệt không nằm trong tiến độ cam kết.", TRACH_NHIEM)),
  T("8. Hiệu lực báo giá", HIEU_LUC),
  T("9. Liên hệ tư vấn", LIEN_HE),
  {"t": "sign"}]}

hopdong = {"title": "HỢP ĐỒNG DỊCH VỤ", "subtitle": "Triển khai nền tảng FarmBase: [mã số vùng trồng / truy xuất nguồn gốc / cơ sở đóng gói]", "blocks": [
  T("", ul("Căn cứ Bộ luật Dân sự năm 2015;", "Căn cứ Luật Thương mại năm 2005;", "Căn cứ nhu cầu của Bên A và khả năng cung cấp dịch vụ của Bên B.") + "<p>Hôm nay, ngày {{ngay}}, chúng tôi gồm:</p>"),
  {"t": "parties"},
  T("Điều 1. Nội dung dịch vụ", "<p>Bên B cung cấp cho Bên A dịch vụ: [chọn: hỗ trợ mã số vùng trồng sầu riêng / truy xuất nguồn gốc trên FarmBase theo vùng / phần mềm cơ sở đóng gói], chi tiết phạm vi và đầu ra tại Phụ lục 1.</p>"
    + ul("Hình thức đứng mã: [DN/HTX do BVI giới thiệu đứng mã / THT, HTX của bà con đứng tên / HTX hợp tác sâu, thu mua nội bộ].", "Chưa gồm VietGAP, xét nghiệm, kiểm nghiệm của bên thứ ba. Nội dung nước nhập khẩu yêu cầu thêm ngoài phạm vi sẽ được hai bên thống nhất chi phí bằng phụ lục.")),
  T("Điều 2. Thời gian thực hiện", ul("Khảo sát: [ngày]; cấu hình, tập huấn: [ngày]; bàn giao: [ngày].", "Tiến độ được điều chỉnh khi có thay đổi do thực địa, thời tiết hoặc dữ liệu đầu vào.", "Thời gian xét duyệt, cấp mã phụ thuộc cơ quan có thẩm quyền và nước nhập khẩu, không tính vào tiến độ cam kết của Bên B.")),
  T("Điều 3. Giá trị hợp đồng và thanh toán", "<p>Tổng giá trị hợp đồng: <b>{{tong}} đồng</b> (bằng chữ: {{tong_chu}}), đã gồm thuế GTGT, chi tiết tại Phụ lục 2.</p>"
    + ul("Đợt 1: 50% khi ký hợp đồng.", "Đợt 2: 50% còn lại khi nghiệm thu, bàn giao.", "Phí định kỳ (nếu có) thanh toán đầu kỳ; chi phí công tác, tập huấn thêm thanh toán theo thực tế có xác nhận.", "Chuyển khoản vào {{tai_khoan}}. Bên B xuất hóa đơn, chứng từ đầy đủ.")),
  T("Điều 4. Trách nhiệm của Bên A", ul("Cung cấp dữ liệu trung thực, ảnh, nhật ký thực tế; cử đầu mối phối hợp.", "Cam kết đất trong vùng không tranh chấp; cung cấp hồ sơ thuê với đất thuê.", "Phối hợp khảo sát, ký hồ sơ, xác nhận dữ liệu; thanh toán đúng hạn.", "Việc Bên B hỗ trợ nhập liệu không thay thế trách nhiệm xác nhận của chủ thể sản xuất.")),
  T("Điều 5. Trách nhiệm của Bên B", ul("Thực hiện đúng phạm vi kỹ thuật, hồ sơ tại Phụ lục 1.", "01 buổi hướng dẫn ban đầu; hỗ trợ qua Zalo, email, tài liệu trong kỳ sử dụng.", "Tập huấn kỹ thuật thêm theo nhu cầu: online 2.000.000 đ/chuyên gia/buổi, trực tiếp 4.000.000 đ/chuyên gia/buổi, tối đa 20 người/buổi, chưa gồm di chuyển, ăn uống, lưu trú.")),
  T("Điều 6. Nghiệm thu và bàn giao", "<p>Hai bên đối chiếu dữ liệu, bản đồ, hồ sơ, tài khoản và phân quyền, nhật ký, QR, minh chứng tập huấn theo phạm vi; ghi sai lệch, hạn khắc phục và ký biên bản nghiệm thu.</p>"),
  T("Điều 7. Bảo mật và dữ liệu", "<p>Dữ liệu của Bên A chỉ dùng đúng mục đích hợp đồng. Hai bên thống nhất phạm vi dữ liệu hiển thị công khai trên trang truy xuất; Bên B sao lưu dữ liệu và hỗ trợ xuất, bàn giao dữ liệu khi kết thúc hợp đồng.</p>"),
  T("Điều 8. Loại trừ và phát sinh", "<p>Chưa gồm: tem, in ấn; chứng nhận VietGAP, GlobalG.A.P.; xét nghiệm, kiểm nghiệm; lệ phí nhà nước; dịch vụ bên thứ ba; yêu cầu bổ sung của nước nhập khẩu; chi phí duy trì, hậu kiểm mã số vùng trồng hằng năm sau khi được cấp mã. Phát sinh chỉ thực hiện khi hai bên xác nhận bằng văn bản (phụ lục bổ sung).</p>"),
  T("Điều 9. Chấm dứt hợp đồng", "<p>Hợp đồng chấm dứt khi hai bên hoàn thành nghĩa vụ, hoặc theo thỏa thuận, hoặc khi một bên vi phạm nghiêm trọng và không khắc phục trong [số] ngày kể từ khi nhận thông báo. Khi chấm dứt, hai bên đối soát phí, dữ liệu và tài sản đã bàn giao.</p>"),
  T("Điều 10. Giải quyết tranh chấp", "<p>Tranh chấp được giải quyết trước hết bằng thương lượng; không thương lượng được thì đưa ra [cơ quan giải quyết]. Mức phạt vi phạm: [hai bên thỏa thuận]. Quyết định cấp, duy trì mã phụ thuộc thẩm định của cơ quan có thẩm quyền; Bên B không bảo đảm kết quả cấp mã.</p>"),
  T("Điều 11. Hiệu lực", "<p>Hợp đồng có hiệu lực từ ngày ký, lập thành 02 bản có giá trị như nhau, mỗi bên giữ 01 bản. Các phụ lục là bộ phận không tách rời của hợp đồng.</p>"),
  T("Phụ lục 1. Phạm vi và đầu ra", ul("Vùng: [tên vùng, địa chỉ, diện tích, số hộ, tình trạng đất].", "Đầu ra: [tài khoản, dữ liệu, bản đồ, QR, hồ sơ, tập huấn].")),
  I("Phụ lục 2. Bảng phí", [[SETUP, "lần", 1, 5000000], [MODULE, "năm", 1, 5000000]], total_label="TỔNG GIÁ TRỊ HỢP ĐỒNG",
    note=HIEU_LUC),
  {"t": "sign"}]}

TPL = [
  ("tpl-txng-vung", "quote", "Báo giá truy xuất nguồn gốc cây trồng chủ lực (theo vùng)", "Ca cao, cà phê, hồ tiêu… Theo mẫu báo giá Ca cao Trọng Đức 18/11/2026.", txng, 10),
  ("tpl-sr-ha", "quote", "Báo giá mã số vùng trồng sầu riêng (theo ha)", "Gói Cơ bản, Trọn gói, truy xuất theo ha.", saurieng, 20),
  ("tpl-tong-hop", "quote", "Bảng giá tổng hợp dịch vụ FarmBase", "Gửi khách mới chưa rõ nhu cầu. Theo báo giá tổng hợp 18/11/2026.", tonghop, 30),
  ("tpl-hd-farmbase", "contract", "Hợp đồng dịch vụ FarmBase", "Khung 11 điều. Bản dự thảo: các ô [ ] phải điền; cần BVI và bộ phận pháp lý rà soát trước khi ký.", hopdong, 40),
]

def q(s): return "'" + s.replace("'", "''") + "'"
out = ["-- Dữ liệu mẫu: 3 doanh nghiệp cung cấp, 4 mẫu báo giá, hợp đồng. Chạy lại an toàn (đã có thì giữ nguyên, không ghi đè bản bạn đã sửa).",
  "insert into public.sales_companies(code,name,short_name,tax_id,address,phone,email,website,rep_name,rep_title,banks,note,sort) values",
  "('bvi','Công ty Cổ phần BVI','BVI','6001653877','150 Phan Huy Chú, Phường Thành Nhất, tỉnh Đắk Lắk','0911 423 839','info@bvi.vn','farmbase.vn','Trương Công Tài','Giám đốc',"
  + q(json.dumps([{"bank": "Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)", "branch": "Chi nhánh Đắk Lắk", "number": "3721077979", "holder": "Công ty Cổ phần BVI"}], ensure_ascii=False)) + "::jsonb,'Người đại diện cần đối chiếu Giấy ĐKDN.',10),",
  "('an-nong','Hợp tác xã Nông nghiệp Công nghệ Xanh An Nông','HTX An Nông',null,null,null,null,null,null,null,'[]'::jsonb,'Cần bổ sung MST, địa chỉ, người đại diện, tài khoản ngân hàng.',20),",
  "('salefronts','Salefronts','Salefronts',null,null,null,null,null,null,null,'[]'::jsonb,'Cần bổ sung tên pháp nhân đầy đủ, MST, địa chỉ, người đại diện, tài khoản ngân hàng.',30)",
  "on conflict (code) do nothing;"]
for code, kind, name, desc, body, sort in TPL:
    out.append("insert into public.sales_templates(code,kind,name,description,company_id,body,sort) select " + ",".join([q(code), q(kind), q(name), q(desc)])
               + ",(select id from public.sales_companies where code='bvi')," + q(json.dumps(body, ensure_ascii=False)) + "::jsonb," + str(sort) + " on conflict (code) do nothing;")
print("\n".join(out))
