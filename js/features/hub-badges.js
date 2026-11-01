/* 省略号按钮 + 信箱/问卷项 红点同步 */
(function () {
  function isOn(id) { var e = document.getElementById(id); return !!(e && getComputedStyle(e).display !== 'none'); }
  function syncBtn() {
    var b = document.getElementById('games-hub-btn'); if (!b) return;
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    var dot = b.querySelector('.hub-btn-dot');
    if (!dot) { dot = document.createElement('span'); dot.className = 'hub-btn-dot'; b.appendChild(dot); }
    dot.style.display = (isOn('env-entry-badge') || isOn('survey-entry-badge')) ? 'block' : 'none';
  }
  function markItems() {
    var els = document.querySelectorAll('.gh-item[data-hub="inbox"], .gh-item[data-hub="survey"]');
    els.forEach(function (it) {
      var k = it.getAttribute('data-hub');
      var on = (k === 'inbox') ? isOn('env-entry-badge') : isOn('survey-entry-badge');
      it.style.position = 'relative';
      var dot = it.querySelector('.hub-item-dot');
      if (!dot) { dot = document.createElement('span'); dot.className = 'hub-item-dot'; it.appendChild(dot); }
      dot.style.display = on ? 'block' : 'none';
    });
  }
  setInterval(function () { if (document.hidden) return; syncBtn(); }, 4000);
  document.addEventListener('DOMContentLoaded', function () { syncBtn(); markItems(); });
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#games-hub-btn')) setTimeout(markItems, 120);
  });
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.gh-item')) setTimeout(syncBtn, 300); });
})();