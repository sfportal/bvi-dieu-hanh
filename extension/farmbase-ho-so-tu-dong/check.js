// Được tiêm vào tab admin.farmbase.vn: gọi GraphQL bằng phiên đăng nhập hiện tại (cookie).
// Chỉ ĐỌC dữ liệu, không gọi mutation nào.
(() => {
  const API = 'https://api.farmbase.vn/graphql';
  const empty = x => x == null || x === '' || (Array.isArray(x) && x.length === 0);
  // [mã cảnh báo|field, hàm tự tính khi vùng chưa từng "kiểm tra hồ sơ" (null = không tự tính được)]
  const CRITERIA = [
    ['UNIT_FIELD_MISSING|location', p => empty(p.location)],
    ['UNIT_FIELD_MISSING|targetMarket', p => empty(p.targetMarket)],
    ['UNIT_FIELD_MISSING|appliedStandard', p => empty(p.appliedStandard)],
    ['UNIT_REPRESENTATIVE_MISSING|', p => !p.representativeFarmer],
    ['UNIT_IMAGE_MISSING|GROWING_AREA', null],
    ['UNIT_IMAGE_MISSING|FLYCAM', null],
    ['UNIT_IMAGE_MISSING|PESTICIDE_STORAGE', null],
    ['UNIT_IMAGE_MISSING|HARVEST_PROCESS', null],
    ['UNIT_IMAGE_MISSING|INSECT_TRAP', null],
    ['VENDOR_IMAGE_MISSING|representativeIdCardFrontImage', p => empty(p.ownerVendor?.representativeIdCardFrontImage)],
    ['VENDOR_IMAGE_MISSING|representativeIdCardBackImage', p => empty(p.ownerVendor?.representativeIdCardBackImage)],
    ['VENDOR_IMAGE_MISSING|businessLicenseImages', p => empty(p.ownerVendor?.businessLicenseImages)],
  ];
  const Q = `query ($query: ProductionUnitPaginatedQueryInput!) { productionUnitList(query: $query) { edges { node {
    id code name documentCheckedAt location targetMarket appliedStandard representativeFarmer { id }
    crop { name } province { name } ward { name }
    ownerVendor { name businessLicenseImages { id } representativeIdCardFrontImage { id } representativeIdCardBackImage { id } }
    documentWarnings { code field } } } pageInfo { endCursor hasNextPage } } }`;

  async function fetchAll() {
    let after = null, all = [], pages = 0;
    do {
      const v = { query: { after, first: 100, sort: [{ direction: 'DESC', field: 'id' }] } };
      const url = API + '?query=' + encodeURIComponent(Q) + '&variables=' + encodeURIComponent(JSON.stringify(v));
      const res = await fetch(url, { credentials: 'include' });
      let r;
      try { r = await res.json(); } catch { throw new Error('API trả về dữ liệu không đọc được (HTTP ' + res.status + ')'); }
      if (r.errors || !r.data?.productionUnitList) {
        const msg = (r.errors || []).map(e => e.message).join('; ') || 'Không có dữ liệu';
        throw new Error(/auth|unauth|token|login|permission|forbidden|quyền|đăng nhập/i.test(msg) || (r.errors || []).some(e => /forbidden|unauth/i.test(e.extensions?.code || '')) || res.status === 401 || res.status === 403
          ? 'AUTH: Chưa đăng nhập admin.farmbase.vn hoặc phiên đã hết hạn' : msg);
      }
      const l = r.data.productionUnitList;
      all.push(...l.edges.map(e => e.node));
      after = l.pageInfo.hasNextPage ? l.pageInfo.endCursor : null;
    } while (after && ++pages < 200);
    return all;
  }

  async function collect() {
    const units = await fetchAll();
    const rows = units.map(p => {
      const checked = !!p.documentCheckedAt;
      const set = new Set((p.documentWarnings || []).map(w => w.code + '|' + (w.field || '')));
      // 1 = thiếu, 0 = đủ, -1 = chưa kiểm tra
      const flags = CRITERIA.map(([key, calc]) => checked ? (set.has(key) ? 1 : 0) : (calc ? (calc(p) ? 1 : 0) : -1));
      return {
        id: p.id, name: p.name || '', code: p.code || '', crop: p.crop?.name || '',
        province: p.province?.name || '', ward: p.ward?.name || '', vendor: p.ownerVendor?.name || '',
        checkedAt: p.documentCheckedAt || null, flags, missing: flags.filter(f => f === 1).length,
      };
    }).sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name, 'vi'));
    return { ranAt: new Date().toISOString(), rows };
  }

  window.FBCheck = { collect };
})();
