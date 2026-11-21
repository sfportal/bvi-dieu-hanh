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


# ---------- Văn bản gửi xã, phường (từ công văn Ea Kiết, Krông Pắc, công văn mẫu tiếp cận xã và hướng dẫn MSVT 27/10/2026) ----------
KG = "<p><b>Kính gửi:</b></p><p>- Ủy ban nhân dân {{xa}};</p><p>- Phòng Kinh tế {{xa}}.</p>"
CAN_CU = ul("Căn cứ Luật Trồng trọt số 31/2018/QH14 ngày 19/11/2018;",
  "Căn cứ Nghị định số 77/2019/NĐ-CP ngày 10/10/2019 của Chính phủ về tổ hợp tác;",
  "Căn cứ Thông tư số 06/2021/TT-BNNPTNT ngày 08/7/2021 của Bộ Nông nghiệp và Phát triển nông thôn (nay là Bộ Nông nghiệp và Môi trường) quy định về xây dựng và quản lý vùng trồng;",
  "Căn cứ Nghị quyết số 36/2026/NQ-CP của Chính phủ về đơn giản hóa thủ tục hành chính liên quan đến mã số vùng trồng, mã số cơ sở đóng gói;",
  "Căn cứ Nghị định số 372/2026/NĐ-CP ngày 29/9/2026 của Chính phủ quy định về hoạt động định danh, xác thực, truy xuất nguồn gốc sản phẩm, hàng hóa;",
  "Căn cứ Quyết định số 5272/QĐ-BNNMT ngày 13/12/2025 của Bộ Nông nghiệp và Môi trường ban hành Kế hoạch thí điểm truy xuất nguồn gốc quả sầu riêng và Công văn số 7812/BNNMT-KHCN ngày 15/7/2026 về triển khai Hệ thống truy xuất nguồn gốc nông sản;")
TU_NGUYEN = "<p>Việc cấp, quản lý mã số vùng trồng thuộc thẩm quyền cơ quan quản lý nhà nước; {{cong_ty_ngan}} hỗ trợ kỹ thuật, hồ sơ và vận hành hệ thống, không cam kết thời gian cấp mã. Bà con tự nguyện tham gia, không phát sinh nghĩa vụ bắt buộc sử dụng dịch vụ của {{cong_ty_ngan}}; dữ liệu cá nhân được bảo mật theo Nghị định số 13/2023/NĐ-CP.</p>"
LH_XA = "<p>Đầu mối liên hệ: bà Ngọc, điện thoại/Zalo: {{dien_thoai}}; email: {{email}}. Cán bộ phụ trách: {{nguoi_lap}}. {{cong_ty_ngan}} kính đề nghị Quý cơ quan thông tin họ tên, chức vụ, số điện thoại cán bộ đầu mối để hai bên thống nhất kế hoạch chi tiết.</p><p>{{cong_ty}} trân trọng cảm ơn sự quan tâm, phối hợp của Quý cơ quan./.</p>"
NOI_NHAN = {"t": "sign", "html": "<b>Nơi nhận:</b><br>- Như trên;<br>- Hiệp hội Sầu riêng tỉnh Đắk Lắk;<br>- Lưu: VT, BVI."}
CHI_PHI_MOI = ("<p>Tính cho một vùng trồng do tổ hợp tác, hợp tác xã của bà con đứng tên, từ khi lập hồ sơ đến khi được cấp mã; chỉ gồm các khoản thực tế phải chi, công khai trước khi triển khai:</p>"
  + ul("Đợt 1, khi triển khai: 15.000.000 đồng/vùng, gồm đi lại và công tác phí chuyên gia thực địa (03 ngày, vùng cách dưới 30 km), in ấn hồ sơ, chụp flycam, vật tư (bẫy côn trùng, biển thông tin vùng, bảo hộ), thù lao người đại diện vùng và hậu cần đợt kiểm tra thực địa;",
       "Đợt 2, chỉ khi vùng được cấp mã: 5.000.000 đồng/vùng (phí hoàn thiện hồ sơ); vùng chưa được cấp mã không phải trả khoản này.")
  + "<p>Tổng khoảng 20.000.000 đồng/vùng, tương đương khoảng 2.000.000 đồng/ha với vùng 10 ha. Chưa gồm chi phí duy trì, hậu kiểm mã số vùng trồng hằng năm sau khi được cấp mã, lệ phí nhà nước và dịch vụ của bên thứ ba (nếu có). Ngày thực địa phát sinh tính thêm theo thực tế.</p>")

