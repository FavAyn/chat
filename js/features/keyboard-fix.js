/* 手机键盘弹出时顶起输入栏，避免遮住输入框（iOS 需用 visualViewport） */
(function () {
  if (!window.visualViewport) return;
  var vv = window.visualViewport;
  function apply() {
    var kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    var el = document.querySelector('.input-area-wrapper');
    var open = kb > 80;
    if (el) el.style.bottom = open ? kb + 'px' : '';
    document.body.classList.toggle('kb-open', open);
    if (open) { try { window.scrollTo(0, 0); } catch (e) {} }
  }
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  window.addEventListener('orientationchange', function () { setTimeout(apply, 300); });
  setTimeout(apply, 300);
})();