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
  // 模板按组区分（前缀标签）：[模式]=开启熬夜模式通知、[切后台]=切后台通知、[12小时]=超12小时通知。
  // 同组可写多条，触发时"组内随机"挑一条。
  var TAG = { modeOn: '[模式]', backShort: '[切后台]', backLong: '[12小时]' };
  var DEFAULT_TEMPLATES = [
    '[模式]我开启了熬夜模式，今晚不检测啦，别来抓我',
    '[切后台]把界面切到后台 {mins} 分钟，疑似悄悄熬夜，快去抓人',
    '[切后台]又偷偷切后台 {mins} 分钟，还不快点去睡',
    '[12小时]把界面切到后台超过 12 小时，都不太敢回来了…'
  ];
  var templates = [];
  function loadTemplates() {
    var arr = null;
    try { var v = localStorage.getItem(KEY); if (v) { arr = JSON.parse(v); if (!Array.isArray(arr)) arr = null; } } catch (e) { arr = null; }
    if (!arr) { templates = DEFAULT_TEMPLATES.slice(); return; }
    // 兼容旧数据：若无任何 [标签]，按顺序迁移（第1→模式、第2→切后台、第3→12小时，其余归切后台）
    var hasTag = arr.some(function (t) { return /^\[[^\]]*\]/.test(String(t)); });
    if (!hasTag && arr.length) {
      var order = [TAG.modeOn, TAG.backShort, TAG.backLong];
      arr = arr.map(function (t, i) { return (order[i] || TAG.backShort) + String(t); });
      try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
    }
    templates = arr;
  }
  function saveTemplates() { try { localStorage.setItem(KEY, JSON.stringify(templates)); } catch (e) {} }
  // 去掉前缀标签
  function stripTag(s) { return String(s).replace(/^\[[^\]]*\]\s*/, ''); }
  // 只替换 {mins}（时长）
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
    var tag = TAG[kind];
    if (!tag) return '';
    // 从"该组"的模板里随机取一条（同组多条就随机，每次不一样）
    var pool = templates.filter(function (t) { return String(t).indexOf(tag) === 0; });
    if (!pool.length) pool = DEFAULT_TEMPLATES.filter(function (t) { return String(t).indexOf(tag) === 0; });
    if (!pool.length) return '';
    var pick = pool[Math.floor(Math.random() * pool.length)];
    return fillTemplate(stripTag(pick), mins);
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
