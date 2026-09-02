/* =====================================================================
 * 档案（single entry: TA的档案 + 我的档案）
 * —— 复刻 mochi「memo-arc (梦角档案) / my-arc (我的档案)」互为镜像的设计
 * 「TA的档案」记录：TA是谁、喜好、习惯、TA与我、共同记忆、当前IF世界
 * 「我的档案」记录：关于我、我的喜好、习惯、我与TA、我是什么样的、我的IF世界
 * 独立重构，不依赖 mochi 的 xyStore/roster/desk。
 * 存储：milk 的 getStorageKey('myarc') 强优先，回退全局 localStorage 'MYARC_PROFILE_V1'
 * 对 milk 的 API：window.MyArc.open('mine'|'partner') 打开档案容器
 * ===================================================================== */
(function () {
  'use strict';

  var KEY = 'MYARC_PROFILE_V1';
  var SID_KEY_PREFIX = 'ARC_SID_';

  function blank() {
    return {
      updated: 0,
      profiles: {
        partner: blankProfile(),
        mine: blankProfile()
      }
    };
  }
  function blankProfile() {
    return {
      name: '',
      who: {},
      tastes: { like: [], dislike: [], pref: [] },
      habits: { daily: [], micro: [], expr: [], comp: [] },
      relate: {},
      bonds: { list: [] },
      ifw: {}
    };
  }

  var state = { data: null, view: 'home', tab: 'partner' };
  var hostEl = null;
  var rootEl = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function s(v) { return String(v == null ? '' : v); }
  function strim(v) { return String(v == null ? '' : v).trim(); }
  // 梦角昵称：取 milk 的 settings.partnerName，未设置时回退 'TA'
  function pn() {
    var n = '';
    try { if (typeof settings !== 'undefined' && settings.partnerName) n = String(settings.partnerName); } catch (e) {}
    try { if (!n) { var el = document.getElementById('partner-name'); if (el) n = String(el.textContent); } } catch (e) {}
    return n || 'TA';
  }

  // ---- 持久层：优先 milk 的 getStorageKey（按梦角会话隔离），回退全局 ----
  function storeKey() {
    try { if (typeof getStorageKey === 'function') return getStorageKey('myarc'); } catch (e) {}
    try { return SID_KEY_PREFIX + (typeof SESSION_ID !== 'undefined' && SESSION_ID ? SESSION_ID : 'default'); } catch (e) {}
    return KEY;
  }
  function rawSave() {
    var v = JSON.stringify(state.data);
    var k = storeKey();
    try {
      if (typeof safeSetItem === 'function') safeSetItem(k, v);
      else localStorage.setItem(k, v);
    } catch (e) {}
    // 全局备份：写 KEY 供备份导出识别
    try { if (typeof safeSetItem === 'function') safeSetItem(KEY, v); else localStorage.setItem(KEY, v); } catch (e) {}
  }
  function rawLoad() {
    var k = storeKey();
    try {
      var raw = (typeof safeGetItem === 'function') ? safeGetItem(k) : localStorage.getItem(k);
      if (!raw) raw = (typeof safeGetItem === 'function') ? safeGetItem(KEY) : localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function load() {
    if (state.data) return state.data;
    var o = rawLoad();
    state.data = (o && typeof o === 'object' && o.profiles) ? o : blank();
    ensureShape();
    return state.data;
  }
  function ensureShape() {
    var d = state.data;
    if (!d.profiles || typeof d.profiles !== 'object') d.profiles = {};
    if (!d.profiles['partner']) d.profiles['partner'] = blankProfile();
    if (!d.profiles['mine']) d.profiles['mine'] = blankProfile();
    if (!d.profiles['mine'].tastes) d.profiles['mine'].tastes = blankProfile().tastes;
    if (!d.profiles['mine'].habits) d.profiles['mine'].habits = blankProfile().habits;
    if (!d.profiles['mine'].bonds) d.profiles['mine'].bonds = { list: [] };
  }
  function save() {
    state.data.updated = Date.now();
    rawSave();
  }
  function curProfile() {
    var d = load(); ensureShape();
    var key = state.tab;
    if (!d.profiles[key]) d.profiles[key] = blankProfile();
    return d.profiles[key];
  }

  /* ================= 字段文案 ================= */
  // partner = TA的档案；mine = 我的档案（互为镜像）
  var WHO = {
    partner: { title: 'TA是谁', sec: '记录TA是谁，以及我逐渐了解到TA什么' },
    mine: { title: '关于我', sec: '记录我是谁，以及我希望怎样被理解' }
  };
  var WHO_FIELDS = {
    partner: [
      ['nickname', '昵称', '例如：小梦、阿梦', 0],
      ['call', '称呼', '你们互相怎么叫对方？', 0],
      ['bday', '生日', '例如：3月14日（不确定也可以猜）', 0],
      ['age', '年龄', '例如：看起来十七八岁 / 永远十七岁', 0],
      ['identity', '身份', '例如：住在梦里的人', 0],
      ['nature', '性格', '例如：安静、慢热，其实很温柔', 0],
      ['looks', '外貌', '头发、眼睛、常穿的衣服……', 1],
      ['intro', '自我介绍', '如果TA要介绍自己，会怎么说？', 1],
      ['origin', '来自哪里', '例如：梦的另一边', 0],
      ['realm', '属于什么世界', '例如：梦境 / 现实的倒影', 0],
      ['relation', '与现实世界的关系', '例如：偶尔重叠，大多时候平行', 1]
    ],
    mine: [
      ['nickname', '名字', '你的名字或常用昵称', 0],
      ['call', '我希望TA怎么叫我', '例如：小满、笨蛋、或者连名带姓', 0],
      ['bday', '生日', '例如：5月20日', 0],
      ['identity', '身份 / 现在的样子', '例如：学生 / 上班族', 0],
      ['nature', '性格', '例如：慢热，熟了以后话很多', 0],
      ['looks', '外貌', '发型、眼镜、常穿的衣服……', 1],
      ['intro', '自我介绍', '如果向TA正式介绍自己，你会说什么？', 1],
      ['hope', '我希望被怎样理解', '例如：嘴硬心软——别只听我说的，看我做的', 1]
    ]
  };
  var RELATE = {
    partner: {
      title: 'TA与我', fields: [
        ['call', 'TA对我的称呼', '例如：名字、小笨蛋，或者只是「你」', 0],
        ['attitude', 'TA对我的态度', '例如：嘴上平淡，其实很纵容', 0],
        ['intimacy', '表达亲密的方式', '例如：不会抱，但会把头靠过来', 0],
        ['approach', '主动靠近我的方式', '例如：假装路过，然后停下来', 0],
        ['accompany', '陪伴我的方式', '例如：我不说话的时候，就安静待着', 0],
        ['comfort', '安慰我的方式', '例如：不讲道理，只说「有我在」', 0],
        ['loveway', '表达喜欢的方式', '例如：不说喜欢，但记得我说过的每件小事', 0]
      ]
    },
    mine: {
      title: '我与TA', fields: [
        ['accompany', '我希望TA陪我的方式', '例如：不用一直说话，在就行', 0],
        ['comfort', '我难过的时候，希望TA', '例如：别讲道理，先抱我', 0],
        ['space', '我需要独处的时候', '例如：我会说「没事」，其实想静一静', 0],
        ['quarrel', '我们闹别扭的时候', '例如：可以凶我，但要先低头', 0],
        ['taboo', '我不喜欢的相处方式', '例如：忽冷忽热、已读不回', 0],
        ['loveway', '能让我感到被爱的方式', '例如：记住我随口说过的小事', 0]
      ]
    }
  };
  var IFW = {
    partner: {
      title: '当前IF世界', fields: [
        ['world', '当前世界', '例如：海边小镇', 0],
        ['mine', '我的身份', '例如：花店老板', 0],
        ['role', 'TA的身份', '例如：咖啡店老板', 0],
        ['rel', '我们的关系', '例如：恋人 / 刚认识', 0]
      ]
    },
    mine: {
      title: '我的IF世界', fields: [
        ['world', '当前世界', '例如：海边小镇', 0],
        ['role', '我的身份', '例如：花店老板', 0],
        ['mine', 'TA的身份', '例如：咖啡店老板', 0],
        ['rel', '我们的关系', '例如：恋人 / 刚认识', 0]
      ]
    }
  };
  var TASTE_CATS = { like: '喜欢', dislike: '不喜欢', pref: '偏好' };
  var HABIT_CATS = { daily: '日常习惯', micro: '小动作', expr: '表达习惯', comp: '陪伴习惯' };
  var HABIT_PH = {
    daily: '例如：天黑以后才出现 / 喜欢待在窗边',
    micro: '例如：想事情的时候会沉默',
    expr: '例如：不说想你，会问「你梦见什么了」',
    comp: '例如：不说话，只是待在旁边'
  };
  var BOND_CATS = { first: '第一次', habit: '共同经历', secret: '只有我们知道的事', day: '特别日子', thing: '特别物品', place: '特别地点' };
  var BOND_PH = {
    first: '例如：第一次一起打游戏',
    habit: '例如：每晚互道晚安',
    secret: '例如：只有我们知道的暗号',
    day: '例如：在一起的第一百天',
    thing: '例如：那半块橡皮',
    place: '例如：常一起发呆的天台'
  };

  // 分区列表（按 tab 动态生成）
  function sectionsFor(tab) {
    if (tab === 'mine') {
      return [
        { id: 'who', icon: 'fa-circle-user', title: '关于我', sub: '名字 · 性格 · 外貌 · 介绍' },
        { id: 'tastes', icon: 'fa-heart', title: '我的喜好', sub: '喜欢 / 不喜欢 / 偏好' },
        { id: 'habits', icon: 'fa-feather', title: '我的习惯', sub: '日常 / 小动作 / 表达' },
        { id: 'relate', icon: 'fa-handshake', title: '我与TA', sub: '希望怎样被陪伴 / 被爱' },
        { id: 'bonds', icon: 'fa-hourglass-half', title: '我们的共同记忆', sub: '第一次 · 经历 · 暗号 · 特别日子' },
        { id: 'ifw', icon: 'fa-wand-magic-sparkles', title: '我的IF世界', sub: '世界 / 身份 / 关系' }
      ];
    }
    return [
      { id: 'who', icon: 'fa-circle-user', title: 'TA是谁', sub: '基本资料 · 世界设定 · 存在方式' },
      { id: 'tastes', icon: 'fa-heart', title: 'TA的喜好', sub: '喜欢 / 不喜欢 / 偏好' },
      { id: 'habits', icon: 'fa-feather', title: 'TA的习惯', sub: '日常 / 小动作 / 表达 / 陪伴' },
      { id: 'relate', icon: 'fa-handshake', title: 'TA与我', sub: '称呼 · 态度 · 亲密 · 相处方式' },
      { id: 'bonds', icon: 'fa-hourglass-half', title: '我们的共同记忆', sub: '第一次 · 经历 · 暗号 · 特别日子' },
      { id: 'ifw', icon: 'fa-wand-magic-sparkles', title: '当前IF世界', sub: '世界 / 身份 / 关系' }
    ];
  }

  function topBar(title) {
    return '<div class="myarc-top">' +
      '<button class="myarc-back" id="myarcBack"><i class="fas fa-arrow-left"></i></button>' +
      '<span class="myarc-title">' + esc(title) + '</span>' +
      '</div>';
  }

  function tabSwitchHTML() {
    return '<div class="myarc-tabs">' +
      '<button class="myarc-tab' + (state.tab === 'partner' ? ' on' : '') + '" data-tab="partner">TA的档案</button>' +
      '<button class="myarc-tab' + (state.tab === 'mine' ? ' on' : '') + '" data-tab="mine">我的档案</button>' +
      '</div>';
  }

  /* ========== 主页 ========== */
  function homeHTML() {
    var prof = curProfile();
    var isMine = state.tab === 'mine';
    var name = strim(prof.name) || strim(prof.who.nickname) || (isMine ? '我' : 'TA');
    var h = [];
    h.push(topBar(isMine ? '我的档案' : 'TA的档案'));
    h.push(tabSwitchHTML());
    h.push('<div class="myarc-hero">' +
      '<div class="myarc-hero-name">' + esc(name) + '</div>' +
      '<div class="myarc-hero-sub">' + esc(WHO[state.tab].sec) + '</div>' +
      '</div>');
    h.push('<div class="myarc-prog">' + progressHTML() + '</div>');
    h.push('<div class="myarc-grid">');
    sectionsFor(state.tab).forEach(function (sec) {
      h.push('<div class="myarc-cell" data-sec="' + sec.id + '">' +
        '<i class="fas ' + sec.icon + '"></i>' +
        '<div class="myarc-cell-title">' + esc(sec.title) + '</div>' +
        '<div class="myarc-cell-sub">' + esc(sec.sub) + '</div>' +
        '<span class="myarc-cell-dot' + (sectionDone(sec.id) ? ' on' : '') + '">' + (sectionDone(sec.id) ? '已记' : '待写') + '</span>' +
        '</div>');
    });
    h.push('</div>');
    return h.join('');
  }

  function progressHTML() {
    var prof = curProfile();
    var filled = 0, total = 0;
    function chk(v) { total++; if (strim(v)) filled++; }
    (WHO_FIELDS[state.tab] || []).forEach(function (f) { chk(prof.who[f[0]]); });
    ['like', 'dislike', 'pref'].forEach(function (k) { total++; if ((prof.tastes[k] || []).length) filled++; });
    ['daily', 'micro', 'expr', 'comp'].forEach(function (k) { total++; if ((prof.habits[k] || []).length) filled++; });
    (RELATE[state.tab].fields || []).forEach(function (f) { chk(prof.relate[f[0]]); });
    total++; if ((prof.bonds.list || []).length) filled++;
    (IFW[state.tab].fields || []).forEach(function (f) { chk(prof.ifw[f[0]]); });
    var pct = total ? Math.round(filled / total * 100) : 0;
    return '<div class="myarc-prog-label"><span>已记录 ' + filled + ' 项</span><span>' + pct + '%</span></div>' +
      '<div class="myarc-prog-bar"><span style="width:' + pct + '%"></span></div>';
  }

  function sectionDone(sec) {
    var prof = curProfile();
    if (sec === 'who') return (WHO_FIELDS[state.tab] || []).some(function (f) { return strim(prof.who[f[0]]); });
    if (sec === 'tastes') return ['like', 'dislike', 'pref'].some(function (k) { return (prof.tastes[k] || []).length; });
    if (sec === 'habits') return ['daily', 'micro', 'expr', 'comp'].some(function (k) { return (prof.habits[k] || []).length; });
    if (sec === 'relate') return (RELATE[state.tab].fields || []).some(function (f) { return strim(prof.relate[f[0]]); });
    if (sec === 'bonds') return (prof.bonds.list || []).length > 0;
    if (sec === 'ifw') return (IFW[state.tab].fields || []).some(function (f) { return strim(prof.ifw[f[0]]); });
    return false;
  }

  /* ========== 分区页 ========== */
  function fieldInputHTML(key, label, ph, multi, val) {
    return '<label class="myarc-field">' +
      '<span class="myarc-f-label">' + esc(label) + '</span>' +
      (multi
        ? '<textarea class="myarc-input myarc-ta" data-who="' + key + '" placeholder="' + esc(ph) + '">' + esc(val) + '</textarea>'
        : '<input class="myarc-input" data-who="' + key + '" placeholder="' + esc(ph) + '" value="' + esc(val) + '">') +
      '</label>';
  }
  function whoPageHTML() {
    var prof = curProfile(); var h = [topBar(WHO[state.tab].title), '<div class="myarc-scroll"><div class="myarc-sect-name">基本资料</div>'];
    (WHO_FIELDS[state.tab] || []).forEach(function (f) { h.push(fieldInputHTML(f[0], f[1], f[2], f[3], prof.who[f[0]])); });
    h.push('</div>');
    return h.join('');
  }
  function listPageHTML(kind) {
    var prof = curProfile();
    var h;
    var cats, title;
    if (kind === 'tastes') { cats = TASTE_CATS; title = state.tab === 'mine' ? '我的喜好' : 'TA的喜好'; }
    else if (kind === 'habits') { cats = HABIT_CATS; title = state.tab === 'mine' ? '我的习惯' : 'TA的习惯'; }
    else { cats = BOND_CATS; title = '我们的共同记忆'; }
    h = [topBar(title), '<div class="myarc-scroll">'];
    Object.keys(cats).forEach(function (k) {
      var items;
      if (kind === 'bonds') items = (prof.bonds.list || []).filter(function (it) { return it.cat === k; }).map(function (it) { return it.text; });
      else items = (prof[kind][k] || []);
      var phMap = (kind === 'habits') ? HABIT_PH : (kind === 'bonds' ? BOND_PH : cats);
      h.push('<div class="myarc-group">' +
        '<div class="myarc-g-head"><span>' + esc(cats[k]) + '</span>' +
        '<button class="myarc-add" data-addcat="' + k + '"><i class="fas fa-plus"></i></button></div>');
      if (!items.length) h.push('<div class="myarc-empty">' + esc(phMap[k] || '还没有记录') + '</div>');
      else {
        h.push('<div class="myarc-chips">');
        items.forEach(function (text, i) {
          h.push('<span class="myarc-chip">' + esc(text) + '<button class="myarc-chip-x" data-del="' + k + ':' + i + '">×</button></span>');
        });
        h.push('</div>');
      }
      h.push('</div>');
    });
    h.push('</div>');
    return h.join('');
  }
  function relatePageHTML() {
    var prof = curProfile(); var h = [topBar(RELATE[state.tab].title), '<div class="myarc-scroll">'];
    (RELATE[state.tab].fields || []).forEach(function (f) {
      h.push('<label class="myarc-field"><span class="myarc-f-label">' + esc(f[1]) + '</span>' +
        '<input class="myarc-input" data-relate="' + f[0] + '" placeholder="' + esc(f[2]) + '" value="' + esc(prof.relate[f[0]]) + '">' +
        '</label>');
    });
    h.push('</div>');
    return h.join('');
  }
  function ifwPageHTML() {
    var prof = curProfile(); var h = [topBar(IFW[state.tab].title), '<div class="myarc-scroll">'];
    (IFW[state.tab].fields || []).forEach(function (f) {
      h.push('<label class="myarc-field"><span class="myarc-f-label">' + esc(f[1]) + '</span>' +
        '<input class="myarc-input" data-ifw="' + f[0] + '" placeholder="' + esc(f[2]) + '" value="' + esc(prof.ifw[f[0]]) + '">' +
        '</label>');
    });
    h.push('</div>');
    return h.join('');
  }

  function pageHTML(view) {
    if (view === 'who') return whoPageHTML();
    if (view === 'tastes') return listPageHTML('tastes');
    if (view === 'habits') return listPageHTML('habits');
    if (view === 'relate') return relatePageHTML();
    if (view === 'bonds') return listPageHTML('bonds');
    if (view === 'ifw') return ifwPageHTML();
    return homeHTML();
  }

  /* ========== 容器 ========== */
  function ensureHost() {
    hostEl = document.getElementById('myarc-modal');
    if (!hostEl) {
      hostEl = document.createElement('div');
      hostEl.className = 'modal';
      hostEl.id = 'myarc-modal';
      hostEl.innerHTML = '<div class="modal-content myarc-content" id="myarcRoot"></div>';
      document.body.appendChild(hostEl);
    }
    rootEl = document.getElementById('myarcRoot');
    if (!state.data) load();
    return hostEl;
  }
  function render() {
    if (!rootEl) return;
    var html = pageHTML(state.view);
    // 把界面文案里的 "TA" 统一替换成梦角昵称（用户设置的角色名）
    var nm = pn();
    if (nm && nm !== 'TA') { try { html = html.replace(/TA/g, nm); } catch (e) {} }
    rootEl.innerHTML = html;
    bind();
  }

  var pickCat = null;
  function bind() {
    var root = rootEl; if (!root) return;
    root.addEventListener('click', function (e) {
      var t = e.target;
      var tab = t.closest ? t.closest('.myarc-tab') : null;
      if (tab) { state.tab = tab.getAttribute('data-tab'); state.view = 'home'; render(); return; }
      var cell = t.closest ? t.closest('.myarc-cell') : null;
      if (cell) { state.view = cell.getAttribute('data-sec'); render(); return; }
      var back = t.closest ? t.closest('#myarcBack') : null;
      if (back) {
        // 主页：点返回关闭档案弹窗；分区页：点返回回到主页
        if (state.view === 'home') { close(); return; }
        state.view = 'home'; syncProfileName(); render(); return;
      }
      var add = t.closest ? t.closest('.myarc-add') : null;
      if (add) { promptAdd(add.getAttribute('data-addcat')); return; }
      var x = t.closest ? t.closest('.myarc-chip-x') : null;
      if (x) { deleteChip(x.getAttribute('data-del')); return; }
    });
    root.querySelectorAll('.myarc-input').forEach(function (inp) {
      function commit() {
        var prof = curProfile();
        var wk = inp.getAttribute('data-who');
        var rk = inp.getAttribute('data-relate');
        var ik = inp.getAttribute('data-ifw');
        if (wk) prof.who[wk] = inp.value;
        else if (rk) prof.relate[rk] = inp.value;
        else if (ik) prof.ifw[ik] = inp.value;
        save();
      }
      inp.addEventListener('blur', commit);
      inp.addEventListener('change', commit);
    });
  }

  function promptAdd(cat) {
    pickCat = cat;
    var label = TASTE_CATS[cat] || HABIT_CATS[cat] || BOND_CATS[cat] || cat;
    var ph = '填写' + label + '记录…';
    var mask = document.createElement('div');
    mask.className = 'myarc-mask';
    mask.innerHTML = '<div class="myarc-inlay">' +
      '<div class="myarc-inlay-title">' + esc(label) + '</div>' +
      '<input class="myarc-input myarc-inlay-input" placeholder="' + esc(ph) + '">' +
      '<div class="myarc-inlay-btns">' +
      '<button class="myarc-inlay-btn myarc-inlay-cancel" type="button">取消</button>' +
      '<button class="myarc-inlay-btn myarc-inlay-ok" type="button">添加</button>' +
      '</div></div>';
    document.body.appendChild(mask);
    var inp = mask.querySelector('.myarc-inlay-input');
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 30);
    function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); pickCat = null; }
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    mask.querySelector('.myarc-inlay-cancel').addEventListener('click', close);
    mask.querySelector('.myarc-inlay-ok').addEventListener('click', function () {
      var v = strim(inp.value); if (!v) { try { inp.focus(); } catch (e) {}; return; }
      commitAdd(pickCat, v); close();
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); mask.querySelector('.myarc-inlay-ok').click(); } });
  }
  function commitAdd(kindCat, value) {
    var prof = curProfile();
    var kc = kindCat;
    if (kc in TASTE_CATS) { prof.tastes[kc] = prof.tastes[kc] || []; prof.tastes[kc].push(value); }
    else if (kc in HABIT_CATS) { prof.habits[kc] = prof.habits[kc] || []; prof.habits[kc].push(value); }
    else if (kc in BOND_CATS) { prof.bonds.list = prof.bonds.list || []; prof.bonds.list.push({ cat: kc, text: value }); }
    save(); render();
  }
  function deleteChip(ds) {
    var parts = ds.split(':'); var cat = parts[0]; var idx = parseInt(parts[1], 10);
    if (isNaN(idx)) return;
    var prof = curProfile();
    if (cat in TASTE_CATS) { (prof.tastes[cat] || []).splice(idx, 1); }
    else if (cat in HABIT_CATS) { (prof.habits[cat] || []).splice(idx, 1); }
    else if (cat in BOND_CATS) {
      var arr = (prof.bonds.list || []).filter(function (it) { return it.cat === cat; });
      var removed = arr[idx];
      if (removed) prof.bonds.list.splice(prof.bonds.list.indexOf(removed), 1);
    }
    save(); render();
  }
  function syncProfileName() {
    var prof = curProfile();
    var name = strim(prof.name) || strim(prof.who.nickname);
    if (name) { prof.name = name; save(); }
  }

  /* ========== 对外 ========== */
  function open(tab0, view0) {
    var host = ensureHost();
    load(); ensureShape();
    state.tab = (tab0 === 'mine') ? 'mine' : 'partner';
    state.view = (view0 && view0 !== 'home') ? view0 : 'home';
    syncProfileName();
    render();
    if (typeof showModal === 'function') showModal(host);
  }
  function close() { if (hostEl && typeof hideModal === 'function') hideModal(hostEl); }
  function saveKey() { return KEY; }

  window.MyArc = { open: open, close: close, load: load, save: save, saveKey: saveKey, _state: state };

  function bindEntry() {
    var btn = document.getElementById('myarc-function');
    if (btn && !btn.__arcBound) {
      btn.__arcBound = true;
      btn.addEventListener('click', function () {
        var adv = document.getElementById('advanced-modal');
        if (adv && typeof hideModal === 'function') { try { hideModal(adv); } catch (e) {} }
        open('partner');
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEntry);
  else bindEntry();
})();