gioi_thieu = {"title": "", "subtitle": "đề xuất phối hợp hỗ trợ bà con về truy xuất nguồn gốc, mã số vùng trồng trên địa bàn {{xa}}", "to": KG, "blocks": [
  T("", "<p>Thực hiện Nghị quyết số 36/2026/NQ-CP của Chính phủ về đơn giản hóa thủ tục hành chính liên quan đến mã số vùng trồng, mã số cơ sở đóng gói; Nghị định số 372/2026/NĐ-CP ngày 29/9/2026 của Chính phủ quy định về hoạt động định danh, xác thực, truy xuất nguồn gốc sản phẩm, hàng hóa (hiệu lực từ ngày 01/01/2027) và Kế hoạch truy xuất nguồn gốc nông sản của Bộ Nông nghiệp và Môi trường, {{cong_ty}} (sau đây gọi là {{cong_ty_ngan}}) kính đề xuất phối hợp cùng Quý cơ quan hỗ trợ bà con trên địa bàn như sau:</p>"),
  T("1. Những vấn đề thực tiễn địa phương đang gặp", ul(
    "Vùng trồng đã có mã: nhật ký canh tác chủ yếu ghi trên giấy, thiếu hồ sơ phân bón, thuốc bảo vệ thực vật, thu hoạch; khi hậu kiểm hoặc lô hàng bị cảnh báo, mã số vùng trồng có nguy cơ bị tạm dừng, thu hồi. Từ ngày 01/01/2027, dữ liệu truy xuất nguồn gốc cần được kết nối với hệ thống quốc gia.",
    "Ủy ban nhân dân xã: theo Nghị quyết số 36/2026/NQ-CP, xã trực tiếp tiếp nhận, kiểm tra hồ sơ mã số vùng trồng trong 10 ngày làm việc và theo dõi việc duy trì mã sau cấp, nhưng chưa có công cụ nắm dữ liệu vùng trồng trên địa bàn.",
    "Hộ dân chưa có mã: có nhu cầu nhưng chưa rõ điều kiện, hồ sơ, trình tự; chưa có tổ hợp tác, hợp tác xã đại diện đứng tên mã số vùng trồng nên dễ phụ thuộc, thiếu minh bạch.",
    "Kỹ thuật và tổ chức sản xuất: bà con còn hạn chế về VietGAP, giám sát sinh vật gây hại (ISPM 6); nhiều hợp tác xã, tổ hợp tác quản lý chưa hiệu quả.")),
  T("2. Nội dung {{cong_ty_ngan}} đề xuất hỗ trợ", "<p>a) Tổ chức 01 buổi đào tạo, tập huấn tại xã (thời gian, địa điểm do Quý cơ quan sắp xếp): truy xuất nguồn gốc, hậu kiểm và duy trì mã số vùng trồng; trình tự đăng ký mã số vùng trồng, thành lập tổ hợp tác; chuyên đề VietGAP, ISPM 6, quản lý hợp tác xã. {{cong_ty_ngan}} chuẩn bị nội dung, tài liệu, giảng viên.</p>"
    "<p>b) Miễn phí 01 năm sử dụng nền tảng FarmBase cho các vùng trồng đã có mã số (không bao gồm chi phí thực địa phát sinh, nếu có): ghi nhật ký canh tác trên Zalo, không cần cài ứng dụng; đồng bộ dữ liệu với Hệ thống truy xuất nguồn gốc nông sản của Bộ Nông nghiệp và Môi trường.</p>"
    "<p>c) Bàn giao miễn phí tài khoản quản lý cấp xã để Quý cơ quan theo dõi danh sách vùng trồng, tình hình ghi nhật ký và dữ liệu truy xuất trên địa bàn.</p>"
    "<p>d) Đồng hành bà con làm mã số vùng trồng mới do tổ hợp tác, hợp tác xã đứng tên: hướng dẫn thành lập tổ hợp tác theo Nghị định số 77/2019/NĐ-CP (hoặc củng cố hợp tác xã sẵn có) để bà con chủ động đứng tên, quản lý mã; hỗ trợ hồ sơ theo Nghị quyết số 36/2026/NQ-CP từ mã nội địa đến khi được cấp mã xuất khẩu, với chi phí tối thiểu tại mục 3.</p>"
    "<p>Chương trình áp dụng trước cho cây sầu riêng và có thể mở rộng cho cà phê, các cây trồng xuất khẩu chủ lực khác của xã.</p>"),
  T("3. Chi phí tối thiểu triển khai mã số vùng trồng cho bà con", CHI_PHI_MOI + "<p>Nguồn kinh phí: bà con, tổ hợp tác tự chi trả; Quý cơ quan xem xét lồng ghép nguồn hợp pháp; hoặc doanh nghiệp thu mua cùng chia sẻ.</p>"),
  T("4. Năng lực của {{cong_ty_ngan}}", "<p>{{cong_ty_ngan}} là đơn vị cung cấp giải pháp tích hợp với Hệ thống truy xuất nguồn gốc nông sản của Bộ Nông nghiệp và Môi trường; hội viên Hiệp hội Sầu riêng tỉnh Đắk Lắk. Nền tảng FarmBase do BVI và Salefronts đồng phát triển.</p>"),
  T("5. Kính đề nghị Quý cơ quan", ul("Cử 01 cán bộ đầu mối phối hợp; cung cấp danh sách vùng trồng đã có mã số (mã nội địa, mã xuất khẩu) trên địa bàn; cho ý kiến về chi phí tại mục 3;",
    "Chọn ngày tổ chức; thông báo, mời đại diện vùng trồng, hộ dân, hợp tác xã, tổ hợp tác, doanh nghiệp; bố trí hội trường, âm thanh, máy chiếu.") + TU_NGUYEN + LH_XA),
  NOI_NHAN]}

