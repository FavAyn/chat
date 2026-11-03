/* 日记：时间轴展示，显示心情表情（moodData[date].user）+ 我的记录（note）。
   写日记=选心情+写内容，存进 moodData 同一字段，与心情手账双向互通。 */
(function () {
  'use strict';
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function moods() { try { return (window.getAllMoodOptions && window.getAllMoodOptions()) || []; } catch (e) { return []; } }
  function moodOf(key) { var a = moods(); for (var i = 0; i < a.length; i++) { if (a[i].key === key) return a[i]; } return null; }

  var VIS_KEY = 'milk-diary-visible';
  function visMap() { try { return JSON.parse(localStorage.getItem(VIS_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function isVisible(ds) { return visMap()[ds] !== false; }
  function setVisible(ds, v) {
    if (!ds) return;
    var m = visMap(); m[ds] = !!v;
    try { localStorage.setItem(VIS_KEY, JSON.stringify(m)); } catch (e) {}
  }

  function render() {
    var list = document.getElementById('diary-list');
    if (!list) return;
    var md = window.moodData || {};
    var keys = Object.keys(md).filter(function (k) { var e = md[k]; return e && (e.note || e.user); }).sort().reverse();
    if (!keys.length) {
      list.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:40px 0;font-size:13px;">还没有日记<br><span style="font-size:11px;opacity:.7;">点右上角 + 写今天的</span></div>';
      return;
    }
    list.innerHTML = '<div class="diary-timeline">' + keys.map(function (ds) {
      var e = md[ds] || {};
      var mo = moodOf(e.user);
      var emo = mo ? '<span class="diary-emoji">' + esc(mo.kaomoji) + '</span>' : '<span class="diary-emoji">📝</span>';
      return '<div class="diary-node" data-date="' + esc(ds) + '"><div class="diary-node-dot"></div><div class="diary-day">' +
        '<div class="diary-date-row">' + emo + '<span class="diary-date">' + esc(ds) + '</span>' + (isVisible(ds) ? '' : '<span style="font-size:10px;color:var(--text-secondary);border:1px solid var(--border-color);border-radius:6px;padding:1px 5px;">仅自己可见</span>') + '<button class="diary-edit" data-date="' + esc(ds) + '">编辑</button></div>' +
        (e.note ? '<div class="diary-text">' + esc(e.note) + '</div>' : '') +
        (isVisible(ds) ? '' : '<span class="diary-hidden-badge" title="对方不可见"><i class="fas fa-eye-slash"></i></span>') + '</div></div>';
    }).join('') + '</div>';
    list.querySelectorAll('.diary-edit').forEach(function (b) {
      b.onclick = function () { openEditor(b.getAttribute('data-date')); };
    });
  }

  function openEditor(ds) {
    var old = document.getElementById('diary-editor'); if (old) old.remove();
    var e = (window.moodData || {})[ds] || {};
    var opts = moods().map(function (o) {
      return '<option value="' + esc(o.key) + '"' + (o.key === e.user ? ' selected' : '') + '>' + esc(o.kaomoji + ' ' + o.label) + '</option>';
    }).join('');
    var ov = document.createElement('div'); ov.id = 'diary-editor'; ov.className = 'gi-overlay'; ov.style.padding = '0';
    ov.innerHTML = '<div class="gi-card" style="max-width:100%;width:100%;height:100%;max-height:100%;border-radius:0;display:flex;flex-direction:column;"><div class="gi-title" style="font-size:16px;display:flex;align-items:center;gap:10px;">日记 <input type="date" id="diary-date-input" value="' + esc(ds) + '" style="font-family:inherit;font-size:14px;padding:6px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--primary-bg);color:var(--text-primary);"></div>' +
      '<select id="diary-mood-select" style="width:100%;margin-bottom:12px;padding:12px 14px;border-radius:12px;border:1px solid var(--border-color);background:var(--primary-bg);color:var(--text-primary);font-family:inherit;font-size:16px;">' + opts + '</select>' +

      '<textarea id="diary-note-input" rows="8" style="width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:1px solid var(--border-color);background:var(--primary-bg);color:var(--text-primary);font-family:inherit;font-size:15px;line-height:1.8;flex:1;min-height:0;resize:none;"></textarea>' +
      '<div class="gi-btns" style="margin-top:12px;align-items:center;"><button id="diary-visible-toggle" class="diary-vis-btn" style="margin-right:auto;font-family:inherit;font-size:12px;padding:7px 12px;border-radius:9px;border:1px solid var(--border-color);background:var(--secondary-bg);color:var(--text-secondary);cursor:pointer;">对方可见</button><button class="gi-no" id="diary-cancel">取消</button><button class="gi-ok" id="diary-save">保存</button></div></div>';
    document.body.appendChild(ov);
    document.getElementById('diary-note-input').value = e.note || '';
    var visToggle = document.getElementById('diary-visible-toggle');
    function syncVis() {
      if (!visToggle) return;
      var on = visToggle.classList.contains('on');
      visToggle.textContent = on ? '对方可见' : '对方不可见';
      visToggle.style.color = on ? 'var(--accent-color)' : 'var(--text-secondary)';
      visToggle.style.borderColor = on ? 'var(--accent-color)' : 'var(--border-color)';
    }
    if (visToggle) {
      visToggle.classList.toggle('on', isVisible(ds));
      syncVis();
      visToggle.addEventListener('click', function () {
        var dEl = document.getElementById('diary-date-input');
        var nv = !visToggle.classList.contains('on');
        visToggle.classList.toggle('on', nv);
        syncVis();
        setVisible((dEl && dEl.value) ? dEl.value : ds, nv);
      });
    }
    var dateEl = document.getElementById('diary-date-input');
    if (dateEl && visToggle) dateEl.addEventListener('change', function () { visToggle.classList.toggle('on', isVisible(dateEl.value || ds)); syncVis(); });
    document.getElementById('diary-cancel').onclick = function () { ov.remove(); };
    ov.addEventListener('click', function (ev) { if (ev.target === ov) ov.remove(); });
    document.getElementById('diary-save').onclick = function () {
      var user = document.getElementById('diary-mood-select').value;
      var note = document.getElementById('diary-note-input').value.trim();
      var _dEl = document.getElementById('diary-date-input');
      var _ds = (_dEl && _dEl.value) ? _dEl.value : ds;
      if (visToggle) setVisible(_ds, visToggle.classList.contains('on'));
      if (!window.moodData) window.moodData = {};
      window.moodData[_ds] = window.moodData[_ds] || {};
      ds = _ds;
      window.moodData[ds].user = user;
      window.moodData[ds].note = note;
      try { if (typeof window.saveMoodData === 'function') window.saveMoodData(); } catch (x) {}
      try { if (typeof window.renderMoodCalendar === 'function') window.renderMoodCalendar(); } catch (x) {}
      ov.remove(); render();
    };
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  window._diaryRender = render;
  window._openDiaryEditorFor = function (ds) {
    try { if (typeof window.closeMoodOverlay === 'function') window.closeMoodOverlay(); } catch (e) {}
    setTimeout(function () { openEditor(ds || todayStr()); }, 120);
  };
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('#csp-diary');
    if (b) setTimeout(render, 60);
    var add = ev.target.closest && ev.target.closest('#diary-add-btn');
    if (add) { ev.preventDefault(); openEditor(todayStr()); }
  });
  document.addEventListener('click', function (ev) {
    var jb = ev.target.closest && ev.target.closest('#diary-jump-btn');
    if (jb) {
      var w = document.getElementById('diary-jump-wrap');
      if (w) w.style.display = (w.style.display === 'flex' ? 'none' : 'flex');
    }
  });
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.id === 'diary-jump') {
      var d = ev.target.value; if (!d) return;
      var node = document.querySelector('.diary-node[data-date="' + d + '"]');
      if (node) { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); node.classList.add('diary-node-flash'); setTimeout(function () { node.classList.remove('diary-node-flash'); }, 1200); }
      else { try { if (typeof window.showNotification === 'function') window.showNotification('那天没有写日记', 'info'); } catch (e) {} }
    }
  });
  document.addEventListener('DOMContentLoaded', render);
  setTimeout(render, 600);
  setTimeout(render, 1500);
})();
