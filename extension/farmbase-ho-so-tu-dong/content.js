// Nút nhanh trên trang admin: chạy kiểm tra ngay (kết quả lưu vào lịch sử của extension).
(() => {
  if (document.getElementById('fb-check-btn')) return;
  const b = document.createElement('button');
  b.id = 'fb-check-btn';
  b.textContent = 'Kiểm tra hồ sơ VT';
  Object.assign(b.style, {
    position: 'fixed', right: '16px', bottom: '16px', zIndex: 99999, padding: '10px 14px',
    background: '#15803d', color: '#fff', border: 'none', borderRadius: '8px',
    font: '600 13px system-ui, sans-serif', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.2)',
  });
  const reset = () => setTimeout(() => { b.disabled = false; b.textContent = 'Kiểm tra hồ sơ VT'; }, 5000);
  b.onclick = async () => {
    b.disabled = true; b.textContent = 'Đang kiểm tra...';
    try {
      const r = await chrome.runtime.sendMessage({ type: 'runNow' });
      if (r?.ok) {
        b.textContent = `Xong: ${r.summary.complete}/${r.summary.total} vùng đủ — mở báo cáo`;
        chrome.runtime.sendMessage({ type: 'openReport' });
      } else b.textContent = 'Lỗi: ' + (r?.error || 'không rõ');
    } catch (e) { b.textContent = 'Lỗi, hãy tải lại trang'; }
    reset();
  };
  document.body.appendChild(b);
})();