CT_SK = tb(["Thời gian", "Nội dung", "Phụ trách"],
  ["08h15 – 08h30", "Đón tiếp đại biểu; đăng ký tham dự", "{{cong_ty_ngan}}, UBND xã"],
  ["08h30 – 08h45", "Tuyên bố lý do, giới thiệu đại biểu; phát biểu chỉ đạo; phát biểu của Hiệp hội Sầu riêng tỉnh Đắk Lắk", "UBND xã, Hiệp hội"],
  ["08h45 – 09h05", "<b>Phần 1.</b> Quy định về truy xuất nguồn gốc; Hệ thống truy xuất nguồn gốc nông sản của Bộ Nông nghiệp và Môi trường", "{{cong_ty_ngan}}"],
  ["09h05 – 09h25", "Hậu kiểm, duy trì mã số vùng trồng: nhật ký canh tác, phân bón, thuốc bảo vệ thực vật, thời gian cách ly, bẫy côn trùng, kho vật tư, hồ sơ thu hoạch", "{{cong_ty_ngan}}, đơn vị phối hợp"],
  ["09h25 – 09h45", "Hướng dẫn sơ bộ ứng dụng FarmBase; đăng ký sử dụng miễn phí 01 năm cho vùng đã có mã (không gồm chi phí thực địa phát sinh, nếu có)", "{{cong_ty_ngan}}"],
  ["09h45 – 10h05", "<b>Phần 2.</b> Mã số vùng trồng: lợi ích, quyền và nghĩa vụ; điều kiện, hồ sơ, trình tự đăng ký mã nội địa và mã GACC", "{{cong_ty_ngan}}"],
  ["10h05 – 10h25", "Thành lập tổ hợp tác để chủ động đứng tên mã số vùng trồng; đăng ký, hậu kiểm, duy trì mã; đăng ký nhận hỗ trợ", "{{cong_ty_ngan}}, đơn vị phối hợp"],
  ["10h25 – 11h05", "<b>Phần 3.</b> Chuyên đề lựa chọn: VietGAP; ISPM 6; kỹ thuật canh tác, xử lý sau thu hoạch; hoặc quản lý hợp tác xã, tổ hợp tác", "Chuyên gia đối tác"],
  ["11h05 – 11h30", "Trao đổi, giải đáp; hỗ trợ đăng ký tại chỗ; tổng kết, bế mạc", "{{cong_ty_ngan}}, UBND xã"])
DK_SK = ("<p><b>A. Vùng trồng đã có mã số (tham gia Phần 1 và Phần 3)</b></p>" + tb(["TT", "Tên vùng trồng, chủ thể quản lý", "Mã số vùng trồng", "Loại mã (GACC, nội địa)", "Cây trồng, diện tích (ha), số hộ", "Người đại diện, điện thoại", "Đăng ký FarmBase miễn phí 01 năm"], ["1", "", "", "", "", "", ""], ["2", "", "", "", "", "", ""], ["3", "", "", "", "", "", ""])
  + "<p><b>B. Hộ dân có nhu cầu đăng ký mã số vùng trồng (tham gia Phần 2 và Phần 3)</b></p>" + tb(["TT", "Họ và tên", "Thôn, buôn", "Cây trồng", "Diện tích (ha)", "Nhu cầu (tìm hiểu, lập tổ hợp tác, đăng ký hỗ trợ làm mã)", "Điện thoại"], ["1", "", "", "", "", "", ""], ["2", "", "", "", "", "", ""], ["3", "", "", "", "", "", ""])
  + "<p><i>Thông tin cá nhân trong danh sách chỉ dùng để tổ chức tập huấn và hỗ trợ đăng ký; {{cong_ty_ngan}} bảo mật theo quy định về bảo vệ dữ liệu cá nhân.</i></p>")
