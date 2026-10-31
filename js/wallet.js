/* 心意币钱包（统一账本：对齐 mochi 的 gift-wallet，{myBalance, systemBalance}，单位：分）
   —— 花园、五子棋、记忆翻牌等所有游戏 + 未来集市共用这一本账。 */
(function () {
  'use strict';
  var PREFIX = (typeof window.APP_PREFIX === 'string') ? window.APP_PREFIX : 'CHAT_APP_V3_';
  function PF() {
    try { if (typeof window.activePrefix === 'function') return window.activePrefix(); } catch (e) {}
    var sid = (typeof window.SESSION_ID === 'string' && window.SESSION_ID) ? window.SESSION_ID : 'default';
    return PREFIX + sid + '_garden_';
  }
  function KEY() { return PF() + 'gift-wallet'; }

  function getWallet() {
    try {
      var w = JSON.parse(localStorage.getItem(KEY()) || '');
      if (w && typeof w.myBalance === 'number' && typeof w.systemBalance === 'number') return w;
    } catch (e) {}
    return { myBalance: 52000, systemBalance: 52000 }; // 默认 ¥520（对齐 mochi）
  }
  function setWallet(w) { try { localStorage.setItem(KEY(), JSON.stringify(w)); } catch (e) {} }
  function fmt(fen) { return '¥' + (fen / 100).toFixed(2); }
  function updateUI() {
    var bal = getWallet().myBalance;
    document.querySelectorAll('[data-wallet-bal]').forEach(function (el) { el.textContent = fmt(bal); });
  }

  // mochi 花园/游戏统一签名：giftWalletChange(变化分, 实际分, 描述)
  window.giftWalletChange = function (delta, actual, reason) {
    var d = Math.round(delta || 0);
    var w = getWallet();
    w.myBalance = Math.max(0, (w.myBalance || 0) + d);
    w.systemBalance = Math.max(0, (w.systemBalance || 0) + d);
    setWallet(w);
    try {
      if (typeof showNotification === 'function') {
        showNotification((d >= 0 ? '+' : '') + fmt(d) + ' 心意币' + (reason ? ' · ' + reason : ''), d >= 0 ? 'success' : 'info');
      }
    } catch (e) {}
    updateUI();
    return d;
  };

  window._walletBalance = function () { return getWallet().myBalance; };
  window._walletFmt = fmt;
  window._walletUpdateUI = updateUI;
  window._walletGet = getWallet;
  window._walletSet = setWallet;

  document.addEventListener('DOMContentLoaded', updateUI);
})();
