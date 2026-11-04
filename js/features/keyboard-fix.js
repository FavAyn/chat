/* 固定上下弹窗：顶部 header 固定并量高度；键盘弹出时把输入栏顶到键盘上方（不动 body 高度） */
(function () {
  var root = document.documentElement;
  var vv = window.visualViewport;
  function setHeaderH() {
    var h = document.querySelector('.header');
    if (!h) return;
    var r = h.getBoundingClientRect().height;
    if (r > 0) root.style.setProperty('--header-h', Math.round(r) + 'px');
  }
  function setInput() {
    var kb = 0;
    if (vv) kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    root.style.setProperty('--kb', (kb > 0 ? kb : 0) + 'px');
    var el = document.querySelector('.input-area-wrapper');
    if (el) el.style.bottom = kb > 80 ? kb + 'px' : '';
    var cb = document.querySelector('.companion-input-bar');
    if (cb) cb.style.bottom = kb > 80 ? (kb + 16) + 'px' : '';
  }
  setHeaderH(); setInput();
  window.addEventListener('resize', function () { setHeaderH(); setInput(); });
  if (vv) {
    vv.addEventListener('resize', function () { setHeaderH(); setInput(); });
    vv.addEventListener('scroll', setInput);
  }
  window.addEventListener('orientationchange', function () { setTimeout(function () { setHeaderH(); setInput(); }, 350); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    setTimeout(function () { setHeaderH(); setInput(); }, 150);
    setTimeout(function () { setHeaderH(); setInput(); }, 600);
  });
})();