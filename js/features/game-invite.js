/* 梦角主动邀请玩游戏：按概率发消息邀请，接受即开对应小游戏 */
(function () {
  'use strict';
  var P = (typeof window.APP_PREFIX === 'string') ? window.APP_PREFIX : 'CHAT_APP_V3_';
  var COOLDOWN = 10 * 60 * 1000; // 两次邀请至少间隔 10 分钟
  var GAMES = [
    { kind: 'gomoku', title: '五子棋', fn: function () { return window.openGomokuPanel; }, lines: ['想和你下五子棋，来一局？', '来盘五子棋嘛～'] },
    { kind: 'memory', title: '记忆翻牌', fn: function () { return window.openMemoryPanel; }, lines: ['陪我玩记忆翻牌？', '来玩翻牌吧！'] },
    { kind: 'c4', title: '四子棋', fn: function () { return window.openC4Panel; }, lines: ['来下四子棋？', '四子棋来一局？'] },
    { kind: 'snake', title: '贪吃蛇', fn: function () { return window.openSnakePanel; }, lines: ['一起玩贪吃蛇？', '来玩双人贪吃蛇？'] },
    { kind: 'pong', title: 'Pong', fn: function () { return window.openPongPanel; }, lines: ['来一局 Pong？', '想和你打 Pong！'] },
    { kind: 'brick', title: '打砖块', fn: function () { return window.openBrickPanel; }, lines: ['一起打砖块？', '来打砖块吧！'] },
    { kind: 'ms', title: '合作扫雷', fn: function () { return window.openMsPanel; }, lines: ['一起扫雷？', '来合作扫雷？'] }
  ];
  function cfgN(k, d) { try { var v = parseInt(localStorage.getItem(P + k), 10); return isNaN(v) ? d : v; } catch (e) { return d; } }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function partnerName() { try { return (window.settings && settings.partnerName) || 'TA'; } catch (e) { return 'TA'; } }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function chatVisible() {
    try {
      var el = document.getElementById('chat-page') || document.getElementById('messages-container');
      if (el) { var cs = getComputedStyle(el); if (cs.display === 'none' || el.offsetParent === null) return false; }
    } catch (e) {}
    return !document.hidden;
  }

  function doInvite() {
    var avail = GAMES.filter(function (g) { return typeof g.fn() === 'function'; });
    if (!avail.length) return false;
    var g = pick(avail);
    var name = partnerName();
    var line = pick(g.lines);
    try { if (typeof window.chatAddIn === 'function') window.chatAddIn(name + ' ' + line, { special: 'poke', initiative: true, gInv: g.kind }); } catch (e) {}
    setTimeout(function () { showConfirm(g, name, line); }, 900 + Math.random() * 600);
    return true;
  }

  function showConfirm(g, name, line) {
    var old = document.querySelector('.gi-overlay'); if (old) old.remove();
    var ov = document.createElement('div');
    ov.className = 'gi-overlay';
    ov.innerHTML = '<div class="gi-card">' +
      '<div class="gi-title">' + esc(name) + ' 的邀请</div>' +
      '<div class="gi-body">' + esc(name + ' ' + line) + '</div>' +
      '<div class="gi-btns"><button class="gi-no">下次吧</button><button class="gi-ok">好啊</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector('.gi-ok').onclick = function () { ov.remove(); var fn = g.fn(); if (typeof fn === 'function') fn(); };
    ov.querySelector('.gi-no').onclick = function () { ov.remove(); };
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
  }

  window.tryGameInvite = doInvite;

  setInterval(function () {
    if (document.hidden || !chatVisible()) return;
    if (cfgN('ai-game-en', 1) !== 1) return;
    var last = 0; try { last = +localStorage.getItem(P + 'ai-invite-last') || 0; } catch (e) {}
    if (Date.now() - last < COOLDOWN) return;
    if (Math.random() * 100 >= cfgN('ai-game-prob', 10)) return;
    try { localStorage.setItem(P + 'ai-invite-last', String(Date.now())); } catch (e) {}
    doInvite();
  }, 3600000);
})();
