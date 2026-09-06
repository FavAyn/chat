// 熬夜检测（仅睡觉陪伴）——默认开启，只检切后台；通知用"我说的话"；模板无自动名字；切换即时生效
(function () {
  'use strict';
  var PREFIX = (typeof window.APP_PREFIX === 'string') ? window.APP_PREFIX : 'CHAT_APP_V3_';
  var ENABLED_KEY = PREFIX + 'catchNightEnabled';
  var HIDDEN_KEY  = PREFIX + 'catchNightHiddenTs';
  var enabled = true;
  var running = false;
  function isSleep() { return window._companionCurrentMode === 'sleep'; }
  function loadState() { try { var v = localStorage.getItem(ENABLED_KEY); if (v !== null) enabled = (v === '1'); } catch (e) {} }
  function saveState() { try { localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0'); } catch (e) {} }

  var KEY = PREFIX + 'catchNightTemplates';
  var DEFAULT_TEMPLATES = [
    '开启熬夜检测，今晚要一起好好睡觉哦',
    '已经 20 分钟没有入睡，还在玩手机，快去催催吧',
    '把界面切到后台 {mins} 分钟，疑似悄悄熬夜，快去抓人',
    '把界面切到后台超过 12 小时，都不太敢回来了…',
    '已经乖乖入睡啦，今晚也睡个好觉',
    '我开启了熬夜模式，今晚不检测啦，别来抓我'
  ];
  var templates = [];
  function loadTemplates() {
    try {
      var v = localStorage.getItem(KEY);
      if (v) { templates = JSON.parse(v); if (!Array.isArray(templates)) templates = []; }
      else templates = DEFAULT_TEMPLATES.slice();
    } catch (e) { templates = DEFAULT_TEMPLATES.slice(); }
  }
  function saveTemplates() { try { localStorage.setItem(KEY, JSON.stringify(templates)); } catch (e) {} }
  // 模板不再自动填 {name}，只替换 {mins}（时长）
  function fillTemplate(tpl, mins) { return String(tpl).replace(/\{mins\}/g, (mins != null ? mins : 0)); }

  window.catchNight = {
    isEnabled: function () { return enabled; },
    setEnabled: function (v) {
      enabled = !!v; saveState();
      // 切换立即生效：关了马上停，开了且处于睡眠陪伴则立刻启动
      if (!enabled) {
        if (running) onCompanionStop();
        // 开启"熬瞢模式"（=关闭熬夜检测）时，给对方发一条"我开了这个模式"的通知
        sendUserMsg(pickupTemplate('modeOn'));
      } else if (isSleep() && !running) {
        onCompanionStart();
      }
      return enabled;
    },
    toggle: function () { return window.catchNight.setEnabled(!enabled); },
    getTemplates: function () { return templates.slice(); },
    setTemplates: function (arr) { if (Array.isArray(arr)) { templates = arr.slice(); saveTemplates(); } },
    addTemplate: function (t) { if (t) { templates.push(String(t).trim()); saveTemplates(); } },
    removeTemplate: function (i) { if (i >= 0 && i < templates.length) { templates.splice(i, 1); saveTemplates(); } },
    key: KEY,
  };
  window._tapCatchNight = function () { return window.catchNight.toggle(); };
  window._setCatchNight = function (v) { return window.catchNight.setEnabled(v); };
  window._refreshCatchNightTemplates = function () { loadTemplates(); };

  // 发"我说的话"：作为用户消息，不用系统小黑条
  function sendUserMsg(label) {
    try {
      if (typeof addMessage === 'function') {
        addMessage({ id: Date.now() + Math.random(), sender: 'user', text: label, timestamp: new Date(), type: 'normal' });
        if (typeof throttledSaveData === 'function') throttledSaveData();
        if (typeof renderMessages === 'function') renderMessages();
      } else if (typeof window._addCallEvent === 'function') {
        window._addCallEvent('fa-moon', label, null);
      } else if (typeof showNotification === 'function') {
        showNotification(label, 'info');
      }
    } catch (e) { console.warn('[catchNight] send:', e); }
  }
  function pickupTemplate(kind, mins) {
    loadTemplates();
    var idxMap = { start: 0, touch20: 1, backShort: 2, backLong: 3, sleep: 4, modeOn: 5 };
    var i = (idxMap[kind] != null) ? idxMap[kind] : 0;
    return fillTemplate(templates[i] || DEFAULT_TEMPLATES[i] || '', mins);
  }

  function onCompanionStart() {
    if (!isSleep()) return;
    if (!enabled) return;  // 熬夜模式开启=检测关闭 → 不监测
    running = true;
    try { localStorage.removeItem(HIDDEN_KEY); } catch (e) {}
    // 静默开启：不主动发"开启熬夜检测"消息，只在切后台被"抓到"时才发
  }
  function onCompanionStop() { running = false; try { localStorage.removeItem(HIDDEN_KEY); } catch (e) {} }

  // 切后台监控：回来时按 7h/12h 分档
  function _onVis() {
    if (!running) return;
    if (document.hidden) {
      try { localStorage.setItem(HIDDEN_KEY, String(Date.now())); } catch (e) {}
    } else {
      var hidStr = null; try { hidStr = localStorage.getItem(HIDDEN_KEY); } catch (e) {}
      if (!hidStr) return;
      var hid = parseInt(hidStr, 10);
      try { localStorage.removeItem(HIDDEN_KEY); } catch (e) {}
      var mins = Math.round((Date.now() - hid) / 60000);
      if (mins < 7 * 60) sendUserMsg(pickupTemplate('backShort', mins));
      else if (mins > 12 * 60) sendUserMsg(pickupTemplate('backLong', mins));
      // 7h~12h 不发（正常睡眠）
    }
  }

  loadState();
  loadTemplates();
  document.addEventListener('visibilitychange', _onVis);
  // 轮询：进入 sleep 且检测开启则启动监控；离开/关闭则停
  setInterval(function () {
    if (isSleep() && enabled && !running) onCompanionStart();
    else if ((!isSleep() || !enabled) && running) onCompanionStop();
  }, 1000);
})();
