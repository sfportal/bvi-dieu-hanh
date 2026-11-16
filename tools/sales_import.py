"""Nhập danh sách lead tổng hợp (Excel) vào bảng sales_leads.

Chạy: python3 tools/sales_import.py <file.xlsx> <thư mục ra>
In ra các file import_NN.sql (mỗi file 100 lead) để chạy bằng execute_sql. Không commit file SQL dữ liệu vào repo.
Chạy lại an toàn: trùng ext_id thì chỉ cập nhật các cột lấy từ file, không đụng cột chăm sóc (stage, owner, next...).
"""
import sys, os, re

SOURCE = 'Danh sách lead tổng hợp 15/11/2026'
COLS = {  # cột Excel -> cột bảng
    'ID': 'ext_id', 'Tên tổ chức': 'name', 'Nhóm': 'segment', 'Loại hình': 'org_type', 'Tỉnh (mới)': 'province',
    'Tỉnh cũ/Địa bàn': 'area', 'Cây': 'crops', 'Địa chỉ': 'address', 'Điện thoại (tổ chức)': 'org_phone',
    'Email/Web/Fanpage': 'org_email_web', 'Người đại diện/đầu mối': 'contact_name', 'Quy mô': 'scale',
    'Dấu hiệu nhu cầu': 'need_signal', 'Dịch vụ nên chào': 'offer', 'Ưu tiên': 'priority', 'Cách tiếp cận': 'approach',
    'Trạng thái xác minh': 'verify', 'Nguồn URL': 'source_url', 'Là khách hiện có?': 'is_customer',
}
FILE_COLS = ['ext_id', 'name', 'segment', 'org_type', 'province', 'area', 'crops', 'address', 'org_phone', 'org_email_web',
             'contact_name', 'contact_phone', 'contact_email', 'tax_id', 'scale', 'need_signal', 'offer', 'priority',
             'approach', 'verify', 'source', 'source_url', 'is_customer']


def clean(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def map_row(header, row, extra=None):
    d = {h: clean(v) for h, v in zip(header, row)}
    r = {c: d.get(h) for h, c in COLS.items()}
    if r['ext_id'] and r['ext_id'].endswith('.0'):
        r['ext_id'] = r['ext_id'][:-2]
    mst = d.get('MST')
    if mst and re.fullmatch(r'[\d\-]{10,14}', mst):
        r['tax_id'] = mst
    else:
        r['tax_id'] = None
        if mst:
            r['verify'] = '; '.join(x for x in [r['verify'], 'MST ' + mst] if x)
    r['contact_phone'] = r['contact_email'] = None
    found = False
    if extra:
        ph, em, who = clean(extra.get('SĐT tìm được')), clean(extra.get('Email tìm được')), clean(extra.get('Người đầu mối tìm được'))
        if ph:
            r['contact_phone'] = ph; found = True
        if em:
            r['contact_email'] = em; found = True
        if who:
            r['contact_name'] = who
    lacking = (d.get('Tình trạng liên hệ') or '').startswith('Thiếu liên hệ')
    r['stage'] = 0 if lacking and not found else 1
    r['source'] = SOURCE
    return r


def sql_value(v):
    if v is None:
        return 'null'
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def to_sql(rows):
    cols = FILE_COLS + ['stage']
    vals = ',\n'.join('(' + ','.join(sql_value(r.get(c)) for c in cols) + ')' for r in rows)
    upd = ', '.join(f'{c}=excluded.{c}' for c in FILE_COLS if c != 'ext_id')
    return (f'insert into public.sales_leads ({",".join(cols)}) values\n{vals}\n'
            f'on conflict (ext_id) do update set {upd};\n')


def main(path, outdir):
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True)
    rows = list(wb['Lead tong hop'].iter_rows(values_only=True))
    header = [clean(h) for h in rows[0]]
    sr = list(wb['Sales tim lien he'].iter_rows(values_only=True))
    sh = [clean(h) for h in sr[0]]
    extra = {}
    for x in sr[1:]:
        e = dict(zip(sh, x))
        if e.get('ID') is not None:
            extra[str(e['ID']).replace('.0', '')] = e
    out = []
    for x in rows[1:]:
        if not x or x[0] is None or not clean(x[1]):
            continue
        r = map_row(header, x, extra.get(str(x[0]).replace('.0', '')))
        out.append(r)
    os.makedirs(outdir, exist_ok=True)
    for i in range(0, len(out), 100):
        open(os.path.join(outdir, f'import_{i // 100:02d}.sql'), 'w').write(to_sql(out[i:i + 100]))
    print(len(out), 'lead;', sum(r['stage'] == 0 for r in out), 'cần tìm liên hệ')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
