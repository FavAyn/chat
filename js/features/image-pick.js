/* 手机：图片按钮弹「相册 / 拍照」 */
(function () {
  'use strict';
  var passing = false;
  function isMobile() { return !!(window.mochiDevice && (window.mochiDevice.isMobile || window.mochiDevice.isTablet)); }
  function openMenu() {
    var old = document.getElementById('image-pick-menu'); if (old) old.remove();
    var ov = document.createElement('div'); ov.id = 'image-pick-menu'; ov.className = 'gi-overlay'; ov.style.padding = '0';
    ov.innerHTML = '<div class="gi-card" style="max-width:320px;"><div class="gi-title">发送图片</div><div class="gi-btns" style="flex-direction:column;gap:8px;">' +
      '<button class="gi-ok" id="ip-album">从相册选择</button>' +
      '<button class="gi-no" id="ip-camera">拍照</button>' +
      '<button class="gi-no" id="ip-cancel">取消</button></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('#ip-cancel').onclick = function () { ov.remove(); };
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    ov.querySelector('#ip-album').onclick = function () {
      ov.remove();
      var i = document.getElementById('image-input');
      if (i) { passing = true; i.click(); setTimeout(function () { passing = false; }, 500); }
    };
    ov.querySelector('#ip-camera').onclick = function () {
      ov.remove();
      var c = document.getElementById('image-input-camera');
      if (c) c.click();
    };
  }
  document.addEventListener('click', function (e) {
    if (passing) return;
    if (!isMobile()) return;
    var b = e.target.closest && e.target.closest('[onclick*="image-input"]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    openMenu();
  }, true);
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'image-input-camera' && e.target.files && e.target.files[0]) {
      var f = e.target.files[0]; e.target.value = '';
      try {
        var dt = new DataTransfer(); dt.items.add(f);
        var inp = document.getElementById('image-input');
        if (inp) { inp.files = dt.files; inp.dispatchEvent(new Event('change')); }
      } catch (err) {}
    }
  });
})();