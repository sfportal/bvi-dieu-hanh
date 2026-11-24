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
  const STATUSES = ['ACTIVE', 'PENDING', 'INACTIVE'];
  const Q = `query ($query: ProductionUnitPaginatedQueryInput!) { productionUnitList(query: $query) { edges { node {
    id code name status documentCheckedAt location targetMarket appliedStandard representativeFarmer { id }
    totalFarmerCount totalPlotCount totalAreaM2
    crop { name } province { name } ward { name }
    ownerVendor { id name businessLicenseImages { id } representativeIdCardFrontImage { id } representativeIdCardBackImage { id } }
    documentWarnings { code field } } } pageInfo { endCursor hasNextPage } } }`;
  const QV = `query ($query: VendorPaginatedQueryInput!) { vendorList(query: $query) { edges { node { id name enabled } } pageInfo { endCursor hasNextPage } } }`;
  const QF = `query ($pu: ID!) { puFarmerAll(productionUnit: $pu) { id fullName idCardNumber idCardFrontImage { id } idCardBackImage { id } } }`;
  const QP = `query ($pu: ID!, $query: PlotPaginatedQueryInput!) { puPlotList(productionUnit: $pu, query: $query) { edges { node {
    id code areaM2 cropCount cadastrePage cadastrePlot cadastreImage { id } farmer { id fullName } } } pageInfo { endCursor hasNextPage } } }`;

  async function gql(query, variables) {
    const url = API + '?query=' + encodeURIComponent(query) + '&variables=' + encodeURIComponent(JSON.stringify(variables));
    const res = await fetch(url, { credentials: 'include' });
    let r;
    try { r = await res.json(); } catch { throw new Error('API trả về dữ liệu không đọc được (HTTP ' + res.status + ')'); }
    if (r.errors || !r.data) {
      const msg = (r.errors || []).map(e => e.message).join('; ') || 'Không có dữ liệu';
      throw new Error(/auth|unauth|token|login|permission|forbidden|quyền|đăng nhập/i.test(msg) || (r.errors || []).some(e => /forbidden|unauth/i.test(e.extensions?.code || '')) || res.status === 401 || res.status === 403
        ? 'AUTH: Chưa đăng nhập admin.farmbase.vn hoặc phiên đã hết hạn' : msg);
    }
    return r.data;
  }
  async function paged(query, pick, vars = {}, max = 200) {
    let after = null, all = [], pages = 0;
    do {
      const d = await gql(query, { ...vars, query: { ...(vars.query || {}), after, first: 100 } });
      const l = pick(d);
      all.push(...l.edges.map(e => e.node));
      after = l.pageInfo?.hasNextPage ? l.pageInfo.endCursor : null;
    } while (after && ++pages < max);
    return all;
  }

  // Danh sách tổ chức (doanh nghiệp, HTX) để chọn phạm vi
  async function vendors() {
    let L;
    try { L = await paged(QV, d => d.vendorList, { query: {} }); }
    catch {
      // tài khoản không xem được danh sách tổ chức: lấy từ các vùng trồng đang thấy
      const units = await paged(Q, d => d.productionUnitList, { query: {} });
      const m = new Map(); units.forEach(u => { if (u.ownerVendor?.id) m.set(u.ownerVendor.id, { id: u.ownerVendor.id, name: u.ownerVendor.name }); });
      L = [...m.values()];
    }
    return L.map(v => ({ id: v.id, name: v.name || '', enabled: v.enabled !== false })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }

  function unitFilter(scope) {
    const st = (scope?.statuses || []).filter(s => STATUSES.includes(s));
    const and = [];
    if (st.length && st.length < STATUSES.length) and.push({ or: st.map(s => ({ status: { EQ: s } })) });
    if (scope?.vendors?.length) and.push({ ownerVendor: { IN: scope.vendors } });
    return and.length ? { and } : undefined;
  }

  // ---- kiểm tra nông hộ và lô của một vùng (chỉ giữ cờ đủ/thiếu; không lưu số CCCD) ----
  const k = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '');
  async function deepOf(pu) {
    const [{ puFarmerAll: F }, P] = await Promise.all([
      gql(QF, { pu }),
      paged(QP, d => d.puPlotList, { pu, query: {} }, 50),
    ]);
    const farmers = (F || []).map(f => ({ id: f.id, name: f.fullName || '', noId: empty(f.idCardNumber), noFront: !f.idCardFrontImage, noBack: !f.idCardBackImage }));
    const plots = (P || []).map(p => ({
      id: p.id, code: p.code || '', farmer: p.farmer?.fullName || '', page: String(p.cadastrePage ?? '').trim(), plot: String(p.cadastrePlot ?? '').trim(),
      area: p.areaM2 == null ? null : Number(p.areaM2), trees: p.cropCount == null ? null : Number(p.cropCount),
      noImg: !p.cadastreImage, noPage: empty(String(p.cadastrePage ?? '').trim()), noPlot: empty(String(p.cadastrePlot ?? '').trim()),
      noTrees: p.cropCount == null || Number(p.cropCount) <= 0, noArea: p.areaM2 == null || p.areaM2 === '', zero: p.areaM2 != null && p.areaM2 !== '' && Number(p.areaM2) === 0,
    }));
    // trùng tờ + thửa trên cùng một vùng
    const g = new Map();
    plots.forEach(p => { if (p.noPage || p.noPlot) return; const key = k(p.page) + '|' + k(p.plot); g.set(key, [...(g.get(key) || []), p]); });
    const dups = [...g.values()].filter(x => x.length > 1).map(x => ({ page: x[0].page, plot: x[0].plot, plots: x.map(p => p.code || p.id) }));
    const dupIds = new Set(dups.flatMap(d => d.plots));
    plots.forEach(p => { p.dup = dupIds.has(p.code || p.id); });
    const c = (L, f) => L.filter(f).length;
    const sum = {
      f: farmers.length, fNoId: c(farmers, x => x.noId), fNoImg: c(farmers, x => x.noFront || x.noBack),
      p: plots.length, pNoImg: c(plots, x => x.noImg), pNoPage: c(plots, x => x.noPage), pNoPlot: c(plots, x => x.noPlot),
      pNoTrees: c(plots, x => x.noTrees), pNoArea: c(plots, x => x.noArea), pZero: c(plots, x => x.zero), dup: dups.length,
    };
    sum.issues = sum.fNoId + sum.fNoImg + sum.pNoImg + sum.pNoPage + sum.pNoPlot + sum.pNoTrees + sum.pNoArea + sum.pZero + sum.dup;
    return {
      sum,
      farmers: farmers.filter(x => x.noId || x.noFront || x.noBack).map(({ id, ...x }) => x),
      plots: plots.filter(x => x.noImg || x.noPage || x.noPlot || x.noTrees || x.noArea || x.zero || x.dup),
      dups,
    };
  }

  async function collect(scope = {}) {
    // phạm vi mặc định theo tên doanh nghiệp: tìm id các tổ chức khớp tên
    if (!scope.vendors?.length && scope.vendorKeys?.length) {
      const nv = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
      const hit = name => { const n = ' ' + nv(name).replace(/[^a-z0-9]+/g, ' ') + ' '; return scope.vendorKeys.some(k => /^\d+$/.test(k) ? n.includes(' ' + k + ' ') : n.includes(nv(k))); };
      const V = (await vendors()).filter(v => hit(v.name));
      if (V.length) scope = { ...scope, vendors: V.map(v => v.id), vendorNames: V.map(v => v.name) };
    }
    const filter = unitFilter(scope);
    const units = await paged(Q, d => d.productionUnitList, { query: { sort: [{ direction: 'DESC', field: 'id' }], ...(filter ? { filter } : {}) } });
    const rows = units.map(p => {
      const checked = !!p.documentCheckedAt;
      const set = new Set((p.documentWarnings || []).map(w => w.code + '|' + (w.field || '')));
      // 1 = thiếu, 0 = đủ, -1 = chưa kiểm tra
      const flags = CRITERIA.map(([key, calc]) => checked ? (set.has(key) ? 1 : 0) : (calc ? (calc(p) ? 1 : 0) : -1));
      return {
        id: p.id, name: p.name || '', code: p.code || '', crop: p.crop?.name || '', status: p.status || '',
        province: p.province?.name || '', ward: p.ward?.name || '', vendor: p.ownerVendor?.name || '', vendorId: p.ownerVendor?.id || '',
        farmerCount: p.totalFarmerCount ?? null, plotCount: p.totalPlotCount ?? null, areaM2: p.totalAreaM2 ?? null,
        checkedAt: p.documentCheckedAt || null, flags, missing: flags.filter(f => f === 1).length,
      };
    }).sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name, 'vi'));

    if (scope.deep !== false && rows.length) {
      let done = 0, i = 0, failed = 0;
      const tell = () => { try { chrome.runtime.sendMessage({ type: 'progress', done, total: rows.length }); } catch {} };
      tell();
      const worker = async () => {
        while (i < rows.length) {
          const r = rows[i++];
          try { r.deep = await deepOf(r.id); } catch (e) { if (String(e.message).startsWith('AUTH:')) throw e; r.deep = { error: String(e.message || e).slice(0, 200) }; failed++; }
          done++; if (done % 5 === 0 || done === rows.length) tell();
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));
      if (failed === rows.length) throw new Error('Không đọc được nông hộ, lô của vùng nào: ' + (rows[0].deep?.error || ''));
    }
    return { ranAt: new Date().toISOString(), scope: { statuses: scope.statuses || STATUSES, vendors: scope.vendors || [], vendorNames: scope.vendorNames || [], deep: scope.deep !== false }, rows };
  }

  window.FBCheck = { collect, vendors };
})();
