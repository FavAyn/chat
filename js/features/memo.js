/* =====================================================================
 * 备忘录（milk 适配版）
 * —— 待办清单式备忘：添加 / 勾选完成 / 点文字编辑 / 置顶 / 删除 / 清已完成
 *    支持截止日期（今天/明天/后天/周末/清除）、完成后TA夸夸、可选发到聊天
 * 灵感与设计参考：mochi「memo-app 备忘录」
 * 独立重构，走 milk 的 .modal + showModal/hideModal + localStorage 存储。
 * 存储：localStorage key = 'MYMEMO_ITEMS_V1'，开关 key = 'MYMEMO_SEND_V1'
 * 对 milk API：window.Memo.open()
 * ===================================================================== */
(function () {
  'use strict';

  var ITEM_KEY = 'MYMEMO_ITEMS_V1';
  var SEND_KEY = 'MYMEMO_SEND_V1';
  var LIMIT = 200;

  var hostEl = null;
  var rootEl = null;
  var items = [];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function strim(v) { return String(v == null ? '' : v).trim(); }
  function get(k, fb) { try { var r = (typeof safeGetItem === 'function') ? safeGetItem(k) : localStorage.getItem(k); return r == null ? fb : r; } catch (e) { return fb; } }
  function set(k, v) { try { if (typeof safeSetItem === 'function') safeSetItem(k, v); else localStorage.setItem(k, v); } catch (e) {} }
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function clip(t, n) { t = String(t || ''); return t.length > n ? t.slice(0, n) + '…' : t; }

  var MSG_ALLDONE = ['都做完啦，真棒', '全部完成，说到做到', '清零啦，奖励一个抱抱'];
  var MSG_DONE = ['又完成一件，好棒', '进度 +1，继续呀', '完成啦'];
  var MSG_ADD = ['记下来啦，我盯着你完成', '嗯，我记着了', '好的，一件一件来'];

  function loadItems() {
    try { var a = JSON.parse(get(ITEM_KEY, '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function saveItems() { set(ITEM_KEY, JSON.stringify(items)); }
  function sendOn() { return get(SEND_KEY, '') === '1'; }
  function setSendOn(on) { set(SEND_KEY, on ? '1' : ''); }

  function dayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function urgent(it) { if (!it || !it.due || it.done) return null; var t = dayStr(new Date()); if (it.due < t) return 'overdue'; if (it.due === t) return 'today'; return null; }
  function overdueDays(due) { var d1 = new Date(due + 'T00:00:00'); var d2 = new Date(); d2.setHours(0, 0, 0, 0); return Math.max(1, Math.round((d2 - d1) / 86400000)); }
  function fmt(ts) { var d = new Date(ts); var p = function (n) { return (n < 10 ? '0' + n : '' + n); }; return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes()); }

  function notify(msg) {
    if (typeof showNotification === 'function') showNotification(msg, 'info', 2000);
  }
  function toastMini(msg) {
    // 弹窗内轻提示
    var el = rootEl && rootEl.querySelector('.memo-msg');
    if (el) { el.textContent = msg; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  }

  function topBar(title) {
    return '<div class="memo-top">' +
      '<button class="memo-back" id="memoBack"><i class="fas fa-arrow-left"></i></button>' +
      '<span class="memo-title">' + esc(title) + '</span>' +
      '<div class="memo-top-btns">' +
      '<button class="memo-send-toggle' + (sendOn() ? ' on' : '') + '" id="memoSendToggle" title="完成后发到聊天">' + (sendOn() ? '已联动聊天' : '联动聊天') + '</button>' +
      '</div></div>';
  }

  function shellHTML() {
    var h = [];
    h.push(topBar('备忘录'));
    h.push('<div class="memo-body">');
    h.push('<div class="memo-input-row"><input class="memo-inp" id="memoInp" type="text" placeholder="记一件想做的事…" maxlength="200">' +
      '<button class="memo-add" id="memoAddBtn">添加</button></div>');
    h.push('<div class="memo-msg" id="memoMsg"></div>');
    h.push('<div class="memo-toolbar"><span class="memo-count" id="memoCount"></span>' +
      '<button class="memo-cleardone" id="memoClearDone">清已完成</button></div>');
    h.push('<div class="memo-list" id="memoList"></div>');
    h.push('<div class="memo-empty" id="memoEmpty">还没有备忘<br>想做的事、要买的东西、突然的念头<br>都可以写在这里</div>');
    h.push('</div>');
    return h.join('');
  }

  function render() {
    if (!rootEl) return;
    rootEl.innerHTML = shellHTML();
    bind();
    renderList();
  }

  function renderList() {
    var list = rootEl && rootEl.querySelector('#memoList'); if (!list) return;
    items = loadItems();
    list.innerHTML = '';

    var undone = items.filter(function (x) { return !x.done; }).length;
    var cnt = rootEl.querySelector('#memoCount');
    if (cnt) cnt.textContent = items.length ? ('共 ' + items.length + ' 条 · 待办 ' + undone) : '';
    var empty = rootEl.querySelector('#memoEmpty');
    if (empty) empty.hidden = items.length > 0;
    var sendT = rootEl.querySelector('#memoSendToggle');
    if (sendT) { sendT.classList.toggle('on', sendOn()); sendT.textContent = sendOn() ? '已联动聊天' : '联动聊天'; }

    var rank = function (it) { return (it.pin ? 8 : 0) + ((urgent(it) && !it.done) ? 4 : 0) + (it.done ? 0 : 2); };
    var rows = items.slice().sort(function (a, b) { return rank(b) - rank(a); });

    rows.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'memo-item' + (it.done ? ' done' : '') + (it.pin ? ' pinned' : '') + (urgent(it) ? ' urgent' : '');

      var chk = document.createElement('span'); chk.className = 'mm-check'; chk.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      chk.addEventListener('click', function () {
        var cur = items.find(function (x) { return x.id === it.id; }); if (!cur) return;
        cur.done = !cur.done; saveItems(); vibrate(8); renderList();
        if (cur.done) {
          var arr = loadItems();
          if (arr.length && arr.every(function (x) { return x.done; })) { vibrate([60, 40, 60]); toastMini(pick(MSG_ALLDONE)); }
          else if (Math.random() < 0.35) toastMini(pick(MSG_DONE));
        }
      });

      var main = document.createElement('div'); main.className = 'mm-main';
      var txt = document.createElement('div'); txt.className = 'mm-text'; txt.textContent = it.t || '';
      txt.addEventListener('click', function () { editItem(it); });
      var tm = document.createElement('div'); tm.className = 'mm-time';
      var urg = urgent(it);
      if (it.due && !it.done) {
        if (urg === 'overdue') { tm.textContent = '已过期 ' + overdueDays(it.due) + ' 天 · ' + fmt(it.ts || Date.now()); tm.classList.add('due-overdue'); }
        else if (urg === 'today') { tm.textContent = '今天截止 · ' + fmt(it.ts || Date.now()); tm.classList.add('due-today'); }
        else tm.textContent = it.due + ' 截止 · ' + fmt(it.ts || Date.now());
      } else tm.textContent = fmt(it.ts || Date.now());
      main.appendChild(txt); main.appendChild(tm);

      function actBtn(cls, icon, title, handler) {
        var b = document.createElement('button');
        b.className = 'mm-act ' + cls; b.innerHTML = icon; b.title = title;
        b.addEventListener('click', handler);
        return b;
      }
      var dueBtn = actBtn('mm-due' + (it.due ? ' on' : ''), '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="16" rx="2.5"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/></svg>', '截止日期', function () { setDue(it); });
      var shr = actBtn('mm-share', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 3.5L10 13.5"/><path d="M21.5 3.5L15 21l-5-7.5-7.5-4z"/></svg>', '发给TA', function () {
        var dueTxt = it.due ? '（' + it.due + ' 截止）' : '';
        if (typeof window.chatAddIn === 'function') { try { window.chatAddIn('备忘 · ' + (it.t || '') + dueTxt); toastMini('已发送'); } catch (e) {} }
        else toastMini('聊天未就绪');
      });
      var pin = actBtn('mm-pin' + (it.pin ? ' on' : ''), '📌', it.pin ? '取消置顶' : '置顶', function () {
        var cur = items.find(function (x) { return x.id === it.id; }); if (!cur) return;
        cur.pin = !cur.pin; saveItems(); vibrate(6); renderList();
      });
      var del = actBtn('mm-del', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>', '删除', function () {
        items = loadItems().filter(function (x) { return x.id !== it.id; }); saveItems(); renderList(); notify('已删除');
      });

      row.appendChild(chk); row.appendChild(main); row.appendChild(dueBtn); row.appendChild(shr); row.appendChild(pin); row.appendChild(del);
      list.appendChild(row);
    });
  }

  function editItem(it) {
    var val = String(it.t || '');
    var v = window.prompt('编辑备忘', val);
    if (v == null) return;
    v = strim(v); if (!v) return;
    var cur = loadItems().find(function (x) { return x.id === it.id; }); if (!cur) return;
    cur.t = v.slice(0, 500); cur.ts = Date.now(); saveItems(); items = loadItems(); renderList();
  }
  function setDue(it) {
    var d = new Date();
    var fmt = function (off) { var x = new Date(d.getTime() + off * 86400000); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    var satOff = ((6 - d.getDay()) + 7) % 7 || 7;
    var msg = '设置截止（「' + clip(it.t, 14) + '」' + (it.due ? ' 当前 ' + it.due : '') + '）\n' +
      '1=今天  2=明天  3=后天  4=周末  0=清除';
    var r = window.prompt(msg, it.due || '');
    if (r == null) return;
    r = strim(r);
    var map = { '1': fmt(0), '2': fmt(1), '3': fmt(2), '4': fmt(satOff), '0': 'clear' };
    var val = map[r] !== undefined ? map[r] : (/^\d{4}-\d{2}-\d{2}$/.test(r) ? r : null);
    if (val == null) { toastMini('无效日期'); return; }
    var cur = loadItems().find(function (x) { return x.id === it.id; }); if (!cur) return;
    cur.due = val === 'clear' ? null : val; saveItems(); items = loadItems(); renderList();
    toastMini(val === 'clear' ? '已清除截止' : '已设置截止');
  }

  function addItem() {
    var inp = rootEl && rootEl.querySelector('#memoInp'); if (!inp) return;
    var v = strim(inp.value); if (!v) { toastMini('先写点内容吧'); return; }
    items = loadItems();
    items.unshift({ id: Date.now() + '-' + Math.floor(Math.random() * 1000), t: v.slice(0, 500), done: false, pin: false, due: null, ts: Date.now() });
    saveItems(); inp.value = ''; renderList();
    if (Math.random() < 0.25) toastMini(pick(MSG_ADD));
  }
  function clearDone() {
    items = loadItems().filter(function (x) { return !x.done; });
    saveItems(); renderList(); notify('已清完全部完成项');
  }

  function bind() {
    if (!rootEl) return;
    var back = rootEl.querySelector('#memoBack');
    if (back) back.addEventListener('click', close);
    var sb = rootEl.querySelector('#memoAddBtn');
    if (sb) sb.addEventListener('click', addItem);
    var inp = rootEl.querySelector('#memoInp');
    if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });
    var cd = rootEl.querySelector('#memoClearDone');
    if (cd) cd.addEventListener('click', clearDone);
    var st = rootEl.querySelector('#memoSendToggle');
    if (st) st.addEventListener('click', function () { setSendOn(!sendOn()); renderList(); toastMini(sendOn() ? '已开启：完成后发到聊天' : '已关闭：完成后发到聊天'); });
  }

  function ensureHost() {
    hostEl = document.getElementById('memo-modal');
    if (!hostEl) {
      hostEl = document.createElement('div');
      hostEl.className = 'modal';
      hostEl.id = 'memo-modal';
      hostEl.innerHTML = '<div class="modal-content memo-content" id="memoRoot"></div>';
      document.body.appendChild(hostEl);
    }
    rootEl = document.getElementById('memoRoot');
  }

  function open() { ensureHost(); items = loadItems(); render(); if (typeof showModal === 'function') showModal(hostEl); }
  function close() { if (hostEl && typeof hideModal === 'function') hideModal(hostEl); }
  function saveKey() { return ITEM_KEY; }

  window.Memo = { open: open, close: close, saveKey: saveKey };

  function bindEntry() {
    var btn = document.getElementById('memo-function');
    if (btn && !btn.__memoBound) {
      btn.__memoBound = true;
      btn.addEventListener('click', function () {
        var adv = document.getElementById('advanced-modal');
        if (adv && typeof hideModal === 'function') { try { hideModal(adv); } catch (e) {} }
        open();
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEntry);
  else bindEntry();
})();
