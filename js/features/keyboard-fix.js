/* 稳定布局：body 高度跟随可视区；切后台回来重新校准；键盘顶起输入栏 */
(function () {
  var root = document.documentElement;
  var vv = window.visualViewport;
  var lastH = 0;
  function setH() {
    var h = (vv && vv.height) ? vv.height : window.innerHeight;
    if (!h || h < 200) return;
    lastH = h;
    root.style.setProperty('--app-h', Math.round(h) + 'px');
  }
  function resetInput() {
    var kb = 0;
    if (vv) kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    var el = document.querySelector('.input-area-wrapper');
    if (el) el.style.bottom = kb > 80 ? kb + 'px' : '';
    document.body.classList.toggle('kb-open', kb > 80);
  }
  setH(); resetInput();
  window.addEventListener('resize', function () { setH(); resetInput(); });
  if (vv) {
    vv.addEventListener('resize', function () { setH(); resetInput(); });
    vv.addEventListener('scroll', function () { setH(); });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    if (lastH) { root.style.setProperty('--app-h', Math.round(lastH) + 'px'); resetInput(); }
    setTimeout(setH, 80);
    setTimeout(function () { setH(); resetInput(); }, 350);
    setTimeout(function () { setH(); resetInput(); }, 900);
  });
  window.addEventListener('pageshow', function () { setH(); resetInput(); });
  window.addEventListener('orientationchange', function () { setTimeout(function () { setH(); resetInput(); }, 350); });
})();