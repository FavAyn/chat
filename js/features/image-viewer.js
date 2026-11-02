/* 聊天图片/表情包查看器：点开变大，左右滑动切换 */
(function () {
  'use strict';
  var ov = null, imgEl = null, list = [], idx = 0, startX = 0, startY = 0, dragging = false;
  function build() {
    if (ov) return;
    ov = document.createElement('div');
    ov.id = 'iv-overlay';
    ov.innerHTML = '<div class="iv-close">×</div><img class="iv-img" alt="">';
    document.body.appendChild(ov);
    imgEl = ov.querySelector('.iv-img');
    ov.querySelector('.iv-close').addEventListener('click', function (e) { e.stopPropagation(); close(); });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.addEventListener('pointerdown', function (e) { startX = e.clientX; startY = e.clientY; dragging = true; });
    ov.addEventListener('pointerup', function (e) {
      if (!dragging) return; dragging = false;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    });
    document.addEventListener('keydown', function (e) {
      if (!ov.classList.contains('show')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    });
  }
  function open(imgs, i) {
    build(); list = imgs; idx = i || 0; show(); ov.classList.add('show');
  }
  function show() {
    var it = list[idx]; if (!it) return;
    imgEl.src = it.src;
  }
  function go(d) { if (!list.length) return; idx = (idx + d + list.length) % list.length; show(); }
  function close() { if (ov) ov.classList.remove('show'); }

  // 聊天图片列表（单独查看）

  // 聊天记录 → 图片 tab 的网格
  window._renderChatImagesGrid = function (el) {
    if (!el) return;
    var msgs = [];
    try { msgs = (typeof messages !== 'undefined' && messages) ? messages : (window.messages || []); } catch (e) { msgs = window.messages || []; }
    var stickerSet = {};
    try { (typeof stickerLibrary !== 'undefined' ? stickerLibrary : []).forEach(function (s) { if (s) stickerSet[s] = 1; }); } catch (e) {}
    try { (typeof myStickerLibrary !== 'undefined' ? myStickerLibrary : []).forEach(function (s) { var u = (typeof s === 'string' ? s : (s && s.src)); if (u) stickerSet[u] = 1; }); } catch (e) {}
    var items = [];
    msgs.forEach(function (m) {
      if (!m || !m.image || stickerSet[m.image]) return;
      var t = 0; try { t = new Date(m.timestamp).getTime() || 0; } catch (e) {}
      items.push({ src: m.image, t: t });
    });
    items.reverse();
    if (!items.length) { el.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:40px 0;font-size:13px;">还没有图片</div>'; return; }
    var groups = {}, order = [];
    items.forEach(function (it, i) {
      var dt = new Date(it.t || Date.now());
      var k = dt.getFullYear() + '年' + (dt.getMonth() + 1) + '月';
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push({ src: it.src, gi: i });
    });
    var jump = '<div class="simg-head"><span class="simg-title">图片</span><button class="simg-jump-btn" id="simg-jump-btn" title="按年月查找"><i class="fas fa-calendar-day"></i></button></div>' +
      '<div class="simg-jump-wrap" id="simg-jump-wrap"><input type="month" id="stats-img-month-input" style="width:100%;font-family:inherit;font-size:12px;padding:8px 10px;border-radius:10px;border:1px solid var(--border-color);background:var(--secondary-bg);color:var(--text-primary);"></div>';
    var html = jump;
    order.forEach(function (k) {
      html += '<div class="stats-img-month" data-month="' + k + '">' + k + '</div>';
      html += '<div class="stats-img-grid">' + groups[k].map(function (it) {
        return '<img loading="lazy" data-i="' + it.gi + '" src="' + it.src + '" alt="">';
      }).join('') + '</div>';
    });
    el.innerHTML = html;
    el.querySelectorAll('.stats-img-grid img').forEach(function (im) {
      im.onclick = function () {
        var arr = items.map(function (x) { return { src: x.src }; });
        open(arr, parseInt(im.getAttribute('data-i'), 10) || 0);
      };
    });
    var jb = el.querySelector('#simg-jump-btn');
    if (jb) jb.onclick = function () { var w = el.querySelector('#simg-jump-wrap'); if (w) w.classList.toggle('show'); };
    var msel = el.querySelector('#stats-img-month-input');
    if (msel) msel.onchange = function () {
      var val = msel.value; if (!val) return;
      var pp = val.split('-');
      var key = parseInt(pp[0], 10) + '年' + parseInt(pp[1], 10) + '月';
      var t = el.querySelector('.stats-img-month[data-month="' + key + '"]');
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  };
  window._openChatGallery = function () {
    var msgs = [];
    try { msgs = (typeof messages !== 'undefined' && messages) ? messages : (window.messages || []); } catch (e) { msgs = window.messages || []; }
    var urls = msgs.filter(function (m) { return m && m.image; }).map(function (m) { return m.image; });
    var old = document.getElementById('cig-overlay'); if (old) old.remove();
    var ovg = document.createElement('div'); ovg.id = 'cig-overlay';
    var head = '<div class="cig-head"><span>聊天图片（' + urls.length + '）</span><button class="cig-close">×</button></div>';
    var grid = '<div class="cig-grid">' + (urls.length ? urls.map(function (u, i) { return '<img data-i="' + i + '" src="' + u + '" alt="">'; }).join('') : '<div class="cig-empty">还没有图片</div>') + '</div>';
    ovg.innerHTML = head + grid;
    document.body.appendChild(ovg);
    requestAnimationFrame(function () { ovg.classList.add('show'); });
    ovg.querySelector('.cig-close').onclick = function () { ovg.classList.remove('show'); setTimeout(function () { ovg.remove(); }, 200); };
    ovg.querySelectorAll('.cig-grid img').forEach(function (im) {
      im.onclick = function () {
        var arr = urls.map(function (u) { return { src: u }; });
        open(arr, parseInt(im.getAttribute('data-i'), 10) || 0);
      };
    });
  };
  window._ivOpen = open;
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    if (t.closest && t.closest('.stk-rank')) { e.preventDefault(); open([{ src: t.src }], 0); return; }
    var area = t.closest('#chat-container');
    if (!area) return;
    if (t.closest('.avatar-container') || t.closest('.avatar') || t.closest('.message-avatar')) return;
    var all = Array.prototype.slice.call(area.querySelectorAll('.message img, .message-image')).filter(function (x) {
      if (!x.src || x.naturalWidth < 8) return false;
      if (x.closest('.avatar-container') || x.closest('.avatar')) return false;
      if (x.tagName !== 'IMG') return false;
      return true;
    });
    if (!all.length) return;
    e.preventDefault();
    var i = all.indexOf(t); if (i < 0) i = 0;
    open(all, i);
  }, true);
})();
