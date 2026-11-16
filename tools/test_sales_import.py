"""Kiểm thử nhập lead: python3 tools/test_sales_import.py"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from sales_import import map_row, sql_value, to_sql

H = ['ID', 'Tên tổ chức', 'Nhóm', 'Loại hình', 'Tỉnh (mới)', 'Tỉnh cũ/Địa bàn', 'Cây', 'Địa chỉ', 'Điện thoại (tổ chức)',
     'Email/Web/Fanpage', 'Người đại diện/đầu mối', 'MST', 'Quy mô', 'Dấu hiệu nhu cầu', 'Dịch vụ nên chào', 'Ưu tiên',
     'Cách tiếp cận', 'Trạng thái xác minh', 'Nguồn URL', 'Mới/Cũ', 'Cập nhật 14/11', 'Cập nhật 15/11', 'Người phụ trách',
     'Ngày liên hệ', 'Kết quả, bước tiếp', 'Có trong danh sách', 'Tình trạng liên hệ', 'Mức chứng cứ liên hệ',
     'Là khách hiện có?', 'Ghi chú gộp']


def row(**kw):
    base = {h: None for h in H}
    base.update({'ID': 1, 'Tên tổ chức': 'Công ty CP XNK Dũng Thái Sơn', 'Nhóm': 'Khách hàng: DN đóng gói, xuất khẩu',
                 'Điện thoại (tổ chức)': '0983408009', 'Ưu tiên': 'A', 'Tình trạng liên hệ': 'Có SĐT, thiếu email/web',
                 'Trạng thái xác minh': 'Một phần đã xác minh', 'Nguồn URL': 'https://x.vn/a'})
    base.update(kw)
    return tuple(base[h] for h in H)


def test_basic_mapping():
    r = map_row(H, row())
    assert r['ext_id'] == '1' and r['priority'] == 'A' and r['org_phone'] == '0983408009' and r['stage'] == 1
    assert r['name'] == 'Công ty CP XNK Dũng Thái Sơn' and r['segment'] == 'Khách hàng: DN đóng gói, xuất khẩu'
    assert r['source'] == 'Danh sách lead tổng hợp 15/11/2026' and r['source_url'] == 'https://x.vn/a'


def test_missing_contact_goes_stage0():
    assert map_row(H, row(**{'Tình trạng liên hệ': 'Thiếu liên hệ: sales tìm thêm; chưa có người đầu mối'}))['stage'] == 0


def test_found_contact_from_sales_sheet_lifts_stage():
    r = map_row(H, row(**{'Tình trạng liên hệ': 'Thiếu liên hệ: sales tìm thêm', 'Điện thoại (tổ chức)': None}),
                {'SĐT tìm được': '0912 345 678', 'Email tìm được': None, 'Người đầu mối tìm được': 'Ông A'})
    assert r['contact_phone'] == '0912 345 678' and r['contact_name'] == 'Ông A' and r['stage'] == 1


def test_existing_customer_kept():
    assert map_row(H, row(**{'Là khách hiện có?': 'Có: SIMEXCO Đắk Lắk'}))['is_customer'] == 'Có: SIMEXCO Đắk Lắk'


def test_candidate_tax_id_not_trusted():
    r = map_row(H, row(**{'MST': 'Ứng viên: 6001765605 (CTCP Tập đoàn)'}))
    assert r['tax_id'] is None and 'Ứng viên: 6001765605' in r['verify']
    assert map_row(H, row(**{'MST': '6001394460'}))['tax_id'] == '6001394460'


def test_sql_escaping():
    assert sql_value("Buôn Sút M'Đưng") == "'Buôn Sút M''Đưng'"
    assert sql_value(None) == 'null'
    assert sql_value(0) == '0'
    s = to_sql([map_row(H, row(**{'Tên tổ chức': "HTX M'Đrắk"}))])
    assert "HTX M''Đrắk" in s and 'on conflict (ext_id) do update' in s


if __name__ == '__main__':
    fs = [v for k, v in sorted(globals().items()) if k.startswith('test_')]
    for f in fs:
        f()
    print('OK', len(fs), 'tests')
