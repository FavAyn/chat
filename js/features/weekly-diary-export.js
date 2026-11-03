/* 每周首次打开提示导出「上周日记」文本 */
(function () {
  'use strict';
  var KEY = 'diaryWeeklyExportLast';
  function mondayOf(dd) { var x = new Date(dd); x.setHours(0,0,0,0); var day = (x.getDay()+6)%7; x.setDate(x.getDate()-day); return x; }
  function fmt(dd) { return dd.getFullYear()+'-'+String(dd.getMonth()+1).padStart(2,'0')+'-'+String(dd.getDate()).padStart(2,'0'); }
  function weekKey() { return fmt(mondayOf(new Date())); }
  function lastWeekRange() { var mon = mondayOf(new Date()); mon.setDate(mon.getDate()-7); var sun = new Date(mon); sun.setDate(mon.getDate()+6); return { s: fmt(mon), e: fmt(sun) }; }
  function moodName(key) {
    try { var a = window.getAllMoodOptions ? window.getAllMoodOptions() : []; for (var i=0;i<a.length;i++){ if (a[i].key === key) return a[i].kaomoji + ' ' + a[i].label; } } catch (e) {}
    return '';
  }
  function buildText() {
    var md = window.moodData || {}, r = lastWeekRange(), out = [];
    Object.keys(md).sort().forEach(function (ds) {
      if (ds < r.s || ds > r.e) return;
      var e = md[ds] || {}; if (!e.note && !e.user) return;
      var parts = [ds];
      if (e.user) parts.push('心情：' + moodName(e.user));
      if (e.note) parts.push('内容：' + e.note);
      out.push(parts.join('\n'));
    });
    return out.join('\n\n');
  }
  function download() {
    var txt = buildText();
    if (!txt) { try { showNotification('上周没有日记记录', 'info'); } catch (e) {} return; }
    var r = lastWeekRange();
    var blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = '日记-' + r.s + '~' + r.e + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
    try { localStorage.setItem(KEY, weekKey()); } catch (e) {}
    try { showNotification('已导出上周日记', 'success'); } catch (e) {}
  }
  function showTip() {
    var ov = document.createElement('div'); ov.className = 'gi-overlay';
    var r = lastWeekRange();
    ov.innerHTML = '<div class="gi-card"><div class="gi-title">上周日记可以导出啦</div>' +
      '<div class="gi-body">要把上周（' + r.s + ' ~ ' + r.e + '）的日记导成文本存档吗？</div>' +
      '<div class="gi-btns"><button class="gi-no" id="dw-no">本周不再提醒</button><button class="gi-ok" id="dw-ok">导出</button></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('#dw-no').onclick = function () { ov.remove(); try { localStorage.setItem(KEY, weekKey()); } catch (e) {} };
    ov.querySelector('#dw-ok').onclick = function () { ov.remove(); download(); };
  }
  window._diaryExportLastWeek = download;
  setTimeout(function () {
    try {
      var last = localStorage.getItem(KEY) || '';
      if (last === weekKey()) return;
      if (!buildText()) { localStorage.setItem(KEY, weekKey()); return; }
      showTip();
    } catch (e) {}
  }, 2500);
})();