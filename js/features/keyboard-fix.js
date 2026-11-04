/* 固定上下弹窗：header 固定；键盘弹出时输入栏顶到键盘上方，聊天区底部也让出键盘高度 */
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
    var open = kb > 80;
    var el = document.querySelector('.input-area-wrapper');
    if (el) el.style.bottom = open ? kb + 'px' : '';
    var main = document.querySelector('.main-chat-area');
    if (main) main.style.paddingBottom = open ? (kb + 70) + 'px' : '';
    var cb = document.querySelector('.companion-input-bar');
    if (cb) cb.style.bottom = open ? (kb + 16) + 'px' : '';
    document.body.classList.toggle('kb-open', open);
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