su_kien = {"title": "", "subtitle": "đề nghị phối hợp tổ chức chương trình đào tạo, tập huấn truy xuất nguồn gốc, mã số vùng trồng trên địa bàn {{xa}}", "to": KG, "blocks": [
  T("", CAN_CU + "<p>{{cong_ty}} (sau đây gọi là {{cong_ty_ngan}}), hội viên Hiệp hội Sầu riêng tỉnh Đắk Lắk, kính đề nghị Ủy ban nhân dân {{xa}} và Phòng Kinh tế {{xa}} (sau đây gọi chung là Quý cơ quan) phối hợp tập hợp các vùng trồng, hộ dân, hợp tác xã, tổ hợp tác và doanh nghiệp trên địa bàn tham gia chương trình đào tạo, tập huấn về truy xuất nguồn gốc, mã số vùng trồng và kỹ thuật sản xuất, tổ chức trong 01 buổi gồm ba phần chuyên đề, cụ thể như sau:</p>"),
  T("I. MỤC ĐÍCH, YÊU CẦU", ul("Phổ biến quy định hiện hành về truy xuất nguồn gốc và mã số vùng trồng; hướng dẫn vùng trồng đã có mã thực hiện truy xuất nguồn gốc tích hợp với Hệ thống truy xuất nguồn gốc nông sản của Bộ Nông nghiệp và Môi trường (txng.mae.gov.vn), đáp ứng yêu cầu hậu kiểm và duy trì mã.",
    "Giúp hộ dân có nhu cầu nắm rõ trình tự đăng ký mã số vùng trồng, cách thành lập tổ hợp tác để chủ động đứng tên mã, quyền và nghĩa vụ khi hậu kiểm, duy trì mã.",
    "Cập nhật kiến thức thực hành sản xuất tốt, kiểm dịch thực vật, kỹ thuật canh tác, xử lý sau thu hoạch và quản lý hợp tác xã, tổ hợp tác.",
    "Tổng hợp nhu cầu đăng ký sử dụng FarmBase và đăng ký hỗ trợ xây dựng mã số vùng trồng làm cơ sở thống nhất kế hoạch triển khai.",
    "Áp dụng trước cho cây sầu riêng, có thể mở rộng cho cà phê và cây trồng xuất khẩu chủ lực khác; không làm phát sinh nghĩa vụ bắt buộc sử dụng dịch vụ của {{cong_ty_ngan}}.")),
  T("II. ĐỐI TƯỢNG THAM GIA", "<p>1. Vùng trồng đã có mã số (mã GACC, mã nội địa): người đại diện vùng, hợp tác xã, tổ hợp tác, doanh nghiệp quản lý vùng, cán bộ kỹ thuật và nông hộ ghi nhật ký.</p><p>2. Hộ dân có nhu cầu đăng ký mã số vùng trồng, người dân muốn liên kết thành lập tổ hợp tác.</p><p>3. Đại biểu: lãnh đạo Ủy ban nhân dân xã, Phòng Kinh tế xã; Hiệp hội Sầu riêng tỉnh Đắk Lắk; đơn vị phối hợp, chuyên gia đối tác nông nghiệp; hợp tác xã, tổ hợp tác, doanh nghiệp thu mua, xuất khẩu trên địa bàn.</p>"),
  T("III. NỘI DUNG ĐÀO TẠO, TẬP HUẤN", "<p><b>Phần 1 – Truy xuất nguồn gốc (vùng đã có mã):</b> Nghị định số 372/2026/NĐ-CP (hiệu lực từ 01/01/2027); hậu kiểm, duy trì mã: nhật ký canh tác, phân bón, thuốc bảo vệ thực vật đúng danh mục, thời gian cách ly, bẫy côn trùng, kho vật tư, hồ sơ thu hoạch, các trường hợp mã bị tạm dừng, thu hồi; hướng dẫn FarmBase (web cho hợp tác xã, Zalo Mini App cho nông dân); đăng ký dùng miễn phí 01 năm, tạo tài khoản tại chỗ.</p>"
    "<p><b>Phần 2 – Mã số vùng trồng (hộ dân có nhu cầu):</b> lợi ích, quyền và nghĩa vụ; làm mã không ảnh hưởng quyền sử dụng đất, chủ vườn vẫn toàn quyền mua bán; điều kiện, hồ sơ, trình tự đăng ký mã nội địa theo Nghị quyết số 36/2026/NQ-CP (nộp tại Ủy ban nhân dân xã qua Cổng Dịch vụ công, xã kiểm tra trong 10 ngày làm việc) và các bước đề nghị cấp mã GACC; yêu cầu đất không tranh chấp, đất thuê phải có hồ sơ thuê; thành lập tổ hợp tác theo Nghị định số 77/2019/NĐ-CP; đăng ký nhận hỗ trợ xây dựng mã.</p>"
    "<p><b>Phần 3 – Chuyên đề kỹ thuật và quản lý (tất cả các nhóm):</b> lựa chọn theo nhu cầu địa phương: VietGAP; ISPM 6 (giám sát sinh vật gây hại); kỹ thuật canh tác, xử lý sau thu hoạch; quản lý hợp tác xã, tổ hợp tác.</p>"),
  T("IV. THỜI GIAN, ĐỊA ĐIỂM, QUY MÔ DỰ KIẾN", ul("Thời gian: [khoảng ngày đề xuất], trong 01 buổi (sáng hoặc chiều), khoảng 03 giờ; ngày cụ thể theo sắp xếp của Quý cơ quan.",
    "Địa điểm: Hội trường Ủy ban nhân dân {{xa}} (hoặc địa điểm do Quý cơ quan bố trí).", "Quy mô: khoảng [số người] người.")),
  T("V. PHÂN CÔNG THỰC HIỆN", "<p><b>1. {{cong_ty}}:</b> chuẩn bị nội dung, tài liệu, giảng viên, trình chiếu; mời chuyên gia đối tác cho Phần 3; cung cấp mẫu danh sách đăng ký (Phụ lục 02); hỗ trợ tạo tài khoản FarmBase tại chỗ; tổng hợp kết quả gửi Quý cơ quan sau buổi tập huấn. Kinh phí hậu cần (nếu có) hai bên thống nhất trước khi tổ chức.</p>"
    "<p><b>2. Kính đề nghị Quý cơ quan:</b> cử cán bộ đầu mối phối hợp; rà soát danh sách vùng trồng đã có mã GACC, mã nội địa và mời đại diện tham gia Phần 1; thông báo qua truyền thanh, các thôn, buôn để hộ dân đăng ký Phần 2, Phần 3; bố trí hội trường, âm thanh, máy chiếu; cử lãnh đạo, cán bộ tham dự.</p>"),
  T("VI. ĐĂNG KÝ VÀ LIÊN HỆ", "<p>Kính đề nghị Quý cơ quan tổng hợp danh sách đăng ký theo Phụ lục 02 và gửi về {{cong_ty_ngan}} trước ngày [hạn gửi danh sách] để chuẩn bị tài liệu, tài khoản phù hợp số lượng tham dự.</p>" + TU_NGUYEN + LH_XA),
  NOI_NHAN,
  T("PHỤ LỤC 01. CHƯƠNG TRÌNH DỰ KIẾN", CT_SK + "<p><i>Thời gian, nội dung và chuyên đề Phần 3 có thể điều chỉnh theo đề nghị của Quý cơ quan.</i></p>"),
  T("PHỤ LỤC 02. MẪU DANH SÁCH ĐĂNG KÝ THAM GIA", DK_SK)]}

