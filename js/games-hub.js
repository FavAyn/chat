/* 小游戏 / 功能入口：
   输入栏「视频通话」旁的省略号按钮 → 弹出「花园 / 小游戏」两个入口（无标题栏）
   → 点「小游戏」进入小游戏列表（五子棋等）。 */
(function () {
  'use strict';

  var st = document.createElement('style');
  st.textContent =
    '.gh-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:4px 0 12px}' +
    '.gh-item{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 6px;border:1px solid var(--border-color);border-radius:14px;background:var(--primary-bg);cursor:pointer;transition:all .2s;font-family:inherit}' +
    '.gh-item:hover{border-color:var(--accent-color);background:rgba(var(--accent-color-rgb),.08)}' +
    '.gh-emoji{font-size:26px;line-height:1}' +
    '.gh-label{font-size:12px;color:var(--text-primary);font-weight:600}' +
    '.gh-back{display:flex;align-items:center;gap:6px;margin:0 0 10px;padding:6px 10px;border:none;background:rgba(var(--accent-color-rgb),.1);color:var(--accent-color);border-radius:10px;font-size:12px;cursor:pointer;font-family:inherit}';
  (document.head || document.documentElement).appendChild(st);

  function item(key, emoji, label, enabled) {
    return '<button data-hub="' + key + '" class="gh-item"' + (enabled === false ? ' style="opacity:.45;"' : '') + '>' +
      '<span class="gh-emoji">' + emoji + '</span><span class="gh-label">' + label + '</span></button>';
  }

  function buildTop(modal) {
    var body = modal.querySelector('.gh-body');
    body.innerHTML = '<div class="gh-grid">' +
        item('garden', '🌸', '花园', true) +
        item('games', '🎮', '小游戏', true) +
      '</div>';
    bind(modal);
  }

  function buildGames(modal) {
    var body = modal.querySelector('.gh-body');
    body.innerHTML =
      '<button class="gh-back" id="gh-back"><i class="fas fa-arrow-left"></i> 返回</button>' +
      '<div class="gh-grid">' +
        item('gomoku', '⚫', '五子棋', !!window.openGomokuPanel) +
        item('memory', '🃏', '记忆翻牌', !!window.openMemoryPanel) +
        item('c4', '🔴', '四子棋', !!window.openC4Panel) +
        item('snake', '🐍', '贪吃蛇', !!window.openSnakePanel) +
        item('pong', '🏓', 'Pong', !!window.openPongPanel) +
        item('brick', '🧱', '打砖块', !!window.openBrickPanel) +
        item('ms', '💣', '合作扫雷', !!window.openMsPanel) +
      '</div>';
    var back = body.querySelector('#gh-back');
    if (back) back.onclick = function () { buildTop(modal); };
    bind(modal);
  }

  function bind(modal) {
    modal.querySelectorAll('[data-hub]').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-hub');
        if (k === 'games') { buildGames(modal); return; }
        close(modal);
        if (k === 'garden' && typeof window._mochiGardenOpen === 'function') { window._mochiGardenOpen(); }
        else if (k === 'gomoku' && typeof window.openGomokuPanel === 'function') { window.openGomokuPanel(); }
        else if (k === 'memory' && typeof window.openMemoryPanel === 'function') { window.openMemoryPanel(); }
        else if (k === 'c4' && typeof window.openC4Panel === 'function') { window.openC4Panel(); }
        else if (k === 'snake' && typeof window.openSnakePanel === 'function') { window.openSnakePanel(); }
        else if (k === 'pong' && typeof window.openPongPanel === 'function') { window.openPongPanel(); }
        else if (k === 'brick' && typeof window.openBrickPanel === 'function') { window.openBrickPanel(); }
        else if (k === 'ms' && typeof window.openMsPanel === 'function') { window.openMsPanel(); }
        else if (typeof showNotification === 'function') { showNotification('该功能即将上线', 'info'); }
      };
    });
  }

  function close(modal) {
    if (typeof hideModal === 'function') hideModal(modal);
    setTimeout(function () { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 300);
  }

  function openHub() {
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.zIndex = '2600';
    // 无标题栏：直接是内容
    modal.innerHTML = '<div class="modal-content" style="padding:20px 20px 14px;"><div class="gh-body"></div>' +
      '<div class="modal-buttons" style="margin-top:6px;"><button class="modal-btn modal-btn-secondary" id="gh-close">关闭</button></div></div>';
    document.body.appendChild(modal);
    if (typeof showModal === 'function') showModal(modal);
    modal.querySelector('#gh-close').onclick = function () { close(modal); };
    modal.addEventListener('click', function (e) { if (e.target === modal) close(modal); });
    buildTop(modal);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('#games-hub-btn');
    if (!btn) return;
    e.preventDefault();
    openHub();
  });

  window.openGamesPanel = openHub;
})();
