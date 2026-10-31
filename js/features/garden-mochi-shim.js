/* 言序花园（mochi garden）适配层：给移植过来的 garden-mochi.js 补齐 mochi 框架依赖。
   存储→milk localStorage / localforage；弹窗→milk modal；字卡/跨模块→安全兜底。 */
(function () {
  'use strict';
  function pf() {
    var app = (typeof window.APP_PREFIX === 'string') ? window.APP_PREFIX : 'CHAT_APP_V3_';
    var sid = (typeof window.SESSION_ID === 'string' && window.SESSION_ID) ? window.SESSION_ID : 'default';
    return app + sid + '_garden_';
  }
  window.activePrefix = pf;
  function mkStore() {
    return {
      get: function (k) { try { return localStorage.getItem(pf() + k); } catch (e) { return null; } },
      set: function (k, v) { try { localStorage.setItem(pf() + k, v); } catch (e) {} },
      remove: function (k) { try { localStorage.removeItem(pf() + k); } catch (e) {} }
    };
  }
  window.activeStore = mkStore;
  window.storeFor = function () { return mkStore(); };
  window.xyStore = function () { return mkStore(); };

  // IndexedDB 走 milk 的 localforage
  window.idbGet = function (k) { try { return (window.localforage ? localforage.getItem(k) : Promise.resolve(null)); } catch (e) { return Promise.resolve(null); } };
  window.idbSet = function (k, v) { try { return (window.localforage ? localforage.setItem(k, v) : Promise.resolve()); } catch (e) { return Promise.resolve(); } };
  window.idbDelete = function (k) { try { return (window.localforage ? localforage.removeItem(k) : Promise.resolve()); } catch (e) { return Promise.resolve(); } };

  // 字卡/联系人相关：milk 简化兜底
  window.taFit = function (x) { return x; };
  window.getLibPool = function () { return []; };
  window.getContacts = function () { return [{ id: 'default', name: (window.settings && settings.partnerName) || 'TA' }]; };
  window.isDefaultCardOff = function () { return false; };
  window.gateCardFallback = function () { return ''; };

  // 跨模块互动：发花可接 milk 聊天；动态/钱包等静默跳过
  window.chatSendFlower = function (text) { try { if (typeof window._addCallEvent === 'function') window._addCallEvent('fa-seedling', text || '收到一束花', null); } catch (e) {} };
  window.feedAddPost = function () {};
  window.giftWalletChange = function () { return 0; };
  window.dcfGet = function () { return null; };
  window.gardenBloomDates = function () { return []; };

  // 小游戏（五子棋等）用到的聊天/互动接口
  window.chatAddIn = function (text, opts) {
    try {
      if (typeof addMessage === 'function') {
        addMessage({ id: Date.now() + Math.random(), sender: (window.settings && settings.partnerName) || 'TA', text: text, timestamp: new Date(), status: 'received', favorited: false, note: null, type: 'normal' });
        if (typeof throttledSaveData === 'function') throttledSaveData();
        if (typeof renderMessages === 'function') renderMessages();
      }
    } catch (e) { console.warn('[chatAddIn]', e); }
  };
  window.chatAddSystem = function (text, opts) {
    try { if (typeof window._addCallEvent === 'function') window._addCallEvent('fa-gamepad', text, null); } catch (e) {}
  };
  window.mochiDevice = { isMobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent), isTablet: false };
  window.chatPartnerName = function () { return (window.settings && settings.partnerName) || 'TA'; };
  window.taWord = function (x) { return x; };
  window.chatSendMsg = function (t) { try { if (typeof window.sendMessage === 'function') return window.sendMessage(t); } catch (e) {} };
  window.getInteractPool = function () { return []; };
  window.arcadeMult = function () { return 1; };
  window.arcadeTryDrop = function () { return false; };
  window.arcadeMarkLuckyPlayed = function () {};

  // 数据加载占位（milk 没有 mochi 的 IDB 回填体系 → 直接走正常渲染）
  window.mochiDataPending = function () { return false; };
  window.mochiLoadingHtml = function (n) { return '<div style="padding:20px;text-align:center;opacity:.6">' + (n || '') + '加载中…</div>'; };
  window.mochiOnDataReady = function () {};

  // 通用弹窗：标题 + 静态文本 + pills 按钮（种植/收获/升级等都用它）
  window.openModal = function (title, placeholder, cb, opts) {
    opts = opts || {};
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.zIndex = '999999';
    var pills = opts.pills || [{ label: '好的', value: 'ok' }];
    var btns = pills.map(function (p) {
      return '<button class="modal-btn modal-btn-primary" data-v="' + String(p.value) + '">' + (p.label || '确定') + '</button>';
    }).join('');
    modal.innerHTML =
      '<div class="modal-content">' +
        '<div class="modal-title"><span>' + (title || '') + '</span></div>' +
        '<div style="white-space:pre-wrap;color:var(--text-secondary);font-size:14px;line-height:1.7;margin-bottom:16px;">' + (opts.staticText || '') + '</div>' +
        '<div class="modal-buttons">' + btns + '</div>' +
      '</div>';
    document.body.appendChild(modal);
    if (typeof showModal === 'function') showModal(modal);
    modal.querySelectorAll('[data-v]').forEach(function (b) {
      b.onclick = function () {
        if (typeof hideModal === 'function') hideModal(modal);
        setTimeout(function () { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 300);
        if (cb) { try { cb(b.dataset.v); } catch (e) { console.warn('[garden openModal cb]', e); } }
      };
    });
  };

  // —— 花园数据管理：导出 / 清空（数据存在 activePrefix()+'garden-data'）——
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-garden-act]');
    if (!b) return;
    var act = b.getAttribute('data-garden-act');
    var key = window.activePrefix() + 'garden-data';
    if (act === 'export') {
      try {
        var raw = localStorage.getItem(key) || '';
        if (!raw) { if (typeof showNotification === 'function') showNotification('暂无花园数据', 'info'); return; }
        var dataStr = JSON.stringify(JSON.parse(raw), null, 2);
        if (typeof downloadFileFallback === 'function') {
          downloadFileFallback(new Blob([dataStr], { type: 'application/json' }), 'garden-data-' + new Date().toISOString().slice(0, 10) + '.json');
        } else {
          var a = document.createElement('a'); a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr); a.download = 'garden-data.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
        if (typeof showNotification === 'function') showNotification('花园数据已导出', 'success');
      } catch (err) { console.warn('[garden export]', err); }
    } else if (act === 'clear') {
      if (!confirm('确定清空花园数据吗？此操作不可恢复')) return;
      try { localStorage.removeItem(key); } catch (e) {}
      try { if (window.localforage) localforage.removeItem(window.activePrefix() + ':garden-data'); } catch (e) {}
      if (typeof showNotification === 'function') showNotification('花园数据已清空', 'success');
      setTimeout(function () { try { if (window._mochiGardenClose) window._mochiGardenClose(); } catch (e) {} location.reload(); }, 400);
    }
  });

  // 返回花园时切回情侣空间动态 tab（避免停在空的旧花园 tab）
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#garden-back');
    if (!b) return;
    setTimeout(function () { try { if (typeof window.csSwitchTab === 'function') window.csSwitchTab('feed'); } catch (e) {} }, 30);
  }, true);
})();