CT_THON = tb(["Thời gian", "Nội dung", "Thực hiện"],
  ["08h00 – 08h15", "Đón tiếp; đăng ký tham dự", "{{cong_ty_ngan}}, thôn, buôn"],
  ["08h15 – 08h25", "Khai mạc, giới thiệu chương trình", "Phòng Kinh tế, trưởng thôn, buôn"],
  ["08h25 – 09h05", "Mã số vùng trồng: lợi ích, quyền và nghĩa vụ; điều kiện, hồ sơ, trình tự đăng ký", "{{cong_ty_ngan}}"],
  ["09h05 – 09h30", "Hai hình thức đứng mã: thành lập tổ hợp tác để chủ động đứng tên, hoặc liên kết hợp tác xã phù hợp", "{{cong_ty_ngan}}, Phòng Kinh tế, đại diện HTX"],
  ["09h30 – 10h05", "Hậu kiểm và duy trì mã: nhật ký canh tác, phân bón, thuốc bảo vệ thực vật, thời gian cách ly, bẫy côn trùng, kho vật tư, hồ sơ thu hoạch", "{{cong_ty_ngan}}"],
  ["10h05 – 10h40", "Nghị định số 372/2026/NĐ-CP; truy xuất nguồn gốc trên FarmBase, liên thông hệ thống của Bộ Nông nghiệp và Môi trường, định danh GS1", "{{cong_ty_ngan}}"],
  ["10h40 – 11h10", "Thực hành: cài Zalo Mini App, ghi nhật ký mẫu; hướng dẫn cán bộ xã dùng tài khoản giám sát", "{{cong_ty_ngan}}"],
  ["11h10 – 11h30", "Trao đổi, giải đáp; đăng ký nhu cầu theo Phụ lục 02; bế mạc", "{{cong_ty_ngan}}, thôn, buôn"])
