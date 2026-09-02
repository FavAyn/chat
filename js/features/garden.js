/* =====================================================================
 * 花园（milk 适配版）—— 情侣空间里的养成玩法 pill
 * —— 与TA共同种植：花圃、浇水、生长、成熟收货、图鉴收集、经验等级、天气季节
 *    「TA随机来帮忙」浇水/照料/留言 + 日志 + 照料统计/排行榜 + 花园报告
 * 灵感与设计参考：mochi「garden.js」；砍去杂交/化肥/金币/复杂装饰buff等重型耦合，
 * 保留「一起种花 + TA帮忙 + 收集图鉴 + 统计报告」核心共同构建体验。
 * 存储：milk 的 getStorageKey('gardenData') 强优先，回退全局 localStorage 'GARDEN_DATA_V1'
 * 对 milk API：window._gardenInit()（csSwitchTab('garden') 调用）
 * ===================================================================== */
(function () {
  'use strict';

  var GLOBAL_KEY = 'GARDEN_DATA_V1';
  var PLOTS = 12;
  var WILT_SEC = 172800;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function strim(v) { return String(v == null ? '' : v).trim(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDT(ts) { var d = new Date(ts); return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  // 带年/月/日 + 时:分:秒 的完整时间戳（用于操作记录）
  function fmtFull(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }

  // ---- 存储：优先 milk getStorageKey，回退全局 ----
  function storeKey() {
    try { if (typeof getStorageKey === 'function') return getStorageKey('gardenData'); } catch (e) {}
    return GLOBAL_KEY;
  }
  var data = null;
  function blankData() {
    return { p: [], l: [], lpc: 0, exp: 0, dex: {}, inv: {}, hq: [], gifts: [], st: { p: 0, w: 0, h: 0, f: 0, mp: 0, mw: 0, mh: 0, mf: 0 }, daily: null, taNextAt: 0 };
  }
  function load() {
    if (data) return data;
    var d = blankData();
    var k = storeKey();
    try {
      var raw = (typeof safeGetItem === 'function') ? safeGetItem(k) : localStorage.getItem(k);
      if (!raw) raw = (typeof safeGetItem === 'function') ? safeGetItem(GLOBAL_KEY) : localStorage.getItem(GLOBAL_KEY);
      if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') { for (var kk in d) if (o[kk] === undefined) o[kk] = d[kk]; d = o; } }
    } catch (e) {}
    while (d.p.length < PLOTS) d.p.push(null);
    if (!d.l) d.l = [];
    if (!d.dex) d.dex = {};
    if (!d.hq) d.hq = [];
    if (!d.gifts) d.gifts = [];
    if (!d.st) d.st = { p: 0, w: 0, h: 0, f: 0, mp: 0, mw: 0, mh: 0, mf: 0 };
    if (d.taNextAt == null) d.taNextAt = 0;
    data = d;
    return data;
  }
  function save() {
    var v = JSON.stringify(data);
    var k = storeKey();
    try { if (typeof safeSetItem === 'function') safeSetItem(k, v); else localStorage.setItem(k, v); } catch (e) {}
    try { if (typeof safeSetItem === 'function') safeSetItem(GLOBAL_KEY, v); else localStorage.setItem(GLOBAL_KEY, v); } catch (e) {}
  }
  function partnerName() {
    try { if (typeof settings !== 'undefined' && settings.partnerName) return settings.partnerName; } catch (e) {}
    try { var el = document.getElementById('partner-name'); if (el) return el.textContent; } catch (e) {}
    return 'TA';
  }
  function toastMini(msg) {
    var el = document.getElementById('gardenToast');
    if (!el) { el = document.createElement('div'); el.id = 'gardenToast'; document.body.appendChild(el); }
    el.textContent = msg; el.className = 'garden-toast show'; void el.offsetWidth; el.className = 'garden-toast show';
    clearTimeout(el._t); el._t = setTimeout(function () { el.className = 'garden-toast'; }, 1800);
  }

  // ---- 花谱（含稀有花）。ss=适宜季节 0春1夏2秋3冬；g=[生长阈值秒]；e=[成长表情]；sn=[阶段名] ----
  var T = {
    rose: { n: '玫瑰', e: ['🌱', '🌿', '🌹'], sn: ['种子', '发芽', '开花'], g: [172800, 432000], xp: 30, lv: 1, ss: 0, m: '热烈的爱' },
    sunflower: { n: '向日葵', e: ['🌱', '🌿', '🌻'], sn: ['种子', '发芽', '开花'], g: [172800, 518400], xp: 40, lv: 2, ss: 2, m: '沉默的爱' },
    tulip: { n: '郁金香', e: ['🌱', '🌿', '🌷'], sn: ['种子', '发芽', '开花'], g: [172800, 432000], xp: 30, lv: 1, ss: 0, m: '永恒的祝福' },
    cactus: { n: '仙人掌', e: ['🌱', '🌵'], sn: ['小芽', '成形'], g: [432000], xp: 50, lv: 4, ss: 1, m: '坚韧，外刚内柔' },
    lavender: { n: '薰衣草', e: ['🌱', '🌿', '💐'], sn: ['种子', '发芽', '开花'], g: [86400, 345600], xp: 25, lv: 3, ss: 3, m: '等待爱情' },
    daisy: { n: '雏菊', e: ['🌱', '🌿', '🌼'], sn: ['种子', '发芽', '开花'], g: [86400, 259200], xp: 20, lv: 1, ss: 0, m: '纯真，深藏心底的爱' },
    sakura: { n: '樱花', e: ['🌱', '🌿', '🌸'], sn: ['种子', '发芽', '开花'], g: [86400, 259200], xp: 25, lv: 1, ss: 0, m: '一生幸福' },
    hibiscus: { n: '芙蓉', e: ['🌱', '🌿', '🌺'], sn: ['种子', '发芽', '开花'], g: [172800, 345600], xp: 35, lv: 1, ss: 1, m: '纤细之美' },
    lotus: { n: '荷花', e: ['🌱', '🌿', '🪷'], sn: ['种子', '发芽', '开花'], g: [259200, 432000], xp: 45, lv: 1, ss: 1, m: '清雅坚贞' },
    clover: { n: '幸运草', e: ['🌱', '🌿', '🍀'], sn: ['种子', '发芽', '成形'], g: [43200, 129600], xp: 15, lv: 1, ss: 2, m: '幸运与希望' },
    lily: { n: '百合', e: ['🌱', '🌿', '🌷'], sn: ['种子', '发芽', '开花'], g: [172800, 432000], xp: 35, lv: 1, ss: 0, m: '纯洁的爱' },
    peony: { n: '牡丹', e: ['🌱', '🌿', '🌺'], sn: ['种子', '发芽', '开花'], g: [259200, 518400], xp: 45, lv: 3, ss: 1, m: '富贵吉祥' },
    orchid: { n: '兰花', e: ['🌱', '🌿', '🎍'], sn: ['种子', '发芽', '开花'], g: [345600, 691200], xp: 55, lv: 4, ss: 2, m: '高洁典雅' },
    maple: { n: '枫叶', e: ['🌱', '🌿', '🍁'], sn: ['种子', '发芽', '成形'], g: [86400, 259200], xp: 25, lv: 2, ss: 3, m: '美好的回忆' },
    jasmine: { n: '茉莉', e: ['🌱', '🌿', '🌼'], sn: ['种子', '发芽', '开花'], g: [86400, 172800], xp: 20, lv: 2, ss: 1, m: '清新淡雅' },
    iris: { n: '鸢尾', e: ['🌱', '🌿', '💬'], sn: ['种子', '发芽', '开花'], g: [172800, 345600], xp: 30, lv: 3, ss: 0, m: '爱的使者' },
    bamboo: { n: '竹', e: ['🌱', '🌿', '🎋'], sn: ['笋', '发芽', '成竹'], g: [432000, 864000], xp: 60, lv: 4, ss: 0, m: '坚韧不拔' },
    flameRose: { n: '灼樱玫瑰', e: ['🌱', '🌿', '🌹'], sn: ['种子', '发芽', '开花'], g: [432000, 864000], xp: 120, lv: 5, ss: 0, rare: true, m: '灼热永恒的爱' },
    blueRose: { n: '蓝玫瑰', e: ['🌱', '🌿', '🌹'], sn: ['种子', '发芽', '开花'], g: [432000, 864000], xp: 150, lv: 6, ss: 1, rare: true, m: '奇迹与不可能的爱' },
    goldSun: { n: '金向日葵', e: ['🌱', '🌿', '🌻'], sn: ['种子', '发芽', '开花'], g: [432000, 777600], xp: 130, lv: 5, ss: 2, rare: true, m: '忠诚的信仰' },
    nightLotus: { n: '夜莲', e: ['🌱', '🌿', '🪷'], sn: ['种子', '发芽', '开花'], g: [604800, 1036800], xp: 180, lv: 7, ss: 3, rare: true, m: '暗夜里的坚守' },
    lily2: { n: '星光百合', e: ['🌱', '🌿', '✨'], sn: ['种子', '发芽', '开花'], g: [604800, 1036800], xp: 170, lv: 7, ss: 0, rare: true, m: '闪耀永恒' },
    moonFlower: { n: '月光花', e: ['🌱', '🌿', '🌙'], sn: ['种子', '发芽', '开花'], g: [518400, 864000], xp: 150, lv: 6, ss: 1, rare: true, m: '夜晚的守候' },
    crystalOrchid: { n: '水晶兰', e: ['🌱', '🌿', '💎'], sn: ['种子', '发芽', '开花'], g: [691200, 1209600], xp: 200, lv: 8, ss: 2, rare: true, m: '稀世之美' },
    phoenix: { n: '凤凰花', e: ['🌱', '🌿', '🔥'], sn: ['种子', '发芽', '开花'], g: [691200, 1209600], xp: 220, lv: 8, ss: 1, rare: true, m: '涅槃重生' }
  };
  var W = [
    { i: '☀️', t: '晴朗' }, { i: '🌤️', t: '绚丽' }, { i: '🌧️', t: '小雨' }, { i: '☁️', t: '多云' }, { i: '🌈', t: '彩虹' }
  ];
  var S = ['春季', '夏季', '秋季', '冬季'];

  // ---- 颜色系统：每种花可选颜色（按真实色彩）+ 滤镜实现 emoji 变色 ----
  var COLORS = {
    red:   { n: '红', filter: 'sepia(1) saturate(6) hue-rotate(-20deg) brightness(1.05)' },
    pink:  { n: '粉', filter: 'sepia(1) saturate(4) hue-rotate(-60deg) brightness(1.2)' },
    white: { n: '白', filter: 'sepia(0.2) saturate(0) brightness(1.65)' },
    yellow:{ n: '黄', filter: 'sepia(1) saturate(5) hue-rotate(5deg) brightness(1.25)' },
    orange:{ n: '橙', filter: 'sepia(1) saturate(5) hue-rotate(-5deg) brightness(1.1)' },
    purple:{ n: '紫', filter: 'sepia(1) saturate(5) hue-rotate(215deg) brightness(1.05)' },
    blue:  { n: '蓝', filter: 'sepia(1) saturate(5) hue-rotate(175deg) brightness(1.05)' },
    cyan:  { n: '青', filter: 'sepia(1) saturate(5) hue-rotate(140deg) brightness(1.05)' },
    green: { n: '绿', filter: 'sepia(1) saturate(5) hue-rotate(60deg) brightness(1.05)' }
  };
  var C = {
    rose: ['red', 'pink', 'white', 'yellow'],
    sunflower: ['yellow', 'orange'],
    tulip: ['red', 'pink', 'yellow', 'white', 'purple'],
    cactus: [],
    lavender: ['purple', 'blue'],
    daisy: ['white', 'yellow', 'pink'],
    sakura: ['pink', 'white'],
    hibiscus: ['red', 'pink', 'orange', 'yellow'],
    lotus: ['pink', 'white'],
    clover: ['green'],
    lily: ['white', 'pink', 'yellow', 'orange'],
    peony: ['red', 'pink', 'white'],
    orchid: ['purple', 'white', 'pink'],
    maple: ['red', 'orange', 'yellow'],
    jasmine: ['white'],
    iris: ['purple', 'blue', 'yellow'],
    bamboo: ['green'],
    flameRose: ['red', 'orange', 'pink'],
    blueRose: ['blue', 'cyan'],
    goldSun: ['yellow', 'orange'],
    nightLotus: ['purple', 'blue'],
    lily2: ['white', 'cyan', 'pink'],
    moonFlower: ['white', 'yellow', 'cyan'],
    crystalOrchid: ['blue', 'purple', 'cyan'],
    phoenix: ['red', 'orange', 'yellow']
  };
  function typeColors(k) {
    var arr = C[k]; if (!arr || !arr.length) return null;
    return arr.map(function (c) { return COLORS[c] ? c : null; }).filter(Boolean);
  }

  // ---- 花特质系统：每种花的真实需求 / 习性（中等强度：会卡成长，严重会枯萎，但可救） ----
  // need 标签：water(喜水/怕旱)  drought(耐旱/怕涝)  sun(喜阳/怕阴)  shade(喜阴/怕晒)  dry(耐旱)
  var NEEDS = {
    lotus: ['water'], nightLotus: ['water'],           // 水生植物喜水
    cactus: ['drought'], bamboo: ['drought'],           // 多肉/竹耐旱
    sunflower: ['sun'], goldSun: ['sun'], rose: ['sun'], flameRose: ['sun'], blueRose: ['sun'],
    lavender: ['shade'], lily: ['shade'], lily2: ['shade'], orchid: ['shade'], iris: ['shade'],
    moonFlower: ['shade'],                              // 喜阴
    phoenix: ['sun']
  };
  var NEED_META = {
    water:   { label: '喜水缺水', act: '浇水', hint: '需要多浇水', icon: '💧', color: 'a' },
    drought: { label: '怕水过多', act: '停水', hint: '不需要浇太多水', icon: '☂️', color: 'b' },
    sun:     { label: '怕阴雨', act: '等太阳', hint: '喜欢阳光', icon: '🌞', color: 'c' },
    shade:   { label: '怕晒伤', act: '遮阴', hint: '怕强光直晒', icon: '🌥️', color: 'd' }
  };
  function needsOf(k) { var a = NEEDS[k]; return Array.isArray(a) ? a : []; }

  function wx() { var d = new Date(); return W[(d.getDate() + d.getMonth()) % W.length]; }
  function sea() { return S[Math.floor(new Date().getMonth() / 3) % 4]; }
  function seaIdx() { return Math.floor(new Date().getMonth() / 3) % 4; }

  function stageInfo(plot) {
    if (!plot) return null;
    var tp = T[plot.type]; if (!tp) return null;
    var now = Math.floor(Date.now() / 1000);
    var elapsed = now - plot.planted;
    var seaBoost = (tp.ss === seaIdx()) ? 1.3 : 0.85;
    var w = wx(); var wBoost = (w.t === '晴朗') ? 1.1 : (w.t === '小雨') ? 0.9 : 1.0;
    var boost = seaBoost * wBoost;
    var eff = Math.floor(elapsed * boost);
    var stage = 0;
    for (var i = 0; i < tp.g.length; i++) { if (eff >= tp.g[i]) stage = i + 1; else break; }
    var stageMax = tp.g.length;
    var bloomed = stage >= stageMax;
    var wilted = bloomed && plot.bloomedAt && (now - plot.bloomedAt > WILT_SEC);
    var progress = bloomed ? 1 : (eff - (stage > 0 ? sumg(tp, stage) : 0)) / (tp.g[stage] || 1);
    var nextSec = bloomed ? 0 : Math.ceil((sumg(tp, stage + 1) - eff) / boost);
    return { key: plot.type, name: tp.n, stage: stage, stageMax: stageMax, stageName: tp.sn[Math.min(stage, tp.sn.length - 1)], emoji: tp.e[Math.min(stage, tp.e.length - 1)], bloomed: bloomed, wilted: !!wilted, progress: progress, nextSec: nextSec };
  }
  function sumg(tp, n) { var r = 0; for (var i = 0; i < n; i++) r += (tp.g[i] || 0); return r; }
  function waterLvl(plot) { if (!plot || !plot.watered) return 0; return Math.max(0, 1 - (Math.floor(Date.now() / 1000) - plot.watered) / 86400); }

  // ---- 需求状态：花根据习性可能被"咔"住，严重会枯萎；照顾对就恢复 ----
  // 返回对象 {title, icon, level(1轻微|2严重), solution} 或 null
  function needState(plot) {
    if (!plot) return null;
    var needs = needsOf(plot.type);
    if (!needs.length) return null;
    var now = Math.floor(Date.now() / 1000);
    var hoursNoWater = plot.watered ? (now - plot.watered) / 3600 : (now - plot.planted) / 3600;
    var w = wx(); var isSunny = w.t === '晴朗'; var isRain = w.t === '小雨';
    var night = (new Date().getHours() >= 19 || new Date().getHours() < 6);
    function sev(t) { // 需求持续>时限 → level2，>枯限 → dried
      plot._needAt = plot._needAt || now;
      var h = (now - plot._needAt) / 3600;
      var lv = h > 20 ? 2 : 1;
      if (h > 40) plot.dried = true;
      return { level: lv, hours: h };
    }
    // 喜水（荷花等）：长期没浇 → 缺水
    if (needs.indexOf('water') >= 0) {
      if (hoursNoWater > 20) { var s = sev('water'); return { who: 'water', title: '缺水', icon: '💧', level: s.level, solution: '浇水', dried: plot.dried }; }
      plot._needAt = null;
    }
    // 耐旱（仙人掌等）：浇太频 → 水多
    if (needs.indexOf('drought') >= 0) {
      if (plot.watered && (now - plot.watered) < 6 * 3600) { // 6小时内浇过水 → 水太多
        plot._needAt = plot._needAt || now; var s2 = sev('drought');
        return { who: 'drought', title: '水太多', icon: '☂️', level: s2.level, solution: '停一停', dried: plot.dried };
      }
      plot._needAt = null;
    }
    // 喜阳（向日葵/月季）：阴雨 → 怕阴雨（长得慢）
    if (needs.indexOf('sun') >= 0) {
      if (isRain) {
        var hrs = plot._safeSince ? (now - plot._safeSince) / 3600 : 0;
        if (hrs > 10) { var s3 = sev('sun'); return { who: 'sun', title: '怕阴雨', icon: '🌧️', level: s3.level, solution: '等天晴', dried: plot.dried }; }
      }
      plot._needAt = null;
    }
    // 喜阴（兰花/百合等）：晴朗强光 → 怕晒伤
    if (needs.indexOf('shade') >= 0) {
      if (isSunny && !night) {
        var hrs2 = plot._sunSince ? (now - plot._sunSince) / 3600 : 0;
        if (hrs2 > 14) { var s4 = sev('shade'); return { who: 'shade', title: '怕晒伤', icon: '🌥️', level: s4.level, solution: '遮阴', dried: plot.dried }; }
      }
      plot._needAt = null;
    }
    return null;
  }
  // 记录环境开始时间，用于"持续条件"判断（阴雨/晴朗持续时间）
  function syncNeedenv(plot) {
    if (!plot) return;
    var now = Math.floor(Date.now() / 1000);
    var needs = needsOf(plot.type);
    if (!needs.length) return;
    var w = wx(); var isRain = w.t === '小雨'; var isSunny = w.t === '晴朗';
    if (needs.indexOf('sun') >= 0) { if (plot._safeSince == null) plot._safeSince = now; if (!isRain) plot._safeSince = now; }
    if (needs.indexOf('shade') >= 0) { if (plot._sunSince == null) plot._sunSince = now; if (!isSunny) plot._sunSince = now; }
  }

  function gLv() { return Math.floor(Math.sqrt((data.exp || 0) / 10)) + 1; }
  function gLvProg() { var lv = gLv(); var cur = (lv - 1) * (lv - 1) * 10; var nxt = lv * lv * 10; return { cur: data.exp - cur, max: nxt - cur, lv: lv }; }
  function unlocked(type) { var tp = T[type]; if (!tp) return false; if (tp.rare) return false; return gLv() >= (tp.lv || 1); }

  function markBloomed() {
    var changed = false; var now = Math.floor(Date.now() / 1000);
    data.p.forEach(function (plot) {
      if (!plot) return; var si = stageInfo(plot);
      if (si && si.bloomed && !plot.bloomedAt) { plot.bloomedAt = now; if (!data.dex[plot.type]) data.dex[plot.type] = { p: 0, h: 0 }; data.dex[plot.type].p++; data.st.p = (data.st.p || 0) + 1; changed = true; }
    });
    if (changed) save();
  }
  function updSt(act, me) { var k = act; if (me) data.st[k] = (data.st[k] || 0) + 1; else data.st['m' + k] = (data.st['m' + k] || 0) + 1; }
  function addLog(act, who) {
    data.l = data.l || []; data.l.push({ who: who || '我', act: act, tm: Math.floor(Date.now() / 1000) });
    if (data.l.length > 120) data.l = data.l.slice(-120);
    // TA 的操作记为"未读"：花园入口红点用
    if (who === 'TA') data.newCount = (data.newCount || 0) + 1;
    try { updatePillBadge(); } catch (e) {}
  }

  // ============ 渲染 ============
  function panelRoot() { return document.getElementById('cs-panel-garden'); }
  // 花园入口未读红点：TA 有操作时在 csp-garden pill 亮红点
  function updatePillBadge() {
    try {
      var pill = document.getElementById('csp-garden');
      if (!pill) return;
      var badge = pill.querySelector('.garden-pill-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'garden-pill-badge';
        pill.appendChild(badge);
      }
      badge.style.display = (data.newCount > 0) ? '' : 'none';
    } catch (e) {}
  }
  function renderAll() {
    markBloomed();
    var root = panelRoot(); if (!root) return;
    var pn = partnerName();
    var weather = wx(); var season = sea(); var lv = gLvProg(); var t = T;
    var header = '<div class="garden-hd">' +
      '<div class="garden-lv"><span class="garden-level">花园 Lv.' + lv.lv + '</span>' +
      '<span class="garden-exp">+' + lv.cur + '/' + lv.max + ' exp</span></div>' +
      '<div class="garden-wx"><span class="garden-wx-ico">' + weather.i + '</span><span>' + weather.t + ' · ' + season + '</span></div>' +
      '</div>';
    var grid = '<div class="garden-grid">';
    data.p.forEach(function (plot, i) {
      grid += plotHTML(plot, i);
    });
    grid += '</div>';
    var log = logHTML();
    var report = reportHTML();
    var dex = dexHTML();
    var stats = statsHTML();
    var pnName = '<span class="garden-pn">' + esc(pn) + '</span>';
    root.innerHTML =
      '<div class="garden-shell">' +
      '<div class="garden-topbar"><span class="garden-tb-title">🏡 花园</span><span class="garden-tb-sub">我们一起种花</span></div>' +
      header +
      '<div class="garden-actions">' +
      '<button class="garden-btn" id="gardenWaterAll">💧 全部浇水</button>' +
      '<button class="garden-btn" id="gardenLibrary">🗂️ 花库</button>' +
      '<button class="garden-btn" id="gardenGift">🎁 送花</button>' +
      '<button class="garden-btn" id="gardenOps">📜 操作记录</button>' +
      '<button class="garden-btn" id="gardenReport">📋 花园报告</button>' +
      '<button class="garden-btn" id="gardenStats">📊 照料统计</button>' +
      '</div>' +
      grid +
      '<div class="garden-log"><div class="garden-sec-t">花园日志</div>' + log + '</div>' +
      '<div class="garden-sec-t">图鉴收藏</div>' + dex +
      '</div>';

    // 隐藏的子面板（报告/统计/花库/送花/操作记录）
    ensurePanel(PANEL_IDS.report, '<div class="garden-subwrap" id="gardenReportWrap"></div>');
    ensurePanel(PANEL_IDS.stats, '<div class="garden-subwrap" id="gardenStatsWrap"></div>');
    ensurePanel(PANEL_IDS.library, '<div class="garden-subwrap" id="gardenLibraryWrap"></div>');
    ensurePanel(PANEL_IDS.gift, '<div class="garden-subwrap" id="gardenGiftWrap"></div>');
    ensurePanel(PANEL_IDS.ops, '<div class="garden-subwrap" id="gardenOpsWrap"></div>');
    bind();
  }

  function plotHTML(plot, i) {
    var si = stageInfo(plot); var wl = waterLvl(plot);
    syncNeedenv(plot);
    var need = needState(plot);
    var dried = !!(need && need.dried);
    var needCls = need ? (' need need-' + need.who + (need.level >= 2 ? ' need-sev' : '') + (dried ? ' need-dried' : '')) : '';
    var cls = 'garden-plot' + (si ? '' : ' empty') + (wl > 0 ? ' watered' : '') + (si && si.bloomed ? ' bloomed' : '') + ((si && si.wilted) || dried ? ' wilted' : '') + (plot && T[plot.type] && T[plot.type].rare ? ' rare' : '') + needCls;
    var inner = '';
    if (si) {
      var emoji = ((si.wilted) || dried) ? '🥀' : si.emoji;
      var colFilter = '';
      var col = plot && plot.col && COLORS[plot.col] ? plot.col : '';
      if (col && si.bloomed) colFilter = ' ' + COLORS[plot.col].filter;
      var colCls = (col && si.bloomed) ? ' tint' : '';
      inner += '<span class="garden-plant-emoji' + colCls + '" style="' + (colFilter ? ('filter:' + COLORS[plot.col].filter) : '') + '">' + emoji + '</span>';
      inner += '<span class="garden-plant-name">' + esc(si.name) + (col && si.bloomed ? ' <small class="garden-col-name">' + esc(COLORS[plot.col].n) + '</small>' : '') + '</span>';
      if ((si.wilted) || dried) inner += '<span class="garden-plant-stage wilted-stage">已枯萎</span>';
      else if (si.bloomed) inner += '<span class="garden-plant-stage">成熟</span>';
      else { inner += '<span class="garden-plant-stage">' + fmtShort(si.nextSec) + '</span>'; inner += '<div class="garden-grow-bar"><div class="garden-grow-fill" style="width:' + Math.round(si.progress * 100) + '%"></div></div>'; }
      if (wl > 0) inner += '<div class="garden-water-bar"><div class="garden-water-fill" style="width:' + Math.round(wl * 100) + '%"></div></div>';
      // 需求状态气泡（在右上角）
      if (need) {
        inner += '<span class="garden-need" title="' + esc(need.title + '：' + (need.level >= 2 ? '再不处理会枯萎' : '需要' + need.solution)) + '"><b>' + need.icon + '</b><em>' + esc(need.title) + '</em></span>';
      }
    } else {
      inner += '<span class="garden-plant-emoji">🌱</span><span class="garden-plot-empty-txt">空地</span>';
    }
    return '<div class="' + cls + '" data-idx="' + i + '">' + inner + '</div>';
  }

  function fmtShort(sec) {
    if (sec <= 0) return '';
    var d = Math.floor(sec / 86400); var h = Math.floor((sec % 86400) / 3600); var m = Math.floor(sec / 60);
    if (d > 0) return d + '天'; if (h > 0) return h + '时'; return (m > 0 ? m : 1) + '分';
  }

  function logHTML() {
    var entries = (data.l || []).slice(-12).reverse();
    if (!entries.length) return '<div class="garden-log-empty">还没有日志，开始打理花园吧</div>';
    return entries.map(function (e) { var d = new Date(e.tm * 1000); return '<div class="garden-log-item"><span class="garden-log-t">' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</span><b>' + esc(e.who) + '</b> ' + esc(e.act) + '</div>'; }).join('');
  }

  function reportHTML() {
    var dexCount = Object.keys(data.dex).length;
    var totalPlant = Object.keys(data.dex).filter(function (k) { return data.dex[k].p > 0; }).length;
    var today = new Date(); var t = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
    var dailyD = (data.daily && data.daily.day === t) ? data.daily : null;
    return '<div class="garden-report-card" id="gardenReportMeta">' +
      '<div class="garden-rep-line">已收集花种 <b>' + dexCount + '</b> 种 · 开过花 <b>' + totalPlant + '</b> 种</div>' +
      '<div class="garden-rep-line">累计种植 <b>' + (data.st.p || 0) + '</b> · 浇水 <b>' + (data.st.w || 0) + '</b> · 收获 <b>' + (data.st.h || 0) + '</b></div>' +
      (dailyD ? ('<div class="garden-rep-line">今日浇水 <b>' + dailyD.w + '</b> · 收获 <b>' + dailyD.h + '</b></div>') : '') +
      '</div>';
  }

  function statsHTML() {
    var st = data.st; var pn = partnerName();
    var myTotal = (st.p || 0) + (st.w || 0) + (st.h || 0);
    var tTotal = (st.mp || 0) + (st.mw || 0) + (st.mh || 0);
    return '<div class="garden-stats-card">' +
      '<div class="garden-stats-row"><span>我</span><div class="garden-stats-bar"><span style="width:' + barW(myTotal, myTotal + Math.max(1, tTotal)) + '"></span></div><b>' + myTotal + '</b></div>' +
      '<div class="garden-stats-row ta"><span>' + esc(pn) + '</span><div class="garden-stats-bar"><span style="width:' + barW(tTotal, myTotal + Math.max(1, tTotal)) + '"></span></div><b>' + tTotal + '</b></div>' +
      '</div>';
  }
  function barW(a, b) { return Math.min(100, Math.round(a / (b || 1) * 100)); }

  function dexHTML() {
    buildDexKeys();
    return '<div class="garden-dex">' + dexKeys.map(function (k, i) {
      var tp = T[k]; var got = data.dex[k] && data.dex[k].h > 0;
      var open = unlocked(k);
      return '<div class="garden-dex-cell' + (got ? ' got' : '') + '" data-dexidx="' + i + '" title="' + esc(tp.m || '') + '">' +
        '<span class="garden-dex-emoji">' + (got ? tp.e[tp.e.length - 1] : '❓') + '</span>' +
        '<span class="garden-dex-name">' + (got ? esc(tp.n) : (open ? esc(tp.n) : '???')) + '</span>' +
        (tp.rare ? '<span class="garden-dex-rare">稀</span>' : '') + '</div>';
    }).join('') + '</div>';
  }

  // ============ 交互 ============
  function bind() {
    var root = panelRoot(); if (!root) return;
    var el = root.querySelector('#gardenWaterAll');
    if (el) el.addEventListener('click', waterAll);
    var r = root.querySelector('#gardenReport');
    if (r) r.addEventListener('click', function () { openSubPanel('report'); });
    var stt = root.querySelector('#gardenStats');
    if (stt) stt.addEventListener('click', function () { openSubPanel('stats'); });
    var ops = root.querySelector('#gardenOps');
    if (ops) ops.addEventListener('click', function () { openSubPanel('ops'); });
    var lib = root.querySelector('#gardenLibrary');
    if (lib) lib.addEventListener('click', function () { openSubPanel('library'); });
    var gift = root.querySelector('#gardenGift');
    if (gift) gift.addEventListener('click', function () { openSubPanel('gift'); });
    var list = root.querySelector('.garden-grid');
    if (list) list.addEventListener('click', function (e) {
      var cell = e.target.closest ? e.target.closest('.garden-plot') : null;
      if (!cell) return;
      var idx = parseInt(cell.getAttribute('data-idx'), 10);
      plotAction(idx);
    });
    // dex 点击——种植
    var dex = root.querySelector('.garden-dex');
    if (dex) dex.addEventListener('click', function (e) {
      var cell = e.target.closest ? e.target.closest('.garden-dex-cell') : null;
      if (!cell) return;
      var idx = cell.getAttribute('data-dexidx'); if (idx == null) return;
      var k = dexKeys[idx]; if (!k) return;
      tryPlant(k);
    });
  }

  var dexKeys = [];
  function buildDexKeys() { dexKeys = Object.keys(T); }

  var recolorMode = false; // 换色已移除：颜色在种花时选定，种后不可改

  function waterAll() {
    var now = Math.floor(Date.now() / 1000); var n = 0;
    data.p.forEach(function (p) { if (p) { p.watered = now; n++; } });
    if (n) { updSt('w', true); addLog('给花园浇了水', '我'); save(); renderAll(); toastMini('已浇水 ' + n + ' 株'); }
    else toastMini('还没有种植的植物');
  }

  function waterPlot(i) {
    var plot = data.p[i]; if (!plot) return;
    var now = Math.floor(Date.now() / 1000);
    if (plot.watered && (now - plot.watered) < 3600) { toastMini('刚浇过水啦'); return; }
    plot.watered = now;
    plot.lastWateredH = 0; // 记录本次浇水时间（耐旱花据此判断水过多）
    var needs = needsOf(plot.type);
    if (needs.indexOf('drought') >= 0) plot.overCnt = (plot.overCnt || 0) + 1;
    updSt('w', true); addLog('给我的' + (T[plot.type] ? T[plot.type].n : '花') + '浇了水', '我');
    save(); renderAll();
  }

  function plotAction(idx) {
    var plot = data.p[idx];
    var items = [];
    var si = plot ? stageInfo(plot) : null;
    var need = plot ? needState(plot) : null;
    var title;
    if (!plot) {
      title = '这块空地';
      items.push({ key: 'plant', label: '种植', emoji: '🌱', sub: '选一颗种子种下' });
    } else {
      title = T[plot.type] ? T[plot.type].n : '这朵花';
      // 有"病症"需求时，优先解决照顾
      if (need && !need.dried) items.push({ key: 'solve', label: '处理：' + need.title, emoji: need.icon, sub: '需要' + need.solution });
      var wl = waterLvl(plot);
      if (!need) items.push({ key: 'water', label: '浇水', emoji: '💧', sub: wl > 0 ? '土壤还润' : '该浇水了' });
      if (si && si.bloomed && !si.wilted) items.push({ key: 'harvest', label: '收获', emoji: '✂️', sub: '成熟了，收进花库' });
      // 只有枯萎/凋谢的花才能铲除，活着的花不允许铲除
      if ((si && si.wilted) || (need && need.dried)) items.push({ key: 'clear', label: '铲除', emoji: '🧹', sub: '清理这块地重新种' });
    }
    openChoice(title, items, function (key) {
      if (key === 'plant') { plantDialog(idx); return; }
      if (key === 'solve' && need) { resolveNeed(idx, plot, need); return; }
      if (key === 'water') { waterPlot(idx); return; }
      if (key === 'harvest') { harvestPlot(idx, plot); return; }
      if (key === 'clear') { data.p[idx] = null; save(); renderAll(); toastMini('已清理这块地'); }
    });
  }

  // 解决需求：根据 need.who 处理
  function resolveNeed(idx, plot, need) {
    var now = Math.floor(Date.now() / 1000);
    function clearNeed() { delete plot._needAt; delete plot.dried; }
    if (need.who === 'water') {
      plot.watered = now; plot.lastWateredH = 0; plot.overCnt = 0; clearNeed();
      updSt('w', true); addLog('给口渴的' + (T[plot.type] ? T[plot.type].n : '花') + '浇了水', '我');
      save(); renderAll(); toastMini('浇了水，' + (T[plot.type] ? T[plot.type].n : '花') + '舒服多了');
      return;
    }
    if (need.who === 'drought') {
      plot.lastWateredH = 999999; plot.overCnt = 0; clearNeed(); // 停水一段时间
      addLog('给' + (T[plot.type] ? T[plot.type].n : '花') + '停水，让它喘口气', '我');
      save(); renderAll(); toastMini('已停水，等它恢复');
      return;
    }
    if (need.who === 'sun') {
      plot._safeSince = now; clearNeed();
      addLog(getpn() + '说：等天晴就好啦', '我');
      save(); renderAll(); toastMini('等天晴哦，阳光一到它就长啦');
      return;
    }
    if (need.who === 'shade') {
      plot._sunSince = now; clearNeed();
      addLog('给怕晒的' + (T[plot.type] ? T[plot.type].n : '花') + '遮了阴', '我');
      save(); renderAll(); toastMini('帮你遮阴了');
      return;
    }
  }
  function getpn() { return partnerName(); }

  function harvestPlot(idx, plot) {
    var tp = T[plot.type]; var got = data.dex[plot.type] && data.dex[plot.type].h > 0;
    data.dex[plot.type] = data.dex[plot.type] || { p: 0, h: 0 };
    data.dex[plot.type].h++;
    data.exp = (data.exp || 0) + tp.xp;
    updSt('h', true); addLog('收获了' + tp.n + '（+' + tp.xp + ' exp）', '我');
    // 存入花库（带颜色，建档）
    data.hq = data.hq || [];
    data.hq.push({ type: plot.type, col: plot.col || '', tm: Date.now(), by: '我' });
    data.p[idx] = null;
    save(); renderAll();
    var msg = got ? ('收获 ' + tp.n + '，存进花库啦') : (tp.rare ? '✨ 稀有花「' + tp.n + '」收集到手，存入花库！' : '🌼 新的「' + tp.n + '」已入花库');
    toastMini(msg);
  }

  // 通用选择弹层（底部弹层：种子/地块操作/颜色都走这个，支持 emoji 着色）
  function openChoice(title, items, onPick) {
    var mask = document.createElement('div');
    mask.className = 'garden-choice-mask';
    var h = '<div class="garden-choice">' +
      '<div class="garden-choice-hd"><span class="garden-choice-title">' + esc(title) + '</span>' +
      '<button class="garden-choice-close" type="button">×</button></div>' +
      '<div class="garden-choice-list">';
    items.forEach(function (it) {
      var lock = it.locked ? ' locked' : '';
      var filter = it.showFilter ? ('filter:' + it.showFilter) : '';
      h += '<div class="garden-choice-item' + lock + '" data-key="' + esc(it.key) + '" data-color="' + esc(it.color || '') + '">' +
        '<span class="gci-emoji" style="' + filter + '">' + esc(it.emoji) + '</span>' +
        '<span class="gci-name">' + esc(it.label) + '</span>' +
        (it.sub ? '<span class="gci-sub">' + esc(it.sub) + '</span>' : '') +
        (it.rare ? '<span class="gci-rare">稀有</span>' : '') + '</div>';
    });
    h += '</div></div>';
    mask.innerHTML = h;
    document.body.appendChild(mask);
    var close = function () { mask.classList.remove('show'); setTimeout(function () { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 200); };
    mask.querySelector('.garden-choice-close').addEventListener('click', close);
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    mask.querySelectorAll('.garden-choice-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var key = el.getAttribute('data-key');
        var color = el.getAttribute('data-color') || '';
        if (!key) return;
        close();
        if (typeof onPick === 'function') onPick(key, color);
      });
    });
    requestAnimationFrame(function () { mask.classList.add('show'); });
  }

  function plantDialog(idx) {
    idx = (idx == null ? null : idx);
    var lv = gLv();
    // 把「每种花的每个颜色」展开成独立种子项，直接点对应颜色的种子种下
    var items = [];
    Object.keys(T).forEach(function (k) {
      var tp = T[k];
      var open = unlocked(k);
      var cols = typeColors(k); // 该花可选颜色
      var colorList = (cols && cols.length) ? cols : [''];
      colorList.forEach(function (c) {
        var emoji = tp.e[tp.e.length - 1];
        var label = tp.n;
        var sub = open ? ('Lv.' + tp.lv) : ('Lv.' + tp.lv + ' 解锁');
        if (open && c) sub = COLORS[c].n + ' · ' + label;
        // 锁定项：用空 key（选中无反应）+ 灰色
        items.push({
          key: open ? k : '',
          color: c || '',
          emoji: emoji,
          label: open ? label : label,
          sub: sub,
          locked: !open,
          rare: !!tp.rare,
          showFilter: (open && c) ? COLORS[c].filter : ''
        });
      });
    });
    openChoice('选择种子（花园 Lv.' + lv + '）', items, function (key, color) {
      var target = idx;
      if (target == null) { target = data.p.findIndex(function (p) { return !p; }); if (target < 0) { toastMini('没有空地了'); return; } }
      if (data.p[target]) { toastMini('这块地已经有花了'); return; }
      tryPlant(key, target, color);
    });
  }
  function tryPlant(k, idx, col) {
    var tp = T[k]; if (!tp) return; if (!unlocked(k)) { toastMini('等级不够'); return; }
    if (idx == null) { idx = data.p.findIndex(function (p) { return !p; }); if (idx < 0) { toastMini('没有空地了'); return; } }
    if (data.p[idx]) { toastMini('这块地已经有花了'); return; }
    var useCol = (col && COLORS[col]) ? col : pickColOf(k, col);
    data.p[idx] = { type: k, planted: Math.floor(Date.now() / 1000), col: useCol };
    if (!data.dex[k]) data.dex[k] = { p: 0, h: 0 }; data.dex[k].p++;
    updSt('p', true); addLog('种下了' + tp.n + (COLORS[useCol] ? '（' + COLORS[useCol].n + '色）' : ''), '我');
    save(); renderAll(); toastMini('种下' + tp.n + '，等它长大');
  }
  function randomColOf(k) { return pickColOf(k); }
  function pickColOf(k, col) {
    var cols = typeColors(k); if (!cols || !cols.length) return '';
    // 用户指定颜色：名称匹配（中/英）
    if (col) {
      var cn = strim(col);
      for (var i = 0; i < cols.length; i++) {
        if (cols[i] === cn.toLowerCase() || COLORS[cols[i]].n === cn) return cols[i];
      }
    }
    return cols[Math.floor(Math.random() * cols.length)];
  }

  // ---- TA 随机来帮忙（浇/收）+ 消息 ----
  var HELP_MSGS = ['看花开了，也来帮个忙', '顺手帮你浇了浇水', '一起种的话，花开得更快吧'];
  function partnerHelp() {
    var pn = partnerName();
    var unlockedKeys = Object.keys(T).filter(function (k) { return unlocked(k); });
    var available = data.p.map(function (p, i) { return p ? -1 : i; }).filter(function (i) { return i >= 0; });
    var bloom = data.p.map(function (p, i) { return (p && stageInfo(p) && stageInfo(p).bloomed && !stageInfo(p).wilted) ? i : -1; }).filter(function (i) { return i >= 0; });
    var anyNeed = data.p.map(function (p, i) { return (p && needState(p)) ? i : -1; }).filter(function (i) { return i >= 0; });
    var taFlowers = (data.hq || []).filter(function (x) { return x.by === 'TA'; });
    var r = Math.random();

    // 优先级：照顾有需求的花 > 收获成熟 > 种花 > 浇水普通花 > 送花
    // 1) 有需求就先照顾（水多停水 / 其余浇水）
    if (anyNeed.length) {
      var n = anyNeed[Math.floor(Math.random() * anyNeed.length)];
      var ns = needState(data.p[n]);
      if (ns && ns.who === 'drought') {
        data.p[n]._needAt = null; delete data.p[n].dried;
        addLog('帮' + (T[data.p[n].type] ? T[data.p[n].type].n : '花') + '停了水', 'TA');
      } else {
        data.p[n].watered = Math.floor(Date.now() / 1000); data.p[n]._needAt = null; delete data.p[n].dried;
        updSt('w', false); addLog('帮忙浇水' + (T[data.p[n].type] ? T[data.p[n].type].n : '花'), 'TA');
      }
      save(); renderAll(); toastMini(pn + '帮忙照顾了花园');
      return;
    }
    // 2) 有成熟的花 → 收获
    if (bloom.length) {
      var h = bloom[Math.floor(Math.random() * bloom.length)];
      var hplot = data.p[h]; var tp = T[hplot.type];
      if (!data.dex[hplot.type]) data.dex[hplot.type] = { p: 0, h: 0 }; data.dex[hplot.type].h++;
      data.exp = (data.exp || 0) + Math.floor(tp.xp / 2); updSt('h', false);
      data.hq = data.hq || []; data.hq.push({ type: hplot.type, col: hplot.col || '', tm: Date.now(), by: 'TA' });
      addLog('收获了' + tp.n + '（存入花库）', 'TA');
      data.p[h] = null; save(); renderAll(); toastMini(pn + '从花园收获了一株' + tp.n);
      return;
    }
    // 3) 有空地 + 可种 → 种花（80%概率行动，小概率跳过给"我"留空间）
    if (available.length && unlockedKeys.length) {
      // 偶尔送花（有TA花时优先赠送互动）
      if (taFlowers.length && r < 0.35) {
        var g = taFlowers[Math.floor(Math.random() * taFlowers.length)];
        var gi = data.hq.indexOf(g);
        data.hq.splice(gi, 1);
        data.gifts = data.gifts || []; data.gifts.push({ dir: 'in', flowers: [flowerLabel(g)], tm: Date.now() });
        addLog('送了我一束花', 'TA'); save(); renderAll();
        var gMsg = '🌸 ' + pn + '送了你一支' + flowerLabel(g);
        try { if (typeof chatAddIn === 'function') chatAddIn(gMsg); else if (typeof sendMessage === 'function') sendMessage(gMsg); } catch (e) {}
        toastMini(pn + '送了你一支' + flowerLabel(g));
        return;
      }
      if (r < 0.8) {
        var k = unlockedKeys[Math.floor(Math.random() * unlockedKeys.length)];
        var idx = available[Math.floor(Math.random() * available.length)];
        var col = pickColOf(k);
        data.p[idx] = { type: k, planted: Math.floor(Date.now() / 1000), col: col, byT: true };
        if (!data.dex[k]) data.dex[k] = { p: 0, h: 0 }; data.dex[k].p++;
        updSt('p', false); addLog('种下了' + T[k].n, 'TA');
        save(); renderAll(); toastMini(pn + '在花园种了一株' + T[k].n);
        return;
      }
    }
    // 4) 有普通花没需求 → 顺手浇水
    var anyPlanted = data.p.map(function (p, i) { return p ? i : -1; }).filter(function (i) { return i >= 0; });
    if (anyPlanted.length) {
      var wp = anyPlanted[Math.floor(Math.random() * anyPlanted.length)];
      data.p[wp].watered = Math.floor(Date.now() / 1000);
      updSt('w', false); addLog('给花园浇了水', 'TA');
      save(); renderAll(); toastMini(pn + '帮忙浇了浇水');
      return;
    }
    // 5) 花园完全空且TA有花库 → 送花
    if (taFlowers.length) {
      var g2 = taFlowers[Math.floor(Math.random() * taFlowers.length)];
      var gi2 = data.hq.indexOf(g2);
      data.hq.splice(gi2, 1);
      data.gifts = data.gifts || []; data.gifts.push({ dir: 'in', flowers: [flowerLabel(g2)], tm: Date.now() });
      addLog('送了我一束花', 'TA'); save(); renderAll();
      toastMini(pn + '送了你一支' + flowerLabel(g2));
    }
  }

  // ---- 子面板 报告 / 统计 ----
  function ensurePanel(id, html) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div'); el.className = 'garden-subpanel'; el.id = id; el.style.display = 'none';
      el.innerHTML = html;
      (panelRoot() ? panelRoot().parentElement : document.body).appendChild(el);
    }
    return el;
  }
  var PANEL_IDS = { report: 'cs-panel-garden-report', stats: 'cs-panel-garden-stats', library: 'cs-panel-garden-library', gift: 'cs-panel-garden-gift', ops: 'cs-panel-garden-ops' };
  function openSubPanel(kind) {
    var id = PANEL_IDS[kind]; if (!id) return;
    var panel = document.getElementById(id);
    if (!panel) return;
    if (kind === 'report') panel.querySelector('#gardenReportWrap').innerHTML = reportDetailHTML();
    else if (kind === 'stats') panel.querySelector('#gardenStatsWrap').innerHTML = statsDetailHTML();
    else if (kind === 'library') { panel.querySelector('#gardenLibraryWrap').innerHTML = libraryHTML(); bindLibrary(panel); }
    else if (kind === 'gift') { panel.querySelector('#gardenGiftWrap').innerHTML = giftHTML(); bindGift(panel); }
    else if (kind === 'ops') panel.querySelector('#gardenOpsWrap').innerHTML = opsDetailHTML();
    panel.style.display = 'flex';
  }
  function bindLibrary(panel) {
    panel.querySelectorAll('.garden-hq-x').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(b.getAttribute('data-hqdel'), 10);
        if (isNaN(idx)) return;
        data.hq.splice(idx, 1); save();
        panel.querySelector('#gardenLibraryWrap').innerHTML = libraryHTML();
        bindLibrary(panel); toastMini('已移出花库');
      });
    });
  }
  function bindGift(panel) {
    panel.querySelectorAll('.garden-hq-item.gift').forEach(function (cell) {
      cell.addEventListener('click', function () {
        var idx = parseInt(cell.getAttribute('data-giftsel'), 10);
        if (isNaN(idx)) return;
        giftSel[idx] = !giftSel[idx];
        cell.classList.toggle('sel', giftSel[idx]);
      });
    });
    var mk = panel.querySelector('#gardenMakeGift');
    if (mk) mk.addEventListener('click', sendGift);
  }
  function closeSubPanel() {
    Object.keys(PANEL_IDS).forEach(function (k) { var s = document.getElementById(PANEL_IDS[k]); if (s) s.style.display = 'none'; });
  }
  function reportDetailHTML() {
    var st = data.st; var dex = data.dex; var pn = partnerName();
    var counted = Object.keys(dex).map(function (k) { return { k: k, d: dex[k], tp: T[k] }; }).filter(function (x) { return x.d && x.d.h > 0; });
    var gifts = data.gifts || [];
    var outCnt = gifts.filter(function (g) { return g.dir === 'out'; }).length;
    var inCnt = gifts.filter(function (g) { return g.dir === 'in'; }).length;
    var lastGifts = gifts.slice(-6).reverse();
    return '<div class="garden-sub-hd"><button class="garden-sub-back" onclick="window._gardenCloseSub()">← 返回</button><span>花园报告</span></div>' +
      '<div class="garden-sub-body">' +
      '<div class="garden-rep-line">花园等级 Lv.' + gLv() + ' · 经验 ' + (data.exp || 0) + '</div>' +
      '<div class="garden-rep-line">累计种植 ' + (st.p || 0) + ' 次 · 浇水 ' + (st.w || 0) + ' 次 · 收获 ' + (st.h || 0) + ' 次</div>' +
      '<div class="garden-rep-line">' + esc(pn) + '的照料：种花 ' + (st.mp || 0) + ' · 浇水 ' + (st.mw || 0) + ' · 收获 ' + (st.mh || 0) + '</div>' +
      '<div class="garden-sec-t">花束往来</div>' +
      '<div class="garden-rep-line">我送出的花束 <b>' + outCnt + '</b> 束 · 收到' + esc(pn) + '的花束 <b>' + inCnt + '</b> 束</div>' +
      (lastGifts.length ? lastGifts.map(function (g) {
        var who = g.dir === 'out' ? '我 → ' + pn : pn + ' → 我';
        return '<div class="garden-gift-log">' + (g.dir === 'in' ? '🌸' : '💐') + ' <b>' + esc(who) + '</b> ' + esc((g.flowers || []).join('、')) + ' <span class="garden-gift-t">' + fmtDT(g.tm) + '</span></div>';
      }).join('') : '<div class="garden-log-empty">还没有花束往来，去送一束花吧</div>') +
      '<div class="garden-sec-t">已收获图鉴</div>' +
      (counted.length ? counted.map(function (x) { return '<div class="garden-rep-line">· ' + esc(x.tp.n) + '（' + x.d.h + ' 株）' + (x.tp.rare ? ' <span class="garden-dex-rare">稀有</span>' : '') + '</div>'; }).join('') : '<div class="garden-log-empty">还没有收获记录</div>') +
      '</div>';
  }
  function statsDetailHTML() {    var st = data.st; var pn = partnerName();
    var rows = [['陪伴种花', 'p', 'mp'], ['浇水', 'w', 'mw'], ['收获', 'h', 'mh']];
    return '<div class="garden-sub-hd"><button class="garden-sub-back" onclick="window._gardenCloseSub()">← 返回</button><span>照料统计</span></div>' +
      '<div class="garden-sub-body">' +
      '<div class="garden-rep-line">我和' + esc(pn) + '一起打理的记录</div>' +
      rows.map(function (r) { return '<div class="garden-stat-row"><span>' + r[0] + '</span><b>' + (st[r[1]] || 0) + '</b><span>TA</span><b>' + (st[r[2]] || 0) + '</b></div>'; }).join('') +
      '</div>';
  }
  // 操作记录面板：我和 TA 的所有操作，带 年-月-日 时:分:秒 时间戳
  function opsDetailHTML() {
    var pn = partnerName();
    var entries = (data.l || []).slice().reverse();
    var h = ['<div class="garden-sub-hd"><button class="garden-sub-back" onclick="window._gardenCloseSub()">← 返回</button><span>我们的操作记录</span></div>',
      '<div class="garden-sub-body">'];
    if (!entries.length) h.push('<div class="garden-log-empty">还没有操作，从种下第一朵花开始吧</div>');
    else {
      entries.forEach(function (e) {
        var who = (e.who === 'TA') ? pn : (e.who || '我');
        // 空块：TA 的操作用 accent 色标记
        var cls = 'garden-ops-item' + (e.who === 'TA' ? ' ta' : ' me');
        h.push('<div class="' + cls + '"><span class="garden-ops-t">' + esc(fmtFull((e.tm || Date.now() / 1000) * 1000)) + '</span><b>' + esc(who) + '</b> ' + esc(e.act) + '</div>');
      });
    }
    h.push('</div>');
    return h.join('');
  }
  window._gardenCloseSub = closeSubPanel;

  // ============ 花库 / 送花 ============
  function flowerEmoji(type, col) {
    var tp = T[type]; if (!tp) return '🌸';
    var e = tp.e[tp.e.length - 1] || '🌸';
    var f = (col && COLORS[col]) ? COLORS[col].filter : '';
    return '<span class="garden-flower" style="' + (f ? 'filter:' + f : '') + '">' + e + '</span>';
  }
  function flowerLabel(it) {
    var tp = T[it.type]; var name = tp ? tp.n : it.type;
    var colTxt = (it.col && COLORS[it.col]) ? COLORS[it.col].n : '';
    return name + (colTxt ? '·' + colTxt : '');
  }
  function libraryHTML() {
    var hq = data.hq || [];
    var pn = partnerName();
    var mine = hq.filter(function (x) { return x.by !== 'TA'; });
    var fromTa = hq.filter(function (x) { return x.by === 'TA'; });
    var h = ['<div class="garden-sub-hd"><button class="garden-sub-back" onclick="window._gardenCloseSub()">← 返回</button><span>花库</span></div>',
      '<div class="garden-sub-body">'];
    h.push('<div class="garden-sec-t">我收获的花（' + mine.length + '）</div>');
    if (!mine.length) h.push('<div class="garden-log-empty">还没有收获的花，去种花收获吧</div>');
    else {
      h.push('<div class="garden-hq">');
      mine.forEach(function (it, i) {
        var firstOfType = hq.filter(function (x) { return x.type === it.type; })[0];
        var hqIdxs = hq.map(function (x, j) { return x.type === it.type && x.col === it.col ? j : -1; }).filter(function (j) { return j >= 0; });
        var idx = hqIdxs[0];
        h.push('<div class="garden-hq-item" data-hqidx="' + idx + '" title="' + esc(flowerLabel(it)) + '">' + flowerEmoji(it.type, it.col) + '<span>' + esc(flowerLabel(it)) + '</span><button class="garden-hq-x" data-hqdel="' + idx + '">×</button></div>');
      });
      h.push('</div>');
    }
    h.push('<div class="garden-sec-t">' + esc(pn) + '送我的花（' + fromTa.length + '）</div>');
    if (!fromTa.length) h.push('<div class="garden-log-empty">TA还没送过花，多送花给TA，也许TA会回礼</div>');
    else {
      h.push('<div class="garden-hq">');
      fromTa.forEach(function (it) { h.push('<div class="garden-hq-item ta" title="' + esc(flowerLabel(it)) + '">' + flowerEmoji(it.type, it.col) + '<span>' + esc(flowerLabel(it)) + '</span></div>'); });
      h.push('</div>');
    }
    h.push('</div>');
    return h.join('');
  }

  // ---- 选花（花束）：从 hq 挑，checkbox ----
  var giftSel = {}; // 花库 index -> true
  function giftHTML() {
    var hq = data.hq || [];
    var mine = hq.map(function (x, i) { return x.by !== 'TA' ? i : -1; }).filter(function (i) { return i >= 0; });
    var pn = partnerName();
    var h = ['<div class="garden-sub-hd"><button class="garden-sub-back" onclick="window._gardenCloseSub()">← 返回</button><span>送花给' + esc(pn) + '</span></div>',
      '<div class="garden-sub-body">'];
    if (!mine.length) { h.push('<div class="garden-log-empty">花库还没有花，先去种花收获吧</div></div>'); return h.join(''); }
    h.push('<div class="garden-tip">点选要做成花束的花（可多选），送给你家的' + esc(pn) + '</div>');
    h.push('<div class="garden-hq">');
    mine.forEach(function (idx) {
      var it = hq[idx];
      var sel = giftSel[idx] ? ' sel' : '';
      h.push('<div class="garden-hq-item gift' + sel + '" data-giftsel="' + idx + '">' + flowerEmoji(it.type, it.col) + '<span>' + esc(flowerLabel(it)) + '</span></div>');
    });
    h.push('</div>');
    h.push('<div class="garden-gift-make"><button class="garden-btn" id="gardenMakeGift" style="width:100%">💐 把选中的花做成花束送你</button></div>');
    h.push('</div>');
    return h.join('');
  }
  function buildGiftMsg() {
    var hq = data.hq || [];
    var sel = [];
    Object.keys(giftSel).forEach(function (k) { if (giftSel[k] && hq[k]) sel.push(hq[k]); });
    return sel;
  }
  function sendGift() {
    var sel = buildGiftMsg();
    if (!sel.length) { toastMini('先选几朵花做成花束吧'); return; }
    var total = sel.length;
    var flowers = sel.map(function (it) { return flowerLabel(it); });
    var bouquetMsg = '💐 送你一束花：' + flowers.join('、') + '（共' + total + '朵）';
    // 从花库移除这束花
    var keep = [];
    (data.hq || []).forEach(function (it, i) { if (!giftSel[i]) keep.push(it); });
    data.hq = keep;
    // 记录赠送
    data.gifts = data.gifts || [];
    data.gifts.push({ dir: 'out', flowers: flowers, tm: Date.now() });
    giftSel = {};
    save();
    // 发送到聊天
    try {
      if (typeof chatAddIn === 'function') { chatAddIn(bouquetMsg); }
      else if (typeof sendMessage === 'function') { sendMessage(bouquetMsg); }
      else if (typeof window.chatAddIn === 'function') { window.chatAddIn(bouquetMsg); }
      else { toastMini('聊天未就绪，但花束已送'); }
    } catch (e) { try { toastMini('花束已送'); } catch (e2) {} }
    addLog('送了一束花给' + partnerName() + '（' + total + '朵）', '我');
    // TA 可能回礼
    setTimeout(function () { partnerReplyGift(total); }, 2600);
    renderAll(); openSubPanel('library');
    toastMini('花束送出去了，等' + partnerName() + '回应…');
  }
  function partnerReplyGift(total) {
    if (Math.random() >= 0.7) return; // 70% 回礼
    var hq = data.hq;
    var tp = Object.keys(T)[Math.floor(Math.random() * Object.keys(T).length)];
    var col = typeColors(tp); col = (col && col.length) ? col[Math.floor(Math.random() * col.length)] : '';
    hq.push({ type: tp, col: col || '', tm: Date.now(), by: 'TA' });
    data.gifts = data.gifts || [];
    data.gifts.push({ dir: 'in', flowers: [flowerLabel({ type: tp, col: col })], tm: Date.now() });
    save(); renderAll();
    var reply = '🌸 回礼：收下你的花，送你一支' + flowerLabel({ type: tp, col: col });
    try {
      if (typeof chatAddIn === 'function') { chatAddIn(reply); }
      else if (typeof sendMessage === 'function') { sendMessage(reply); }
      else if (typeof window.chatAddIn === 'function') { window.chatAddIn(reply); }
    } catch (e) {}
    addLog('收到了' + partnerName() + '回礼的' + flowerLabel({ type: tp, col: col }), '我');
    toastMini(partnerName() + '回送你一支' + flowerLabel({ type: tp, col: col }) + '！存进花库了');
  }

  // ---- 初始化（csSwitchTab('garden') 调用） ----
  var inited = false;
  function init() {
    load();
    buildDexKeys();
    markBloomed();
    renderAll();
    taCatchUp(); // TA 时间驱动补账（离线越久，TA 越可能已行动；不依赖打开就触发）
    renderAll();
    // 用户已进入花园 → 清空 TA 操作未读红点
    data.newCount = 0;
    try { updatePillBadge(); } catch (e) {}
    inited = true;
  }
  // TA 行动时间驱动：一次行动 → 随机等待 2小时~12小时 再行动；离线期间自动补账
  var TA_MIN = 2 * 3600;           // 最短 2 小时
  var TA_MAX = 12 * 3600;          // 最长 12 小时
  function taNextDelay() { return TA_MIN + Math.random() * (TA_MAX - TA_MIN); } // 随机间隔（秒）
  function taCatchUp() {
    try {
      var now = Math.floor(Date.now() / 1000);
      if (!data.taNextAt) { data.taNextAt = now + taNextDelay(); save(); return; } // 首次，定下次时间
      if (now < data.taNextAt) return; // 还没到点，不动
      // 到点了：补账离线期间累积的行动（最多补 5 次，防暴刷）
      var acts = 0;
      while (data.taNextAt <= now && acts < 5) {
        partnerHelp();
        data.taNextAt = data.taNextAt + taNextDelay();
        acts++;
      }
      if (acts > 0) { if (data.taNextAt < now) data.taNextAt = now; save(); }
    } catch (e) {}
  }
  window._gardenInit = init;
  window.Garden = { init: init, reload: function () { data = null; load(); renderAll(); taCatchUp(); } };

  // 复用版：把 dex 数据生成可点击 index（buildDexKeys 已建，但 dexHTML 需要 data-dexidx）
})();
