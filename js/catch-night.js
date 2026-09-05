/* ══════════════════════════════════════════════════════════════════
   熬瞢模式 · 熬夜检测（仅"睡觉陪伴"模式生效）
   —— 默认开启熬夜检测（进睡觉陪伴自动监测）；
   —— "熬夜模式"按钮 = 开启后关闭检测（进入熬夜状态，不抓）；
   —— 20 分钟仍在触屏 → 发通知；
   —— 切后台回来：<7h 发；7h~12h 不发；>12h 发；
   —— 模板库：氛围感"经期后面、顶部格言前面"可增删改；
   —— 消息系统客观口吻（_addCallEvent，sender='system'）。
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var PREFIX = (typeof window.APP_PREFIX === 'string') ? window.APP_PREFIX : 'CHAT_APP_V3_';

  // —— 状态：enabled=true 表示"熬夜检测开启"，默认开启 ——
  var ENABLED_KEY = PREFIX + 'catchNightEnabled';
  var HIDDEN_KEY  = PREFIX + 'catchNightHiddenTs';   // 上次切后台时间
  var enabled = true;            // 默认开启熬夜检测
  var sleepStartAt = 0;
  var running = false;           // 是否处于睡眠陪伴监控中
  var lastTouch = 0;
  var touchBound = false;

  function loadState() {
    try { var v = localStorage.getItem(ENABLED_KEY); if (v !== null) enabled = (v === '1'); } catch (e) {}
    // 默认 true（开启检测），只在用户明确存过时才读，否则一直默认开启
  }
  function saveState() {
    try { localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0'); } catch (e) {}
  }

  // —— 模板库 ——
  var KEY = PREFIX + 'catchNightTemplates';
  var DEFAULT_TEMPLATES = [
    '【自动通知】检测到您的恋人{name}开启了熬夜检测，今晚要一起好好睡觉哦',
    '【自动通知】检测到{name}已经 20 分钟没有入睡，还在玩手机，快去催催吧',
    '【自动通知】监测到{name}把界面切到后台 {mins} 分钟，疑似悄悄熬夜，快去抓人',
    '【自动通知】监测到{name}把界面切到后台超过 12 小时，都不太敢回来了…',
    '【自动通知】{name}已经乖乖入睡啦，今晚也睡个好觉'
  ];
  var templates = [];
  function loadTemplates() {
    try {
      var v = localStorage.getItem(KEY);
      if (v) { templates = JSON.parse(v); if (!Array.isArray(templates)) templates = []; }
      else templates = DEFAULT_TEMPLATES.slice();
    } catch (e) { templates = DEFAULT_TEMPLATES.slice(); }
  }
  function saveTemplates() {
    try { localStorage.setItem(KEY, JSON.stringify(templates)); } catch (e) {}
  }
  function fillTemplate(tpl, name, mins) {
    return String(tpl).replace(/\{name\}/g, name || '对方').replace(/\{mins\}/g, (mins != null ? mins : 0));
  }

  // —— 暴露 API ——
  window.catchNight = {
    // 是否开启熬夜检测
    isEnabled: function () { return enabled; },
    // 开启/关闭熬夜检测（true=检测开，false=关闭=进入熬夜模式）
    setEnabled: function (v) {
      enabled = !!v; saveState();
      if (enabled) notify(pickupTemplate('start'));
      return enabled;
    },
    // 切换熬夜检测开关
    toggle: function () { return window.catchNight.setEnabled(!enabled); },
    getTemplates: function () { return templates.slice(); },
    setTemplates: function (arr) { if (Array.isArray(arr)) { templates = arr.slice(); saveTemplates(); } },
    addTemplate: function (t) { if (t) { templates.push(String(t).trim()); saveTemplates(); } },
    removeTemplate: function (i) { if (i >= 0 && i < templates.length) { templates.splice(i, 1); saveTemplates(); } },
    key: KEY,
  };

  // 由"熬夜模式"按钮调用：切换检测开关，返回新状态
  window._tapCatchNight = function () {
    window.catchNight.toggle();
    return enabled;
  };
  // 供陪伴页 UI 调用：设置
  window._setCatchNight = function (v) { return window.catchNight.setEnabled(v); };
  window._refreshCatchNightTemplates = function () { loadTemplates(); };

  function myName() { return (typeof settings !== 'undefined' && settings.myName) || '我'; }

  function notify(label) {
    try {
      if (typeof window._addCallEvent === 'function') window._addCallEvent('fa-moon', label, null);
      else if (typeof showNotification === 'function') showNotification(label, 'info');
    } catch (e) { console.warn('[catchNight] notify:', e); }
  }
  function pickupTemplate(kind, mins) {
    loadTemplates();
    const idxMap = { start:0, touch20:1, backShort:2, backLong:3, sleep:4 };
    const i = idxMap[kind] != null ? idxMap[kind] : 0;
    return fillTemplate(templates[i] || DEFAULT_TEMPLATES[i] || '【自动通知】{name}', myName(), mins);
  }

  // —— 陪伴生命周期 ——
  function onCompanionStart() {
    if (window._companionCurrentMode !== 'sleep') return;
    if (!enabled) return;              // 熬夜模式开启=检测关闭 → 不监测
    sleepStartAt = Date.now();
    lastTouch = Date.now();
    running = true;
    try { localStorage.removeItem(HIDDEN_KEY); } catch (e) {}
    bindTouch();
    notify(pickupTemplate('start'));
  }
  function onCompanionStop() {
    if (!running) return;
    running = false;
    unbindTouch();
    try { localStorage.removeItem(HIDDEN_KEY); } catch (e) {}
  }

  // —— 触屏监控：20 分钟仍在触屏 → 发通知 ——
  function bindTouch() {
    if (touchBound) return;
    touchBound = true;
    var on = function () { lastTouch = Date.now(); };
    document.addEventListener('touchstart', on, { passive: true });
    document.addEventListener('mousemove', on, { passive: true });
    window._catchTouchOff = on;
    window._catchTimer = setInterval(function () {
      if (!running) { clearInterval(window._catchTimer); window._catchTimer = null; return; }
      var elapsed = Date.now() - sleepStartAt;
      if (elapsed >= 20 * 60000 && (Date.now() - lastTouch) < 5000) {
        notify(pickupTemplate('touch20'));
        clearInterval(window._catchTimer); window._catchTimer = null;
      }
    }, 5000);
  }
  function unbindTouch() {
    if (!touchBound) return;
    touchBound = false;
    if (window._catchTouchOff) { try { document.removeEventListener('touchstart', window._catchTouchOff); document.removeEventListener('mousemove', window._catchTouchOff); } catch (e) {} }
    if (window._catchTimer) { clearInterval(window._catchTimer); window._catchTimer = null; }
  }

  // —— 切后台监控：回来时按 7h/12h 分档 ——
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
      if (mins < 7 * 60) notify(pickupTemplate('backShort', mins));
      else if (mins > 12 * 60) notify(pickupTemplate('backLong', mins));
      // 7h~12h 不发（正常睡眠）
    }
  }

  // —— 启动 ——
  loadState();
  loadTemplates();
  document.addEventListener('visibilitychange', _onVis);
  // 轮询：检测陪伴模式，进入 sleep 时若检测开启则启动监控
  setInterval(function () {
    var mode = window._companionCurrentMode;
    if (mode === 'sleep' && !running) onCompanionStart();
    else if (mode !== 'sleep' && running) onCompanionStop();
  }, 1000);
})();