NC_THON = tb(["TT", "Thôn, buôn", "Số hộ có nhu cầu", "Cây trồng", "Diện tích dự kiến (ha)", "Hình thức (tự lập THT, liên kết HTX, chưa chọn)", "Thời gian tập huấn mong muốn", "Người liên hệ"], ["1", "", "", "", "", "", "", ""], ["2", "", "", "", "", "", "", ""], ["3", "", "", "", "", "", "", ""])
trien_khai = {"title": "", "subtitle": "đề nghị phối hợp, kết nối các thôn, buôn tổ chức tập huấn, hướng dẫn nông dân đăng ký, hậu kiểm, duy trì mã số vùng trồng và ứng dụng truy xuất nguồn gốc trên địa bàn {{xa}}", "to": KG, "blocks": [
  T("", CAN_CU + "<p>{{cong_ty}} (sau đây gọi là {{cong_ty_ngan}}), hội viên Hiệp hội Sầu riêng tỉnh Đắk Lắk, là đơn vị phát triển và vận hành nền tảng FarmBase phục vụ quản lý vùng trồng, nhật ký canh tác điện tử và truy xuất nguồn gốc. Nhằm giúp bà con chủ động đăng ký, hậu kiểm, duy trì mã số vùng trồng và sẵn sàng đáp ứng yêu cầu truy xuất nguồn gốc khi Nghị định số 372/2026/NĐ-CP có hiệu lực từ ngày 01/01/2027, {{cong_ty_ngan}} kính đề nghị Ủy ban nhân dân {{xa}} giao Phòng Kinh tế (sau đây gọi chung là Quý cơ quan) phối hợp triển khai chương trình, kết nối các thôn, buôn để tổ chức tập huấn tại chỗ, cụ thể như sau:</p>"),
  T("I. MỤC ĐÍCH, YÊU CẦU", ul("Giúp nông dân, tổ hợp tác, hợp tác xã nắm rõ điều kiện, hồ sơ, trình tự để chủ động đứng tên đăng ký mã số vùng trồng; tự thực hiện hậu kiểm, duy trì mã, hạn chế phụ thuộc đơn vị trung gian.",
    "Tập huấn theo từng thôn, buôn hoặc cụm thôn, buôn; bà con tự chọn hình thức đứng mã: (1) liên kết các hộ liền vùng thành lập tổ hợp tác; hoặc (2) liên kết với hợp tác xã phù hợp trên địa bàn. Việc lựa chọn hoàn toàn do bà con quyết định.",
    "Hướng dẫn ghi nhật ký canh tác điện tử, truy xuất nguồn gốc trên FarmBase, liên thông Hệ thống truy xuất nguồn gốc nông sản của Bộ Nông nghiệp và Môi trường và định danh sản phẩm theo chuẩn GS1.",
    "Bàn giao, hướng dẫn tài khoản giám sát truy xuất nguồn gốc cấp xã, hỗ trợ Quý cơ quan kiểm tra, hậu kiểm mã số vùng trồng theo Nghị quyết số 36/2026/NQ-CP.",
    "Áp dụng trước cho cây sầu riêng, có thể mở rộng cho cà phê và cây trồng xuất khẩu chủ lực khác. Không thay thế thẩm quyền của cơ quan nhà nước trong cấp, quản lý mã số vùng trồng.")),
  T("II. NỘI DUNG CHƯƠNG TRÌNH", "<p><b>1. Hướng dẫn nông dân chủ động với mã số vùng trồng:</b> a) Đăng ký: lợi ích, quyền và nghĩa vụ (không ảnh hưởng quyền sử dụng đất, chủ vườn vẫn toàn quyền mua bán); điều kiện, hồ sơ, trình tự đăng ký mã nội địa theo Nghị quyết số 36/2026/NQ-CP và các bước đề nghị mã xuất khẩu; hai hình thức đứng mã. b) Hậu kiểm: hồ sơ, hiện trường trước kiểm tra; nhật ký; phân bón, thuốc đúng danh mục, thời gian cách ly; bẫy côn trùng; kho vật tư; hồ sơ thu hoạch, tiêu thụ. c) Duy trì: trách nhiệm người đại diện và thành viên; cập nhật thay đổi diện tích, chủ hộ, giống; lịch giám sát hằng năm; nhận diện sớm sai phạm có nguy cơ bị tạm dừng, thu hồi mã.</p>"
    "<p><b>2. Hướng dẫn truy xuất nguồn gốc FarmBase:</b> nông dân ghi nhật ký, lưu ảnh bao bì vật tư, cập nhật thu hoạch qua Zalo Mini App; hợp tác xã, tổ hợp tác quản lý trên web; dữ liệu đồng bộ lên hệ thống của Bộ Nông nghiệp và Môi trường (txng.mae.gov.vn) theo nguyên tắc ghi một lần, dùng nhiều mục đích; hỗ trợ định danh sản phẩm, lô hàng, tem QR theo chuẩn GS1; phổ biến Nghị định số 372/2026/NĐ-CP; hướng dẫn cán bộ Phòng Kinh tế dùng tài khoản giám sát.</p>"
    "<p><b>3. Hình thức:</b> hội nghị triển khai tại xã; tập huấn tại thôn, buôn (khoảng 03 giờ mỗi buổi, chương trình tại Phụ lục 01); tổng hợp nhu cầu theo Phụ lục 02; hỗ trợ lập tổ hợp tác hoặc kết nối hợp tác xã, hoàn thiện hồ sơ nộp Ủy ban nhân dân xã; hướng dẫn tại vườn; hỗ trợ qua Zalo, điện thoại.</p>"),
  T("III. KINH PHÍ", ul("Chương trình không đề nghị sử dụng ngân sách nhà nước.",
    "Tài khoản giám sát cấp xã miễn phí; hướng dẫn truy xuất nguồn gốc cho nông hộ miễn phí đến hết ngày 31/12/2026; vùng đã có mã dùng FarmBase miễn phí năm đầu (không gồm chi phí thực địa phát sinh, nếu có).",
    "Tổ hợp tác, hợp tác xã đề nghị {{cong_ty_ngan}} hỗ trợ xây dựng hồ sơ mã số vùng trồng mới: chi phí công khai, thỏa thuận trước, tinh gọn để hỗ trợ người dân.",
    "Người dân, tổ chức tham gia là chủ sở hữu dữ liệu; dữ liệu cá nhân được bảo mật theo Nghị định số 13/2023/NĐ-CP.")),
  T("IV. PHÂN CÔNG THỰC HIỆN", "<p><b>1. {{cong_ty}}:</b> chuẩn bị nội dung, tài liệu, giảng viên; phối hợp trưởng thôn, buôn tổ chức tập huấn; tổng hợp nhu cầu, tư vấn hình thức đứng mã; hướng dẫn cán bộ Phòng Kinh tế dùng tài khoản giám sát; báo cáo kết quả định kỳ hằng quý.</p>"
    "<p><b>2. Kính đề nghị Ủy ban nhân dân {{xa}}:</b> cho chủ trương triển khai; giao Phòng Kinh tế làm đầu mối; chỉ đạo trưởng thôn, buôn, chi hội nông dân thông báo, tổng hợp nhu cầu, bố trí nhà văn hóa; giới thiệu hợp tác xã hoạt động hiệu quả để bà con liên kết.</p>"
    "<p><b>3. Kính đề nghị Phòng Kinh tế {{xa}}:</b> cử cán bộ đầu mối; cung cấp danh sách vùng trồng đã có mã, đang đề nghị cấp mã, danh sách hợp tác xã, tổ hợp tác; thống nhất lịch tập huấn với các thôn, buôn; cử cán bộ tham dự.</p>"),
  T("V. THỜI GIAN DỰ KIẾN", ul("[Tháng triển khai]: làm việc thống nhất kế hoạch; rà soát danh sách vùng trồng; hội nghị triển khai tại xã và lập lịch tập huấn theo thôn, buôn.",
    "Tập huấn lần lượt tại các thôn, buôn có nhu cầu; hướng dẫn tại vườn; hỗ trợ lập tổ hợp tác hoặc liên kết hợp tác xã; hỗ trợ áp dụng truy xuất nguồn gốc theo Nghị định số 372/2026/NĐ-CP.") + TU_NGUYEN + LH_XA),
  NOI_NHAN,
  T("PHỤ LỤC 01. CHƯƠNG TRÌNH DỰ KIẾN BUỔI TẬP HUẤN TẠI THÔN, BUÔN", CT_THON),
  T("PHỤ LỤC 02. MẪU TỔNG HỢP NHU CẦU THEO THÔN, BUÔN", NC_THON + "<p><i>Phòng Kinh tế phối hợp trưởng thôn, buôn tổng hợp và gửi {{cong_ty_ngan}} để bố trí lịch. Danh sách hộ chi tiết do thôn, buôn quản lý.</i></p>")]}

