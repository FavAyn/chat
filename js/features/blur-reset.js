/* 键盘收起后复位页面滚动，避免下半屏点不动（iOS 视口残留） */
(function () {
  var vv = window.visualViewport;
  function reset() {
    try {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    } catch (e) {}
  }
  document.addEventListener('focusout', function () {
    setTimeout(reset, 80);
    setTimeout(reset, 300);
  });
  if (vv) {
    var lastH = vv.height;
    vv.addEventListener('resize', function () {
      if (vv.height > lastH + 40) { setTimeout(reset, 80); setTimeout(reset, 300); }
      lastH = vv.height;
    });
  }
  window.addEventListener('pageshow', reset);
})();