huong_dan = {"layout": "doc", "title": "HƯỚNG DẪN BÀ CON LÀM MÃ SỐ VÙNG TRỒNG", "subtitle": "Tài liệu phát cho bà con tại {{xa}} · Áp dụng trước cho cây sầu riêng, có thể dùng cho cà phê và cây xuất khẩu khác", "blocks": [
  T("1. Mã số vùng trồng là gì, có lợi gì", "<p>Mã số vùng trồng là mã định danh cho một vùng trồng một loại cây, gắn với các thửa đất và nhóm hộ đã đăng ký. Với sầu riêng xuất khẩu chính ngạch sang Trung Quốc, chỉ trái từ vùng có mã được phía Trung Quốc (GACC) phê duyệt và đi qua cơ sở đóng gói có mã mới được xuất.</p>"
    + ul("Bán được cho doanh nghiệp xuất khẩu chính ngạch, giá ổn định hơn.", "Làm mã <b>không ảnh hưởng quyền sử dụng đất</b>; chủ vườn vẫn toàn quyền quyết định bán cho ai.", "Từ ngày 01/01/2027 (Nghị định số 372/2026/NĐ-CP), sản phẩm cần truy xuất được nguồn gốc; có mã và nhật ký giúp bà con sẵn sàng.")),
  T("2. Điều kiện tham gia", ul("Diện tích: Nghị quyết số 36/2026/NQ-CP đã bỏ yêu cầu diện tích tối thiểu. {{cong_ty_ngan}} khuyến nghị khoảng 10 ha mỗi mã để chi phí trên mỗi ha thấp (không bắt buộc); vùng nhỏ nên gộp các hộ, vườn liền kề.",
    "Đất rõ ràng: không đang tranh chấp. Đất thuê, mượn phải có hợp đồng thuê còn hiệu lực, ghi rõ thửa, thời hạn, chủ đất đồng ý. Lô không đủ giấy tờ để ngoài vùng.",
    "Có đơn vị đứng tên: tổ hợp tác hoặc hợp tác xã, có người đại diện vùng.",
    "Cam kết ghi nhật ký canh tác, chỉ dùng thuốc bảo vệ thực vật được phép, không đưa trái ngoài vùng vào bán chung mã.")),
  T("3. Ai đứng tên mã", "<p>Bà con tự chọn, không ai được ép:</p>" + ul("<b>Tự lập tổ hợp tác</b> với các hộ liền vùng theo Nghị định số 77/2019/NĐ-CP: ký hợp đồng hợp tác, bầu người đại diện, bà con chủ động quản lý mã.",
    "<b>Liên kết hợp tác xã</b> phù hợp trên địa bàn: hợp tác xã đứng tên, bà con là thành viên hoặc hộ liên kết; thỏa thuận rõ quyền lợi, giá, tiêu chuẩn, thời điểm thu mua.")),
  T("4. Giấy tờ cần chuẩn bị", ul("Căn cước công dân của chủ hộ (bản chụp, chỉ dùng cho hồ sơ mã, được bảo mật).", "Giấy chứng nhận quyền sử dụng đất (sổ đỏ) hoặc số tờ, số thửa; đất thuê kèm hợp đồng thuê.",
    "Thông tin vườn: diện tích, số cây, giống, năm trồng, sản lượng dự kiến.", "Danh sách hộ tham gia, có chữ ký.", "Hợp đồng hợp tác của tổ hợp tác hoặc giấy xác nhận là thành viên hợp tác xã.")),
  T("5. Các bước làm mã", tb(["Bước", "Việc cần làm", "Ai làm"],
    ["1", "Họp dân, khảo sát vườn, chọn hộ và đơn vị đứng tên", "Bà con, {{cong_ty_ngan}}"],
    ["2", "Thu giấy tờ, lập tổ hợp tác hoặc liên kết hợp tác xã", "Bà con, đại diện vùng"],
    ["3", "Đo ranh, lấy tọa độ, chụp flycam, lập bản đồ từng lô", "{{cong_ty_ngan}}"],
    ["4", "Treo biển vùng, đặt bẫy côn trùng, sắp xếp kho thuốc; tập huấn ghi nhật ký", "Bà con, {{cong_ty_ngan}}"],
    ["5", "Ghi nhật ký phân bón, thuốc, sâu bệnh, thu hoạch trên Zalo FarmBase", "Từng hộ"],
    ["6", "Nộp hồ sơ tại Ủy ban nhân dân xã qua Cổng Dịch vụ công; xã kiểm tra thực địa trong 10 ngày làm việc", "Đại diện vùng, UBND xã"],
    ["7", "Tỉnh, Bộ gửi danh sách sang nước nhập khẩu; chỉ xuất khẩu được từ ngày phía Trung Quốc phê duyệt", "Cơ quan nhà nước"])),
  T("6. Sau khi có mã: giữ mã thế nào", ul("Ghi nhật ký đều đặn cả vụ, không ghi dồn.", "Dùng thuốc đúng danh mục, đúng liều, đủ thời gian cách ly; giữ vỏ bao bì, hóa đơn.", "Kiểm tra bẫy côn trùng định kỳ; báo ngay khi có sâu bệnh lạ.",
    "Báo đại diện vùng khi thay đổi diện tích, chủ hộ, giống.", "Sẵn sàng hồ sơ và hiện trường khi đoàn hậu kiểm đến. Vi phạm có thể bị tạm dừng hoặc thu hồi mã.")),
  T("7. Chi phí tham khảo", CHI_PHI_MOI + "<p>Bà con có thể tự làm theo hướng dẫn tại xã. Việc cấp mã thuộc cơ quan nhà nước và nước nhập khẩu; {{cong_ty_ngan}} hỗ trợ kỹ thuật, hồ sơ, không cam kết thời gian cấp mã.</p>"),
  T("8. Liên hệ", "<p>Đăng ký tập huấn, hỗ trợ: bà Ngọc, điện thoại/Zalo {{dien_thoai}}; email {{email}}. Hoặc liên hệ Phòng Kinh tế {{xa}}.</p>")]}

TPL = [
  ("tpl-txng-vung", "quote", "Báo giá truy xuất nguồn gốc cây trồng chủ lực (theo vùng)", "Ca cao, cà phê, hồ tiêu… Theo mẫu báo giá Ca cao Trọng Đức 18/11/2026.", txng, 10),
  ("tpl-sr-ha", "quote", "Báo giá mã số vùng trồng sầu riêng (theo ha)", "Gói Cơ bản, Trọn gói, truy xuất theo ha.", saurieng, 20),
  ("tpl-tong-hop", "quote", "Bảng giá tổng hợp dịch vụ FarmBase", "Gửi khách mới chưa rõ nhu cầu. Theo báo giá tổng hợp 18/11/2026.", tonghop, 30),
  ("tpl-cv-gioi-thieu", "letter", "Công văn giới thiệu BVI, đề xuất đồng hành TXNG và mã số vùng trồng", "Gửi lần đầu cho UBND xã, phường. Có chi phí làm mã mới 15 tr + 5 tr.", gioi_thieu, 50),
  ("tpl-cv-su-kien", "letter", "Công văn đề nghị phối hợp tổ chức sự kiện tập huấn TXNG, MSVT", "Khi xã đồng ý làm sự kiện. Kèm chương trình 1 buổi và mẫu danh sách đăng ký.", su_kien, 60),
  ("tpl-cv-trien-khai", "letter", "Công văn đề nghị phối hợp triển khai TXNG, tập huấn theo thôn, buôn", "Sau buổi làm việc hoặc hội nghị: triển khai rộng theo thôn, buôn.", trien_khai, 70),
  ("tpl-hd-mvt-nong-dan", "letter", "Tài liệu hướng dẫn bà con làm mã số vùng trồng", "Phát cho bà con tại buổi tập huấn hoặc gửi xã in, chia sẻ Zalo.", huong_dan, 80),
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
