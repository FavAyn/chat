/* ══════════════════════════════════════════════════════════════════
   音乐模块（音乐库 / 歌单 / 听歌记录 / 悬浮播放小窗）
   移植自 mochi（星言字卡）· 源码参考 mochi/src/js/music-player.js
   —— 适配 milk（传讯）：
      · 存储改用 milk 的 localStorage（window.APP_PREFIX + safeGetItem/safeSetItem）
      · 本地音频上传复用 milk 的 CloudMedia（云端存储，ross:// 引用）
      · 弹窗复用 milk 的 .modal / showModal / hideModal
      · 提示复用 milk 的 showNotification
      · 移除 mochi 的「梦角/TA 概率互动 + 多桌面合并」等 milk 没有的依赖
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PREFIX = (typeof window.APP_PREFIX === 'string') ? window.APP_PREFIX : 'CHAT_APP_V3_';

  // ---------- 数据 ----------
  var library = [];                 // [{id,name,artist,url,cover,duration,source,playlistId,neteaseId,addedAt}]
  var playlists = [];               // [{id,name,createdAt}]
  var history = [];                 // [{id,trackId,trackName,ts,type}] 简单听歌记录（我的）
  var settings = { floatEn: true, mode: 'list' };
  var DEF_PLAYLIST = 'spl_default';

  var currentId = null;             // 当前播放歌曲 id
  var mode = 'list';                // list / shuffle / single
  var isPlaying = false;
  var curTab = 'lib';               // lib / pl / his
  var curPlaylistId = null;         // 歌单详情：null=歌单列表
  var searchTerm = '';
  var sortBy = 'added';             // added / name
  var histSub = 'mine';             // mine / ta
  var audio = null;                 // 全局只用一个 <audio>
  var progressTimer = null;
  var floatEn = true;
  var floatMin = false;             // 悬浮窗是否收起成小圆钮
  var inited = false;
  var batchMode = false;            // 音乐库是否处于批量管理模式
  var batchSel = {};                // 批量勾选：{ id: true }
  var floatHiddenByUser = false;    // 用户手动点过"隐藏"，不再自动弹浮窗

  // 全局 DOM
  var $ = function (id) { return document.getElementById(id); };
  var page, floatBox, miniBtn;

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg, type) {
    try { if (typeof showNotification === 'function') showNotification(msg, type || 'info'); else alert(msg); }
    catch (e) { console.warn('[music] toast:', e); }
  }
  function fmtDur(sec) {
    if (isNaN(sec) || sec < 0) return '00:00';
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
  }
  function fmtTS(ts) {
    var d = new Date(ts), p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function inlineSvg(icon) {
    var m = {
      play: '<path d="M8 5.5v13l11-6.5z"/>',
      pause: '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>',
      note: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="currentColor">' + (m[icon] || m.note) + '</svg>';
  }
  function mIco(m) {
    if (m && m.cover) {
      return '<span class="sm-song-ico has-cov" style="background-image:url(\'' + esc(m.cover) + '\')"></span>';
    }
    return '<span class="sm-song-ico"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>';
  }
  function findTrack(id) { return library.find(function (m) { return m.id === id; }) || null; }
  function uid() { return 'sm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6); }

  // ---------- 存储（milk localStorage） ----------
  function storeGet(k) {
    try { var v = safeGetItem(PREFIX + k); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }
  function storeSet(k, v) {
    try { safeSetItem(PREFIX + k, v); } catch (e) { console.warn('[music] save fail:', e); }
  }
  function saveLibrary() { storeSet('music:library', library); }
  function savePlaylists() { storeSet('music:playlists', playlists); }
  function saveHistory() { storeSet('music:history', history); }
  function saveSettings() { storeSet('music:settings', settings); }
  function loadAll() {
    library = storeGet('music:library') || [];
    playlists = storeGet('music:playlists') || [];
    history = storeGet('music:history') || [];
    settings = Object.assign({ floatEn: true, mode: 'list' }, storeGet('music:settings') || {});
    mode = settings.mode || 'list'; floatEn = settings.floatEn !== false;
    // 修正 url 歌曲 source
    library.forEach(function (m) { if (!m.source) m.source = m.url ? 'url' : 'local'; if (!m.playlistId) m.playlistId = DEF_PLAYLIST; });
    // 默认歌单
    if (!playlists.some(function (p) { return p.id === DEF_PLAYLIST; })) {
      playlists.unshift({ id: DEF_PLAYLIST, name: '默认歌单', createdAt: Date.now() });
    }
  }

  // ---------- 迁移 old customSongs → 新音乐库（仅首次） ----------
  function migrateLegacy() {
    if (storeGet('music:defaultDone')) return;
    var done = function () {
      storeSet('music:defaultDone', 1);
      savePlaylists();
      saveLibrary();
      // 迁移完成后刷新界面（首启时 localforage 异步读取，先到先显示）
      if (page) { renderLibrary(); }
    };
    // 先试 localforage（旧播放器用 localforage 存 customSongs）
    var fromForage = null;
    if (typeof localforage !== 'undefined' && localforage.getItem) {
      localforage.getItem(PREFIX + 'customSongs').then(function (val) {
        fromForage = val;
        doMigrate(fromForage, done);
      }).catch(function () { doMigrate(null, done); });
    } else {
      doMigrate(null, done);
    }
    function doMigrate(val, cb) {
      var arr = [];
      try { if (Array.isArray(val)) arr = val; else if (typeof val === 'string') arr = JSON.parse(val); } catch (e) {}
      if (!arr.length && typeof safeGetItem === 'function') {
        try { var s = safeGetItem(PREFIX + 'customSongs'); if (s) arr = JSON.parse(s); } catch (e) {}
      }
      if (arr.length) {
        // 旧结构 {title,sub,url,isCustom}
        arr.forEach(function (o, i) {
          if (!o || !o.url) return;
          library.push({
            id: 'sm_leg_' + i + '_' + uid(),
            name: o.title || ('歌曲' + (i + 1)),
            artist: (o.sub && o.sub !== '----') ? o.sub : '未知歌手',
            url: o.url,
            cover: o.cover || '',
            duration: o.duration || 0,
            source: (window.CloudMedia && window.CloudMedia.isCloudRef && window.CloudMedia.isCloudRef(o.url)) ? 'local' : 'url',
            playlistId: DEF_PLAYLIST,
            neteaseId: o.neteaseId || '',
            addedAt: Date.now()
          });
        });
      }
      cb();
    }
  }

  // ---------- 网易云工具 ----------
  function neteaseMetingUrl(id) { return 'https://api.injahow.cn/meting/?type=url&id=' + encodeURIComponent(String(id)); }
  function fetchText(url, timeoutMs) {
    var controller = null;
    try { controller = new AbortController(); } catch (e) {}
    var timer = setTimeout(function () { try { controller && controller.abort(); } catch (e) {} }, timeoutMs || 8000);
    return fetch(url, controller ? { signal: controller.signal } : undefined)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) { clearTimeout(timer); return t; })
      .catch(function (e) { clearTimeout(timer); throw e; });
  }
  // 提取网易云歌曲 ID（纯数字 / song?id= / outer/url?id= / 分享文案混排）
  function neteaseIdOf(str) {
    if (!str || typeof str !== 'string') return '';
    var s = str.trim();
    if (/^\d+$/.test(s)) return s;
    var m = s.match(/[?&]id=(\d+)/); if (m) return m[1];
    m = s.match(/\/(?:song|playlist)\/(\d+)/i); if (m) return m[1];
    m = s.match(/\/(\d{5,})(?:\.mp3)?(?:\?|#|$)/); if (m) return m[1];
    return '';
  }
  // 网易云歌曲信息：meting type=song（name/artist/pic）
  function fetchNeteaseSongMeta(id, cb) {
    fetchText('https://api.injahow.cn/meting/?type=song&id=' + encodeURIComponent(id), 7000)
      .then(function (txt) {
        try {
          var j = JSON.parse(txt);
          var t = Array.isArray(j) ? j[0] : j;
          if (t && t.name) {
            var pic = String(t.pic || '').replace(/^http:\/\//i, 'https://');
            cb({ name: t.name, artist: t.artist || '', cover: pic });
            return;
          }
        } catch (e) {}
        cb(null);
      }).catch(function () { cb(null); });
  }
  // 网易云歌单导入：meting type=playlist + v6 详情（时长+会员标记）
  function fetchNeteasePlaylist(id, cb) {
    fetchText('https://api.injahow.cn/meting/?type=playlist&id=' + encodeURIComponent(id), 8000)
      .then(function (txt) {
        try {
          var j = JSON.parse(txt);
          if (Array.isArray(j) && j.length) {
            var tracks = j.map(function (t) {
              var mid = (t.url || '').match(/type=url&id=(\d+)/);
              return {
                neteaseId: mid ? mid[1] : '',
                name: t.name || '',
                artist: t.artist || '',
                cover: String(t.pic || '').replace(/^http:\/\//i, 'https://'),
                url: mid ? neteaseMetingUrl(mid[1]) : ''
              };
            }).filter(function (t) { return t.url; });
            cb({ tracks: tracks });
            // 后台补时长 + VIP 标记（v6 详情）
            fetchNeteaseV6(id, function (durMap, feeMap) {
              tracks.forEach(function (t) {
                var d = durMap[t.neteaseId]; if (d) t.duration = d;
                // fee 1=VIP 4=付费专辑 → 网页外链播不了
                t._vip = (feeMap[t.neteaseId] === 1 || feeMap[t.neteaseId] === 4);
              });
              reRenderAfterImport(tracks);
            });
            return;
          }
        } catch (e) {}
        cb(null);
      }).catch(function () { cb(null); });
  }
  // v6 歌单详情（经 CORS 代理拿每首时长 + fee）
  function fetchNeteaseV6(id, cb) {
    var apiUrl = 'https://music.163.com/api/v6/playlist/detail?id=' + encodeURIComponent(id) + '&n=1000&s=8';
    var out = {}, fees = {}, settled = false;
    var finish = function (durMap, feeMap) { if (settled) return; settled = true; cb(durMap || out, feeMap || fees); };
    var prox = [
      { p: 'https://proxy.cors.sh/', enc: false },
      { p: 'https://api.allorigins.win/raw?url=', enc: true }
    ];
    var running = 0;
    prox.forEach(function (pr) {
      running++;
      var controller = null; try { controller = new AbortController(); } catch (e) {}
      var timer = setTimeout(function () { try { controller && controller.abort(); } catch (e) {} }, 6000);
      fetch(pr.p + (pr.enc ? encodeURIComponent(apiUrl) : apiUrl), controller ? { signal: controller.signal } : undefined)
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (txt) {
          clearTimeout(timer);
          try {
            var j = JSON.parse(txt);
            var pl = j && j.playlist;
            if (pl && Array.isArray(pl.tracks) && pl.tracks.length) {
              pl.tracks.forEach(function (s) {
                if (!s || !s.id) return;
                if (s.dt) out[String(s.id)] = Math.round(s.dt / 1000);
                fees[String(s.id)] = s.fee;
              });
              finish();
            }
          } catch (e) {}
          if (--running === 0) finish();
        })
        .catch(function () { clearTimeout(timer); if (--running === 0) finish(); });
    });
    setTimeout(function () { finish(); }, 7000);
  }
  // 会员歌曲扫描（已删除外链播不了的 VIP）
  function scanVip(cb) {
    var candidates = library.filter(function (m) { return m && m.neteaseId && m.source === 'url'; });
    if (!candidates.length) { toast('音乐库里没有网易云链接歌曲', 'info'); cb(null); return; }
    var uniq = [];
    candidates.forEach(function (m) { if (uniq.indexOf(m.neteaseId) < 0) uniq.push(m.neteaseId); });
    toast('正在检测 ' + uniq.length + ' 首歌曲的会员状态…', 'info');
    deteachVipFees(uniq, function (fees) {
      if (!fees || !Object.keys(fees).length) { toast('检测失败：网易云查询服务暂不可用，请稍后重试', 'error'); cb(null); return; }
      var vip = candidates.filter(function (m) { return fees[m.neteaseId] === 1 || fees[m.neteaseId] === 4; });
      cb(vip);
    });
  }
  function deteachVipFees(ids, cb) {
    if (!ids.length) { cb({}); return; }
    var apiUrl = 'https://music.163.com/api/song/detail/?ids=' + encodeURIComponent('[' + ids.join(',') + ']');
    var out = {}, settled = false;
    var finish = function () { if (settled) return; settled = true; cb(out); };
    var prox = [
      { p: 'https://proxy.cors.sh/', enc: false },
      { p: 'https://api.allorigins.win/raw?url=', enc: true }
    ];
    var running = 0;
    prox.forEach(function (pr) {
      running++;
      var controller = null; try { controller = new AbortController(); } catch (e) {}
      var timer = setTimeout(function () { try { controller && controller.abort(); } catch (e) {} }, 6000);
      fetch(pr.p + (pr.enc ? encodeURIComponent(apiUrl) : apiUrl), controller ? { signal: controller.signal } : undefined)
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (txt) {
          clearTimeout(timer);
          try {
            var j = JSON.parse(txt);
            (j && j.songs || []).forEach(function (s) { if (s && s.id && typeof s.fee === 'number') out[String(s.id)] = s.fee; });
          } catch (e) {}
          if (--running === 0) finish();
        })
        .catch(function () { clearTimeout(timer); if (--running === 0) finish(); });
    });
    setTimeout(finish, 7000);
  }

  // ---------- 音频播放 ----------
  function initAudio() {
    if (audio) return audio;
    audio = new Audio();
    try { audio.style.display = 'none'; document.body.appendChild(audio); } catch (e) {}
    try { audio.referrerPolicy = 'no-referrer'; } catch (e) {}
    audio.addEventListener('timeupdate', function () {
      var d = audio.duration, c = audio.currentTime;
      setFill((d ? (c / d) * 100 : 0));
      setFloatTimes(c, d);
      setBarTimes(c, d);
      persistPos();
    });
    audio.addEventListener('ended', function () { persistPos(); next(true); });
    audio.addEventListener('play', function () { isPlaying = true; syncIcons(); persistPos(); });
    audio.addEventListener('pause', function () { isPlaying = false; syncIcons(); persistPos(); });
    audio.addEventListener('error', function () {
      if (!audio.currentSrc && currentId) {
        toast('播放失败：网络链接可能已失效，或该歌曲为VIP付费歌曲', 'error');
      }
    });
    return audio;
  }
  function setFill(pct) {
    var f = $('mf-fill'); if (f) f.style.width = pct + '%';
    var lf = $('bg-fill'); if (lf) lf.style.width = pct + '%';
  }
  function setFloatTimes(c, d) {
    var cur = $('mf-time-cur'); if (cur) cur.textContent = fmtDur(c);
    var dur = $('mf-time-dur'); if (dur) dur.textContent = fmtDur(d);
  }
  function setBarTimes(c, d) {
    var bc = $('music-page-time'); if (!bc) return;
    bc.textContent = fmtDur(c) + ' / ' + fmtDur(d);
  }
  // 记录 / 恢复上次播放的歌曲与进度（刷新后悬浮窗还在）
  var lastPosPersistTs = 0;
  function persistPos() {
    var now = Date.now();
    if (now - lastPosPersistTs < 2000) return;
    lastPosPersistTs = now;
    try { storeSet('music:lastPos', { id: currentId, t: audio ? (audio.currentTime || 0) : 0 }); } catch (e) {}
  }
  function resumeLast() {
    // 只静默恢复上次的歌与进度（暂停态），不在加载时自动弹出悬浮窗
    var lp = storeGet('music:lastPos');
    if (!lp || !lp.id) return;
    var m = findTrack(lp.id);
    if (!m) return;
    currentId = m.id;
    updatePlayerUI();
    var a = initAudio();
    resolvePlayUrl(m).then(function (url) {
      if (!url || currentId !== m.id) return;
      a.src = url; a.load();
      if (lp.t) {
        a.addEventListener('loadedmetadata', function () { try { a.currentTime = lp.t; setFill((a.duration ? (lp.t / a.duration) * 100 : 0)); } catch (e) {} }, { once: true });
      }
    }).catch(function () {});
  }
  function resolvePlayUrl(m) {
    // 本地上传（云端引用）→ 先解析成可播放 URL
    if (m.source === 'local' && window.CloudMedia && window.CloudMedia.isCloudRef && window.CloudMedia.isCloudRef(m.url)) {
      return window.CloudMedia.fetchUrl(m.url).then(function (blobUrl) { return blobUrl; }).catch(function () { return ''; });
    }
    return Promise.resolve(m.url);
  }
  function loadAndPlay(index, forcePlay) {
    if (!library.length) { toast('音乐库为空', 'warning'); return; }
    if (index < 0) index = library.length - 1;
    if (index >= library.length) index = 0;
    var m = findTrackByIdx(index);
    if (!m) return;
    currentId = m.id;
    floatHiddenByUser = false;
    var a = initAudio();
    updatePlayerUI();
    showFloat(); // 开始播放即唤出悬浮小窗
    var isCloud = (m.source === 'local' && window.CloudMedia && window.CloudMedia.isCloudRef && window.CloudMedia.isCloudRef(m.url));
    if (isCloud) {
      // 云端引用：需先解析成 blob URL（异步，无法保持用户手势，交给后台继续）
      resolvePlayUrl(m).then(function (url) {
        if (!url || currentId !== m.id) return;
        a.src = url; a.load();
        if (forcePlay || isPlaying) { var pp = a.play(); if (pp && pp.catch) pp.catch(function () {}); }
        skipToEnd(false);
      }).catch(function () { toast('云端音频加载失败', 'error'); });
    } else {
      // 直链：同步设置并播放，保留用户手势 → 单击即可播放
      if (m.url) a.src = m.url; else { toast('无法播放：请检查链接是否有效', 'error'); return; }
      a.load();
      if (forcePlay || isPlaying) {
        var p = a.play();
        if (p && p.catch) p.catch(function () { toast('播放失败，请检查网络或链接', 'error'); });
      }
      skipToEnd(false);
    }
  }
  // 供 renderLibrary 内部按数组下标找当前 index
  var libView = [];  // 当前过滤后的视图（由 renderLibrary 填充）
  function findTrackByIdx(i) { return libView[i] || null; }

  function togglePlay() {
    if (!currentId) { if (library.length) loadAndPlay(0, true); return; }
    var a = initAudio();
    if (isPlaying) { a.pause(); } else {
      var p = a.play();
      if (p && p.catch) p.catch(function () { toast('播放失败，请检查网络或链接', 'error'); });
    }
  }
  function next(byEnd) {
    if (!library.length) return;
    var idx = libView.findIndex(function (m) { return m.id === currentId; });
    // 单曲循环：仅自动播完(byEnd)时循环当前；手动点"下一曲"则切到列表下一首
    if (mode === 'single' && byEnd) { loadAndPlay(idx, true); return; }
    var target;
    if (mode === 'shuffle') target = Math.floor(Math.random() * libView.length);
    else target = (idx + 1) % libView.length;
    // 顺序末尾自动停（若为手动循环末尾则回开头）
    loadAndPlay(target, true);
  }
  function prev() {
    if (!library.length) return;
    var idx = libView.findIndex(function (m) { return m.id === currentId; });
    var target = (idx - 1 + libView.length) % libView.length;
    loadAndPlay(target, true);
  }
  function cycleMode() {
    if (mode === 'list') mode = 'single';
    else if (mode === 'single') mode = 'shuffle';
    else mode = 'list';
    settings.mode = mode; saveSettings();
    var labels = { list: '顺序播放', single: '单曲循环', shuffle: '随机播放' };
    toast(labels[mode], 'info', 1200);
    updateModeBtn();
  }
  function syncIcons() {
    // 悬浮窗
    var playIco = $('mf-play-ico'), pauseIco = $('mf-pause-ico');
    if (playIco) playIco.style.display = isPlaying ? 'none' : 'block';
    if (pauseIco) pauseIco.style.display = isPlaying ? 'block' : 'none';
    // 页面里如果有播放按钮
    var bplay = $('mf-big-play'); if (bplay) bplay.innerHTML = isPlaying ? inlineSvg('pause') : inlineSvg('play');
  }
  // 更新悬浮窗上的播放模式图标：顺序=循环图标，单曲=循环图标+数字1，随机=随机
  function updateModeBtn() {
    var ico = $('mf-mode-ico'), one = $('mf-mode-1');
    if (mode === 'shuffle') {
      if (ico) ico.className = 'fas fa-random';
      if (one) one.style.display = 'none';
    } else {
      if (ico) ico.className = 'fas fa-repeat';
      if (one) one.style.display = (mode === 'single') ? 'inline' : 'none';
    }
  }
  function skipToEnd(clear) {
    var a = initAudio();
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = setInterval(function () {
      if (audio && audio.duration) updatePlayerUI();
    }, 500);
  }

  // ---------- 悬浮播放小窗 ----------
  function buildFloat() {
    if ($('milk-music-float')) return;
    var f = document.createElement('div');
    f.id = 'milk-music-float';
    f.innerHTML =
      '<div class="mf-drag" id="mf-drag">' +
        '<span class="mf-title">正在播放</span>' +
        '<button class="mf-icon-btn" id="mf-hide" title="隐藏(仅播放)"><i class="fas fa-eye-slash"></i></button>' +
        '<button class="mf-icon-btn" id="mf-min" title="最小化"><i class="fas fa-minus"></i></button>' +
        '<button class="mf-icon-btn" id="mf-close" title="关闭"><i class="fas fa-times"></i></button>' +
      '</div>' +
      '<div class="mf-main">' +
        '<div class="mf-cover" id="mf-cover" title="打开音乐库">' + inlineSvg('note') + '</div>' +
        '<div class="mf-info">' +
          '<div class="mf-name" id="mf-name">—</div>' +
          '<div class="mf-artist" id="mf-artist">—</div>' +
        '</div>' +
        '<div class="mf-actions">' +
          '<button class="mf-btn" id="mf-mode" title="播放模式"><span class="mf-mode-wrap"><i class="fas fa-repeat" id="mf-mode-ico"></i><b class="mf-mode-1" id="mf-mode-1" style="display:none">1</b></span></button>' +
          '<button class="mf-btn" id="mf-list" title="歌曲列表"><i class="fas fa-list"></i></button>' +
          '<button class="mf-btn" id="mf-prev" title="上一首"><i class="fas fa-backward"></i></button>' +
          '<button class="mf-btn main" id="mf-play" title="播放/暂停">' +
            '<span id="mf-play-ico">' + inlineSvg('play') + '</span>' +
            '<span id="mf-pause-ico" style="display:none">' + inlineSvg('pause') + '</span>' +
          '</button>' +
          '<button class="mf-btn" id="mf-next" title="下一首"><i class="fas fa-forward"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="mf-progress">' +
        '<div class="mf-track" id="mf-track"><div class="mf-fill" id="mf-fill"></div></div>' +
        '<span class="mf-time" id="mf-time-cur">00:00</span>' +
        '<span class="mf-time" id="mf-time-dur">00:00</span>' +
      '</div>';
    document.body.appendChild(f);
    floatBox = f;

    // 歌曲列表弹窗
    var listP = document.createElement('div');
    listP.id = 'mfm-popup';
    listP.className = 'mf-popup';
    listP.innerHTML =
      '<div class="mf-popup-head"><span class="mfp-title">歌曲列表</span><button class="mfp-close" id="mfm-close"><i class="fas fa-times"></i></button></div>' +
      '<div class="mf-popup-list" id="mfm-list"></div>';
    document.body.appendChild(listP);

    var min = document.createElement('button');
    min.id = 'milk-music-mini';
    min.title = '音乐';
    min.innerHTML = '<i class="fas fa-music"></i>';
    document.body.appendChild(min);
    miniBtn = min;

    // 事件
    $('mf-play').onclick = togglePlay;
    $('mf-next').onclick = function () { next(false); };
    $('mf-prev').onclick = prev;
    $('mf-mode').onclick = cycleMode;
    $('mf-cover').onclick = function () { if (!_supClick) openPage(); };
    $('mf-list').onclick = function () { if (!_supClick) openFloatList(); };
    $('mf-min').onclick = function (e) { if (!_supClick) setFloatMin(true, e); };
    $('mf-hide').onclick = function () { if (!_supClick) hideOnlyFloat(); };
    $('mf-close').onclick = function () { if (!_supClick) stopAndHideFloat(); };
    $('mfm-close').onclick = function () { closeFloatList(); };
    $('mf-track').onclick = function (e) {
      var r = e.currentTarget.getBoundingClientRect();
      var x = e.clientX - r.left;
      var a = initAudio();
      if (a && a.duration) a.currentTime = (x / r.width) * a.duration;
    };
    // 整个大浮窗都能拖动（除交互件外）；拖动后的点击被忽略
    makeDraggable(f, f);
    // 收起的小球：可拖动，拖动结束不触发"点它展开"，仅轻点才展开
    makeDraggable(min, min);
    min.addEventListener('click', function () { if (!_supClick) setFloatMin(false); });
    updateModeBtn();
  }
  // 打开/关闭悬浮窗歌曲列表
  function openFloatList() {
    var list = $('mfm-list'); if (!list) return;
    var items = libView.length ? libView : library;
    libView = items;
    list.innerHTML = items.length
      ? items.map(function (m, i) {
          return '<div class="sm-song' + (m.id === currentId ? ' playing' : '') + '" data-i="' + i + '">' +
            mIco(m) +
            '<div class="sm-song-info"><div class="sm-song-name">' + esc(m.name) + '</div><div class="sm-song-sub">' + esc(m.artist) + '</div></div>' +
            '<span class="sm-song-dur">' + (m.duration ? fmtDur(m.duration) : '--:--') + '</span>' +
          '</div>';
        }).join('')
      : '<div style="text-align:center;padding:30px 10px;color:var(--text-secondary);font-size:12px">音乐库是空的</div>';
    list.querySelectorAll('.sm-song').forEach(function (row) {
      row.addEventListener('click', function () { loadAndPlay(Number(row.dataset.i), true); closeFloatList(); }); // 点歌后自动关闭列表
    });
    $('mfm-popup').classList.add('open');
  }
  function closeFloatList() { var p = $('mfm-popup'); if (p) p.classList.remove('open'); }
  // 通用可拖动（box=被拖元素，handle=按住的区域，cb(moved,event) 回调）
  function makeDraggable(box, handle, cb) {
    var isDrag = false, hasMoved = false, sx, sy, lx, ly;
    var start = function (e) {
      // 不拦按钮/进度/封面点击（这些交给各自处理）；只拦交互件本身即可
      if (e.target.closest('.mf-btn') || e.target.closest('.mf-icon-btn') || e.target.closest('.mf-track') || e.target.closest('.mf-cover')) return;
      e._dragMoved = false;
      var ev = (e.type === 'touchstart') ? e.touches[0] : e;
      isDrag = true; hasMoved = false; sx = ev.clientX; sy = ev.clientY;
      var r = box.getBoundingClientRect(); lx = r.left; ly = r.top;
      box.style.transition = 'none';
    };
    var move = function (e) {
      if (!isDrag) return;
      if (e.cancelable) e.preventDefault();
      var ev = (e.type === 'touchmove') ? e.touches[0] : e;
      var dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
      var nl = Math.max(0, Math.min(lx + dx, window.innerWidth - box.offsetWidth));
      var nt = Math.max(0, Math.min(ly + dy, window.innerHeight - box.offsetHeight));
      box.style.left = nl + 'px'; box.style.top = nt + 'px';
      box.style.right = 'auto'; box.style.bottom = 'auto';
    };
    var end = function (e) {
      if (!isDrag) return;
      isDrag = false; box.style.transition = '';
      if (hasMoved) { _supClick = true; setTimeout(function () { _supClick = false; }, 60); dragPos = { x: box.offsetLeft, y: box.offsetTop }; }
      if (cb) cb(hasMoved, e);
    };
    handle.addEventListener('mousedown', start);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', end);
    handle.addEventListener('touchstart', start, { passive: false });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
  }
  // 记录一次真实的拖动（拖动结束后的紧跟 click 会借此被忽略）
  var _supClick = false;
  var dragPos = null;   // 记住悬浮窗/小球最后位置 {x,y}，放大缩小时都停在这
  function applyDragPos(el) {
    if (!dragPos) return;
    placeAt(el, dragPos.x, dragPos.y);
  }
  // 把元素定位到屏幕 (x,y)，并限制在可视范围内
  function placeAt(el, x, y) {
    var w = el.offsetWidth || 44, h = el.offsetHeight || 44;
    el.style.left = Math.max(0, Math.min(x, window.innerWidth - w)) + 'px';
    el.style.top = Math.max(0, Math.min(y, window.innerHeight - h)) + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }
  // min=true 缩小成小球；min=false 放大成浮窗。anchor 可选：点击事件里的坐标
  function setFloatMin(min, anchor) {
    floatMin = min;
    if (min) {
      // 缩小：小球停在你点缩小(-)按钮的位置（以按钮中心为参照，球心对齐按钮中心）
      if (anchor && anchor.clientX != null) {
        dragPos = { x: anchor.clientX - 22, y: anchor.clientY - 22 };
      } else if (floatBox && floatBox.classList.contains('mf-open')) {
        var r = floatBox.getBoundingClientRect();
        dragPos = { x: r.left, y: r.top };
      }
      if (floatBox) { floatBox.classList.remove('mf-open'); }
      if (miniBtn) { miniBtn.classList.add('mm-open'); applyDragPos(miniBtn); }
    } else {
      // 放大：浮窗回到小球位置（跟视频通话同逻辑：从哪缩就回到哪）
      if (floatBox) { floatBox.classList.add('mf-open'); applyDragPos(floatBox); }
      if (miniBtn) { miniBtn.classList.remove('mm-open'); }
    }
  }
  function showFloat() {
    if (!floatEn || floatHiddenByUser) return;   // 用户点了隐藏就不自动弹，直到重新播放/进音乐页
    setFloatMin(false);
    if (!currentId && library.length) loadAndPlay(0, true);
  }
  function stopAndHideFloat() {
    if (audio) audio.pause();
    hideFloat();
    if (page) page.classList.remove('mp-open');
  }
  // 只隐藏悬浮窗（保留播放），供"进入陪伴页"等场景调用
  function hideFloat() {
    if (floatBox) floatBox.classList.remove('mf-open');
    if (miniBtn) miniBtn.classList.remove('mm-open');
  }
  // 用户点"隐藏"：只关掉悬浮窗，歌曲继续播；再次进入音乐页播放才会唤出
  function hideOnlyFloat() {
    floatHiddenByUser = true;
    hideFloat();
    showNotification('已隐藏悬浮窗，音乐继续播放中', 'info', 1800);
  }
  function updatePlayerUI() {
    var m = findTrack(currentId);
    if (!m) { setFloatEmpty(); return; }
    var name = $('mf-name'); if (name) name.textContent = m.name;
    var artist = $('mf-artist'); if (artist) artist.textContent = m.artist;
    var cov = $('mf-cover');
    if (cov) {
      if (m.cover) { cov.classList.add('has-cov'); cov.style.backgroundImage = 'url(' + m.cover + ')'; cov.innerHTML = ''; }
      else { cov.classList.remove('has-cov'); cov.style.backgroundImage = ''; cov.innerHTML = inlineSvg('note'); }
    }
    syncIcons();
  }
  function setFloatEmpty() { }

  // ---------- 音乐页 ----------
  function buildPage() {
    if ($('milk-music-page')) return;
    var p = document.createElement('div');
    p.id = 'milk-music-page';
    p.innerHTML =
      '<div class="music-page-bar">' +
        '<button class="mp-btn mp-back" id="mp-close" title="返回"><i class="fas fa-chevron-left"></i></button>' +
        '<span class="mp-title"><i class="fas fa-music"></i>音乐</span>' +
        '<div class="music-page-actions">' +
          '<button class="mp-btn" id="mp-listen" title="邀请 TA 一起听"><i class="fas fa-headphones"></i></button>' +
          '<button class="mp-btn" id="mp-manage" title="管理"><i class="fas fa-sliders-h"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="music-tabs">' +
        '<button class="music-tab sel" data-tab="lib">音乐库</button>' +
        '<button class="music-tab" data-tab="pl">歌单</button>' +
        '<button class="music-tab" data-tab="his">听歌记录</button>' +
      '</div>' +
      '<div class="music-body">' +
        '<div class="music-pane active" id="milk-pane-lib"></div>' +
        '<div class="music-pane" id="milk-pane-pl"></div>' +
        '<div class="music-pane" id="milk-pane-his"></div>' +
      '</div>';
    document.body.appendChild(p);
    page = p;

    p.querySelectorAll('.music-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        p.querySelectorAll('.music-tab').forEach(function (b) { b.classList.remove('sel'); });
        btn.classList.add('sel');
        switchTab(btn.dataset.tab);
      });
    });
    $('mp-close').onclick = function () { closePage(); };
    $('mp-manage').onclick = openManage;
    $('mp-listen').onclick = function () {
      if (window.listenFeature && typeof window.listenFeature.startInvite === 'function') window.listenFeature.startInvite();
      else toast('一起听功能未就绪', 'info');
    };
  }
  function switchTab(tab) {
    curTab = tab;
    var pane = { lib: 'milk-pane-lib', pl: 'milk-pane-pl', his: 'milk-pane-his' }[tab];
    ['milk-pane-lib', 'milk-pane-pl', 'milk-pane-his'].forEach(function (id) {
      $('' + id).classList.toggle('active', id === pane);
    });
    if (tab === 'lib') renderLibrary();
    else if (tab === 'pl') renderPlaylists();
    else renderHistory();
  }

  function renderLibrary() {
    var host = $('milk-pane-lib'); if (!host) return;
    var list = library.slice();
    if (searchTerm) {
      var q = searchTerm.toLowerCase();
      list = list.filter(function (m) { return (m.name || '').toLowerCase().indexOf(q) >= 0 || (m.artist || '').toLowerCase().indexOf(q) >= 0; });
    }
    if (sortBy === 'name') list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    else list.sort(function (a, b) { return b.addedAt - a.addedAt; });
    libView = list;

    var html =
      '<div class="music-list-head">' +
        '<div class="music-search-wrap"><i class="fas fa-search"></i><input type="text" id="music-search-input" placeholder="搜索歌曲 / 歌手" value="' + esc(searchTerm) + '"></div>' +
        '<button class="music-head-btn primary" id="music-add-btn"><i class="fas fa-plus"></i>添加</button>' +
        '<button class="music-head-btn" id="music-import-btn" title="导入网易云歌单"><i class="fas fa-file-import"></i>导入</button>' +
        '<button class="music-head-btn" id="music-batch-btn"><i class="fas fa-check-square"></i>' + (batchMode ? '退出批量' : '批量') + '</button>' +
      '</div>' +
      '<div class="music-sort-row">' +
        '<span id="music-count">共 ' + list.length + ' 首' + (batchMode ? ' · 已选 ' + Object.keys(batchSel).length + ' 首' : '') + '</span>' +
        '<span class="ms-link" id="music-sort-btn">按' + (sortBy === 'added' ? '最近添加' : '名称') + '排序</span>' +
      '</div>' +
      (batchMode
        ? '<div class="music-tip-line">批量模式：点歌曲勾选，底部可全选 / 删除 / 加入歌单</div>'
        : '<div class="music-tip-line">点击歌曲播放；点右上「更多」编辑 / 删除 / 加入歌单。带 <i class="fas fa-music" style="font-size:10px"></i> 表示网易云链接。</div>') +
      (list.length
        ? list.map(function (m, i) { return songRow(m, i); }).join('')
        : '<div class="music-empty"><i class="fas fa-music"></i>音乐库还没有歌曲，点击「添加」添加吧</div>') +
      (batchMode
        ? '<div class="music-batch-bar">' +
            '<button class="music-head-btn" id="mb-selectall"><i class="fas fa-check-double"></i>全选</button>' +
            '<button class="music-head-btn" id="mb-topl"><i class="fas fa-folder-open"></i>加入歌单</button>' +
            '<button class="music-head-btn" id="mb-del" style="color:#ff5050"><i class="fas fa-trash"></i>删除</button>' +
            '<button class="music-head-btn" id="mb-exit">退出</button>' +
          '</div>'
        : '');
    host.innerHTML = html;

    var si = $('music-search-input');
    if (si) si.addEventListener('input', function (e) { searchTerm = e.target.value.trim(); renderLibrary(); });
    var add = $('music-add-btn'); if (add) add.onclick = openAddSong;
    var imp = $('music-import-btn'); if (imp) imp.onclick = openNeteaseImport;
    var sort = $('music-sort-btn'); if (sort) sort.onclick = function () { sortBy = sortBy === 'added' ? 'name' : 'added'; renderLibrary(); };
    var bb = $('music-batch-btn'); if (bb) bb.onclick = toggleBatch;
    // 批量操作条
    var mbAll = $('mb-selectall'); if (mbAll) mbAll.onclick = function () { host.querySelectorAll('.sm-song').forEach(function (r) { batchSel[libView[Number(r.dataset.i)].id] = true; }); renderLibrary(); };
    var mbToPl = $('mb-topl'); if (mbToPl) mbToPl.onclick = batchAddToPlaylist;
    var mbDel = $('mb-del'); if (mbDel) mbDel.onclick = batchDelete;
    var mbExit = $('mb-exit'); if (mbExit) mbExit.onclick = toggleBatch;

    host.querySelectorAll('.sm-song').forEach(function (row) {
      var i = Number(row.dataset.i);
      var m = libView[i];
      if (batchMode) {
        row.addEventListener('click', function () { toggleRowSel(m.id); });
      } else {
        row.addEventListener('click', function () {
          loadAndPlay(i, true);
          highlightRow(row);   // 只切当前行的 `.playing` 高亮，不整表重建（单击即生效、不闪）
        });
        var more = row.querySelector('.sm-song-more');
        if (more) more.addEventListener('click', function (e) { e.stopPropagation(); openSongMenu(i); });
      }
    });
  }
  // 只更新"正在播放"高亮：挪走旧的 .playing，加在指定行（避免整表重建）
  function highlightRow(activeRow) {
    var host = $('milk-pane-lib');
    if (!host) return;
    host.querySelectorAll('.sm-song.playing').forEach(function (r) { r.classList.remove('playing'); });
    if (activeRow) activeRow.classList.add('playing');
  }
  function libView_updateActive(i) {}
  function toggleRowSel(id) {
    if (batchSel[id]) delete batchSel[id]; else batchSel[id] = true;
    renderLibrary();
  }
  function toggleBatch() { batchMode = !batchMode; batchSel = {}; renderLibrary(); }
  function batchDelete() {
    var ids = Object.keys(batchSel);
    if (!ids.length) { toast('请先勾选要删除的歌曲', 'warning'); return; }
    if (!confirm('确定删除选中的 ' + ids.length + ' 首歌曲吗？')) return;
    library = library.filter(function (x) { return !batchSel[x.id]; });
    if (batchSel[currentId]) { currentId = null; if (audio) audio.pause(); }
    batchSel = {}; batchMode = false;
    saveLibrary(); toast('已删除', 'success'); renderLibrary();
  }
  function batchAddToPlaylist() {
    var ids = Object.keys(batchSel);
    if (!ids.length) { toast('请先勾选歌曲', 'warning'); return; }
    var opts = playlists.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
    var body = '<div class="mpq-fld"><label>选择歌单</label><select class="tc-input" id="mb-pl-select">' + opts + '</select></div>' +
      '<div class="mpq-actions"><button class="modal-btn modal-btn-secondary id_mpq_cancel">取消</button><button class="modal-btn modal-btn-primary id_mpq_ok">加入</button></div>';
    openDialog('加入歌单', body, { noOk: true }, function (d) {
      d.querySelector('.id_mpq_cancel').onclick = function () { closeDialog(d); };
      d.querySelector('.id_mpq_ok').onclick = function () {
        var pid = d.querySelector('#mb-pl-select').value;
        library.forEach(function (x) { if (batchSel[x.id]) x.playlistId = pid; });
        saveLibrary(); toast('已加入歌单', 'success'); closeDialog(d);
        batchSel = {}; batchMode = false; renderLibrary();
      };
    });
  }
  function songRow(m, i) {
    var isCur = (m.id === currentId);
    var dur = m.duration ? fmtDur(m.duration) : '--:--';
    var sel = batchMode && batchSel[m.id];
    return '<div class="sm-song' + (isCur ? ' playing' : '') + (sel ? ' sel' : '') + '" data-i="' + i + '">' +
      (batchMode ? '<span class="sm-check' + (sel ? ' on' : '') + '"><i class="fas fa-check"></i></span>' : '') +
      mIco(m) +
      '<div class="sm-song-info">' +
        '<div class="sm-song-name">' + esc(m.name) + '</div>' +
        '<div class="sm-song-sub"' + (m.neteaseId ? ' style="color:var(--accent-color)"' : '') + '>' + esc(m.artist) + '</div>' +
      '</div>' +
      '<span class="sm-song-dur">' + dur + '</span>' +
      (batchMode ? '' : '<button class="sm-song-more" title="更多"><i class="fas fa-ellipsis-v"></i></button>') +
    '</div>';
  }

  function openSongMenu(i) {
    var m = libView[i] || findTrackByIdx(i); // may be undefined
    if (!m) return;
    var title = '<span style="font-weight:700;font-size:15px;word-break:break-word">' + esc(m.name) + '</span>';
    var body =
      '<div class="mpq-actions" style="flex-direction:column">' +
        '<button class="modal-btn modal-btn-primary menu-opt" data-act="play">播放</button>' +
        '<button class="modal-btn modal-btn-secondary menu-opt" data-act="pl">加入歌单</button>' +
        '<button class="modal-btn modal-btn-secondary menu-opt" data-act="edit">编辑</button>' +
        '<button class="modal-btn modal-btn-secondary menu-opt" data-act="del" style="color:#ff5050">删除</button>' +
        '<button class="modal-btn modal-btn-secondary menu-opt" data-act="cancel">取消</button>' +
      '</div>';
    openDialog(title, body, { noOk: true }, function (d) {
      d.querySelectorAll('.menu-opt').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var act = btn.dataset.act; closeDialog(d);
          if (act === 'play') { loadAndPlay(i, true); }
          else if (act === 'pl') openAddToPlaylist(m);
          else if (act === 'edit') openEditSong(m);
          else if (act === 'del') confirmDelete(m);
        });
      });
    });
  }
  function confirmDelete(m) {
    var sure = confirm('确定移除《' + m.name + '》吗？');
    if (!sure) return;
    library = library.filter(function (x) { return x.id !== m.id; });
    saveLibrary();
    if (currentId === m.id) { currentId = null; if (audio) audio.pause(); }
    toast('已删除', 'success');
    renderAll();
  }
  function openAddToPlaylist(m) {
    var opts = playlists.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
    var body = '<div class="mpq-fld"><label>选择歌单</label><select class="tc-input" id="mpq-pl-select">' + opts + '</select></div>' +
      '<div class="mpq-actions"><button class="modal-btn modal-btn-secondary mpq-cancel">取消</button><button class="modal-btn modal-btn-primary mpq-ok">加入</button></div>';
    openDialog('加入歌单', body, { noOk: true }, function (d) {
      d.querySelector('.mpq-cancel').onclick = function () { closeDialog(d); };
      d.querySelector('.mpq-ok').onclick = function () {
        var pid = d.querySelector('#mpq-pl-select').value;
        var t = findTrack(m.id); if (t) { t.playlistId = pid; saveLibrary(); }
        toast('已加入歌单', 'success'); closeDialog(d);
      };
    });
  }

  function openAddSong() {
    var body =
      '<div class="mpq-fld"><label>歌曲名称（选填，网易云链接可自动识别）</label><input id="mpq-title" placeholder="输入歌名"></div>' +
      '<div class="mpq-fld"><label>歌手 / 备注（选填）</label><input id="mpq-artist" placeholder="输入歌手"></div>' +
      '<div class="mpq-fld"><label>音频链接 或 网易云链接</label><input id="mpq-url" placeholder="mp3/m4a 链接，或粘网易云歌名链接/歌曲ID"></div>' +
      '<div class="mpq-hint">支持网易云链接自动识别歌名/歌手/时长；VIP 付费歌曲无法播放，可自动检测清理。</div>' +
      '<div class="music-local-divider"><span>或</span></div>' +
      '<div class="music-local-upload-row">' +
        '<label class="music-local-upload-btn" id="mpq-upload-label" for="mpq-file"><i class="fas fa-upload"></i> 从本地选择音频文件</label>' +
        '<input type="file" id="mpq-file" style="display:none">' +
      '</div>' +
      '<div class="mpq-filename" id="mpq-filename"></div>' +
      '<div class="mpq-hint" id="mpq-upload-hint">未配置云端存储，本地音频上传不可用</div>' +
      '<div class="mpq-actions"><button class="modal-btn modal-btn-secondary id_mpq_cancel">取消</button><button class="modal-btn modal-btn-primary id_mpq_ok">添加</button></div>';
    openDialog('添加歌曲', body, { noOk: true }, function (d) {
      var okBtn = d.querySelector('.id_mpq_ok'), cancelBtn = d.querySelector('.id_mpq_cancel');
      var title = d.querySelector('#mpq-title'), artist = d.querySelector('#mpq-artist');
      var url = d.querySelector('#mpq-url'), fileInput = d.querySelector('#mpq-file');
      var filenameEl = d.querySelector('#mpq-filename'), hintEl = d.querySelector('#mpq-upload-hint');
      var cloudOk = !!(window.CloudMedia && window.CloudMedia.upload) && !!window.CloudSync && typeof window.CloudSync.isConnected === 'function' && window.CloudSync.isConnected();
      if (cloudOk) { hintEl.textContent = '选择本地音频文件后会上传到云端存储'; }
      else { hintEl.classList.add('is-warn'); }
      var pendingFile = null;

      cancelBtn.onclick = function () { closeDialog(d); };
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        pendingFile = f;
        filenameEl.textContent = '已选择：' + f.name;
        url.value = ''; url.disabled = true;
        if (!title.value.trim()) title.value = f.name.replace(/\.[^.]+$/, '');
      });
      okBtn.onclick = async function () {
        var t = title.value.trim(), a = artist.value.trim(), u = url.value.trim();
        if (!t && !u && !pendingFile) { toast('请填写链接或选择文件', 'error'); return; }
        // 网易云链接识别
        var mid = neteaseIdOf(u);
        var finalUrl = u, finalTitle = t, finalArtist = a, finalCover = '', finalDur = 0;
        var isCloudRef = false;
        if (pendingFile) {
          if (!cloudOk) { toast('未配置云端存储，无法上传本地音频', 'error'); return; }
          try {
            okBtn.textContent = '上传中…'; okBtn.disabled = true;
            var r = await window.CloudMedia.upload(pendingFile, 'music');
            finalUrl = r && r.url; isCloudRef = true;
          } catch (err) {
            toast('上传失败：' + (err && err.message || err), 'error');
            okBtn.textContent = '添加'; okBtn.disabled = false; return;
          }
          okBtn.textContent = '添加'; okBtn.disabled = false;
          if (!finalTitle) finalTitle = pendingFile.name.replace(/\.[^.]+$/, '');
        } else if (mid) {
          // 网易云：用 meting 直链 + 名称/封面
          finalUrl = neteaseMetingUrl(mid);
          await new Promise(function (res) {
            fetchNeteaseSongMeta(mid, function (meta) { if (meta) { if (!finalTitle) finalTitle = meta.name; if (!finalArtist) finalArtist = meta.artist; finalCover = meta.cover; } res(); });
          });
        } else if (!finalUrl) {
          toast('请填写链接或选择文件', 'error'); return;
        }
        if (!finalTitle) finalTitle = (mid ? '网易云歌曲' : '未命名歌曲');
        if (!finalArtist) finalArtist = '未知歌手';
        library.unshift({
          id: uid(), name: finalTitle, artist: finalArtist,
          url: finalUrl, cover: finalCover, duration: finalDur,
          source: isCloudRef ? 'local' : 'url', playlistId: DEF_PLAYLIST,
          neteaseId: mid || '', addedAt: Date.now()
        });
        saveLibrary();
        toast('歌曲已添加', 'success');
        closeDialog(d);
        renderAll();
      };
    });
  }

  function openEditSong(m) {
    var body =
      '<div class="mpq-fld"><label>歌曲名称</label><input id="mpq-title" value="' + esc(m.name) + '"></div>' +
      '<div class="mpq-fld"><label>歌手 / 备注</label><input id="mpq-artist" value="' + esc(m.artist) + '"></div>' +
      '<div class="mpq-fld"><label>音频链接</label><input id="mpq-url" value="' + esc(m.url) + '"></div>' +
      '<div class="mpq-actions"><button class="modal-btn modal-btn-secondary id_mpq_cancel">取消</button><button class="modal-btn modal-btn-primary id_mpq_ok">保存</button></div>';
    openDialog('编辑歌曲', body, { noOk: true }, function (d) {
      d.querySelector('.id_mpq_cancel').onclick = function () { closeDialog(d); };
      d.querySelector('.id_mpq_ok').onclick = function () {
        findTrack(m.id); if (m) { m.name = d.querySelector('#mpq-title').value.trim() || m.name; m.artist = d.querySelector('#mpq-artist').value.trim() || m.artist; m.url = d.querySelector('#mpq-url').value.trim() || m.url; saveLibrary(); }
        toast('已保存', 'success'); closeDialog(d); renderAll();
      };
    });
  }

  function openNeteaseImport() {
    var body =
      '<div class="mpq-fld"><label>粘贴网易云歌单链接 / 歌单 ID</label><input id="mpq-nid" placeholder="例如 https://music.163.com/playlist?id=XXXX"></div>' +
      '<div class="mpq-hint">将自动跳过 VIP 会员/付费歌曲（网页外链无法播放）。</div>' +
      '<div class="mpq-actions"><button class="modal-btn modal-btn-secondary id_mpq_cancel">取消</button><button class="modal-btn modal-btn-primary id_mpq_ok">导入</button></div>';
    openDialog('导入网易云歌单', body, { noOk: true }, function (d) {
      d.querySelector('.id_mpq_cancel').onclick = function () { closeDialog(d); };
      d.querySelector('.id_mpq_ok').onclick = function () {
        var raw = d.querySelector('#mpq-nid').value.trim();
        var id = neteaseIdOf(raw);
        if (!id) { toast('无法识别歌单 ID', 'error'); return; }
        toast('正在导入歌单…', 'info');
        fetchNeteasePlaylist(id, function (res) {
          if (!res) { toast('导入失败，可能歌单不存在或网络受限', 'error'); closeDialog(d); return; }
          toast('歌单解析完成', 'success');
          closeDialog(d);
        });
      };
    });
  }
  function reRenderAfterImport(tracks) {
    var added = 0, vip = 0, skipped = 0;
    tracks.forEach(function (t) {
      if (t.neteaseId && library.some(function (m) { return m && m.neteaseId === t.neteaseId; })) { skipped++; return; }
      if (t._vip) { vip++; return; }
      library.push({
        id: uid(), name: t.name || ('网易云-' + t.neteaseId), artist: t.artist || '网易云音乐',
        url: t.url, cover: t.cover, duration: t.duration || 0,
        source: 'url', playlistId: DEF_PLAYLIST, neteaseId: t.neteaseId, addedAt: Date.now()
      });
      added++;
    });
    saveLibrary();
    toast('已导入 ' + added + ' 首' + (vip ? '，跳过 ' + vip + ' 首 VIP/付费' : '') + (skipped ? '，重复 ' + skipped + ' 首' : ''), 'success');
    renderAll();
  }

  function openManage() {
    var body =
      '<div class="mpq-actions" style="flex-direction:column">' +
        '<button class="modal-btn modal-btn-secondary manage-opt" data-act="export">导出歌单（JSON）</button>' +
        '<button class="modal-btn modal-btn-secondary manage-opt" data-act="import-json">导入歌单（JSON）</button>' +
        '<button class="modal-btn modal-btn-secondary manage-opt" data-act="vip">检测并清理会员歌曲</button>' +
        '<button class="modal-btn modal-btn-secondary manage-opt" data-act="cancel">关闭</button>' +
      '</div>';
    openDialog('音乐管理', body, { noOk: true }, function (d) {
      d.querySelectorAll('.manage-opt').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var act = btn.dataset.act; closeDialog(d);
          if (act === 'export') exportJson();
          else if (act === 'import-json') importJson();
          else if (act === 'vip') cleanVip();
        });
      });
    });
  }
  function exportJson() {
    if (!library.length) { toast('歌单为空，无法导出', 'warning'); return; }
    var dataStr = JSON.stringify(library, null, 2);
    if (typeof downloadFileFallback === 'function') {
      downloadFileFallback(new Blob([dataStr], { type: 'application/json' }), 'music-library-' + new Date().toISOString().slice(0, 10) + '.json');
      toast('导出成功', 'success');
    } else {
      var a = document.createElement('a'); a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr); a.download = 'music-library.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  }
  function importJson() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = '.json'; input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = function () {
      var f = input.files[0]; input.remove(); if (!f) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var arr = JSON.parse(ev.target.result);
          if (!Array.isArray(arr)) throw new Error('bad');
          arr.forEach(function (o) {
            if (!o || !o.url) return;
            library.push({
              id: uid(), name: o.name || o.title || '未命名', artist: o.artist || o.sub || '未知歌手',
              url: o.url, cover: o.cover || '', duration: o.duration || 0,
              source: 'url', playlistId: DEF_PLAYLIST, neteaseId: o.neteaseId || '', addedAt: Date.now()
            });
          });
          saveLibrary(); toast('导入 ' + arr.length + ' 首', 'success'); renderAll();
        } catch (e) { toast('导入失败：格式不正确', 'error'); }
      };
      reader.readAsText(f);
    };
    input.click();
  }
  function cleanVip() {
    scanVip(function (vip) {
      if (!vip) return;
      if (!vip.length) { toast('未发现会员/付费歌曲', 'success'); return; }
      var body = '<div class="mpq-hint" style="margin-bottom:10px">以下 ' + vip.length + ' 首为网易云会员/付费歌曲（网页外链无法播放），移除后可避免播放失败：</div>' +
        vip.map(function (m) { return mIco(m) + '<div style="display:inline-block;vertical-align:top;margin-left:8px">' + esc(m.name) + '<br><span style="font-size:11px;color:var(--text-secondary)">' + esc(m.artist) + '</span></div><br>'; }).join('') +
        '<div class="mpq-actions"><button class="modal-btn modal-btn-secondary id_vip_cancel">取消</button><button class="modal-btn modal-btn-primary id_vip_ok">移除 ' + vip.length + ' 首</button></div>';
      openDialog('清理会员歌曲', body, { noOk: true }, function (d) {
        d.querySelector('.id_vip_cancel').onclick = function () { closeDialog(d); };
        d.querySelector('.id_vip_ok').onclick = function () {
          var ids = vip.map(function (m) { return m.id; });
          library = library.filter(function (m) { return ids.indexOf(m.id) < 0; });
          if (ids.indexOf(currentId) >= 0) { currentId = null; if (audio) audio.pause(); }
          saveLibrary(); toast('已移除 ' + ids.length + ' 首', 'success'); closeDialog(d); renderAll();
        };
      });
    });
  }

  // ---------- 歌单 ----------
  function renderPlaylists() {
    var host = $('milk-pane-pl'); if (!host) return;
    if (curPlaylistId) { renderPlaylistDetail(); return; }
    var html =
      '<div class="music-pl-head">' +
        '<button class="music-head-btn primary" id="pl-new-btn"><i class="fas fa-plus"></i>新建歌单</button>' +
      '</div>' +
      playlists.map(function (p) {
        var cnt = library.filter(function (m) { return m.playlistId === p.id; }).length;
        return '<div class="music-pl-list-item" data-pl="' + p.id + '">' +
          '<div class="pl-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h9"/></svg></div>' +
          '<div class="pl-info"><div class="pl-name">' + esc(p.name) + '</div><div class="pl-sub">' + cnt + ' 首</div></div>' +
          '<button class="pl-more" data-plmore="' + p.id + '"><i class="fas fa-ellipsis-v"></i></button>' +
        '</div>';
      }).join('');
    host.innerHTML = html;
    var add = $('pl-new-btn'); if (add) add.onclick = newPlaylist;
    host.querySelectorAll('.music-pl-list-item').forEach(function (row) {
      var pid = row.dataset.pl;
      row.addEventListener('click', function (e) {
        if (e.target.closest('.pl-more')) return;
        curPlaylistId = pid; renderPlaylists();
      });
      row.querySelector('.pl-more').addEventListener('click', function (e) { e.stopPropagation(); playlistMenu(pid); });
    });
  }
  function newPlaylist() {
    var body = '<div class="mpq-fld"><label>歌单名称</label><input id="mpq-plname" placeholder="例如：我们的歌"></div>' +
      '<div class="mpq-actions"><button class="modal-btn modal-btn-secondary id_mpq_cancel">取消</button><button class="modal-btn modal-btn-primary id_mpq_ok">创建</button></div>';
    openDialog('新建歌单', body, { noOk: true }, function (d) {
      d.querySelector('.id_mpq_cancel').onclick = function () { closeDialog(d); };
      d.querySelector('.id_mpq_ok').onclick = function () {
        var n = d.querySelector('#mpq-plname').value.trim();
        if (!n) { toast('请输入歌单名称', 'error'); return; }
        playlists.push({ id: uid(), name: n, createdAt: Date.now() });
        savePlaylists(); toast('已创建', 'success'); closeDialog(d); renderPlaylists();
      };
    });
  }
  function playlistMenu(pid) {
    var p = playlists.find(function (x) { return x.id === pid; });
    if (!p) return;
    var body = '<div class="mpq-actions" style="flex-direction:column">' +
      '<button class="modal-btn modal-btn-secondary pmenu" data-act="rename">重命名</button>' +
      '<button class="modal-btn modal-btn-secondary pmenu" data-act="del" style="color:#ff5050">删除歌单</button>' +
      '<button class="modal-btn modal-btn-secondary pmenu" data-act="cancel">取消</button></div>';
    openDialog(esc(p.name), body, { noOk: true }, function (d) {
      d.querySelectorAll('.pmenu').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var act = btn.dataset.act; closeDialog(d);
          if (act === 'rename') renamePlaylist(pid);
          else if (act === 'del') { if (confirm('删除歌单《' + p.name + '》？（歌曲仍在音乐库，仅从歌单移除）')) { playlists = playlists.filter(function (x) { return x.id !== pid; }); savePlaylists(); toast('已删除', 'success'); renderPlaylists(); } }
        });
      });
    });
  }
  function renamePlaylist(pid) {
    var p = playlists.find(function (x) { return x.id === pid; });
    if (!p) return;
    var body = '<div class="mpq-fld"><label>歌单名称</label><input id="mpq-plname" value="' + esc(p.name) + '"></div>' +
      '<div class="mpq-actions"><button class="modal-btn modal-btn-secondary id_mpq_cancel">取消</button><button class="modal-btn modal-btn-primary id_mpq_ok">保存</button></div>';
    openDialog('重命名歌单', body, { noOk: true }, function (d) {
      d.querySelector('.id_mpq_cancel').onclick = function () { closeDialog(d); };
      d.querySelector('.id_mpq_ok').onclick = function () {
        var n = d.querySelector('#mpq-plname').value.trim(); if (n) { p.name = n; savePlaylists(); }
        toast('已保存', 'success'); closeDialog(d); renderPlaylists();
      };
    });
  }
  function renderPlaylistDetail() {
    var host = $('milk-pane-pl'); if (!host) return;
    var p = playlists.find(function (x) { return x.id === curPlaylistId; });
    if (!p) { curPlaylistId = null; renderPlaylists(); return; }
    var list = library.filter(function (m) { return m.playlistId === p.id; });
    var html =
      '<div class="music-pl-detail-head">' +
        '<button class="pl-back" id="pl-back-btn"><i class="fas fa-chevron-left"></i></button>' +
        '<div class="pl-title">' + esc(p.name) + '</div>' +
        '<button class="music-head-btn" id="pl-playall-btn">播放全部</button>' +
      '</div>' +
      (list.length ? list.map(function (m, i) {
        // 重建视图以便 play 使用当前歌单
        return '<div class="sm-song' + (m.id === currentId ? ' playing' : '') + '" data-m="' + m.id + '">' +
          mIco(m) +
          '<div class="sm-song-info"><div class="sm-song-name">' + esc(m.name) + '</div><div class="sm-song-sub">' + esc(m.artist) + '</div></div>' +
          '<span class="sm-song-dur">' + (m.duration ? fmtDur(m.duration) : '--:--') + '</span>' +
        '</div>';
      }).join('') : '<div class="music-empty"><i class="fas fa-folder-open"></i>这个歌单还没有歌曲</div>');
    host.innerHTML = html;
    var back = $('pl-back-btn'); if (back) back.onclick = function () { curPlaylistId = null; renderPlaylists(); };
    var pa = $('pl-playall-btn');
    if (pa) pa.onclick = function () { if (list.length) { libView = list; loadAndPlay(0, true); } else toast('歌单为空', 'warning'); };
    host.querySelectorAll('.sm-song').forEach(function (row) {
      row.addEventListener('click', function () {
        var m = findTrack(row.dataset.m);
        if (!m) return;
        var idx = list.findIndex(function (x) { return x.id === m.id; });
        libView = list; loadAndPlay(idx, true);
      });
    });
  }

  // ---------- 听歌记录 ----------
  // 听歌记录：只记录「一起听」——几月几日几点、听了多久、结束（不记录具体歌名）
  function renderHistory() {
    var host = $('milk-pane-his'); if (!host) return;
    var h = history.filter(function (x) { return x && x.type === 'together'; }).slice().reverse();
    host.innerHTML = (h.length
      ? h.map(function (x) {
          var s = new Date(x.start);
          var p = function (n) { return n < 10 ? '0' + n : '' + n; };
          var when = (s.getMonth() + 1) + '月' + s.getDate() + '日 ' + p(s.getHours()) + ':' + p(s.getMinutes());
          var min = Math.floor(x.dur / 60000), sec = Math.floor((x.dur % 60000) / 1000);
          var durTxt = (min > 0 ? min + '分' : '') + sec + '秒';
          return '<div class="sm-his">' +
            '<span class="sm-his-ico">' + inlineSvg('note') + '</span>' +
            '<div class="sm-his-info"><div class="sm-his-name">一起听</div>' +
            '<div class="sm-his-sub">' + when + ' · 听了 ' + durTxt + ' 结束</div></div>' +
          '</div>';
        }).join('')
      : '<div class="music-empty">还没有一起听记录，和对方一起听歌会记在这里</div>');
  }

  // ---------- 页面开合 ----------
  function openPage() {
    buildPage();
    page.classList.add('mp-open');
    switchTab(curTab);
    // 进入音乐页 = 唤醒悬浮窗（若之前被"隐藏"，这里取消隐藏标记并重新显示）
    if (currentId) {
      floatHiddenByUser = false;
      showFloat();
    }
  }
  function closePage() {
    if (page) page.classList.remove('mp-open');
  }
  function renderAll() {
    if (!page) return;
    if (curTab === 'lib') renderLibrary();
    else if (curTab === 'pl') renderPlaylists();
    else renderHistory();
    updatePlayerUI();
  }

  // ---------- milk 弹窗封装 ----------
  function openDialog(title, bodyHtml, opts, onMount) {
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.zIndex = '2600';
    modal.style.display = 'none';
    modal.innerHTML =
      '<div class="modal-content" style="max-height:78vh;overflow-y:auto;padding:22px 22px 18px;">' +
        '<div class="modal-title" style="margin-bottom:16px"><i class="fas fa-music"></i><span>' + title + '</span></div>' +
        bodyHtml +
      '</div>';
    document.body.appendChild(modal);
    if (typeof showModal === 'function') showModal(modal);
    if (onMount) onMount(modal);
    return modal;
  }
  function closeDialog(modal) {
    if (typeof hideModal === 'function') hideModal(modal);
    setTimeout(function () { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 350);
  }

  // ---------- 初始化 ----------
  function init() {
    if (inited) return Promise.resolve();
    inited = true;
    loadAll();
    migrateLegacy();
    buildFloat();
    buildPage();
    // 默认内容
    renderLibrary();
    // 顶部音乐按钮
    var hb = $('music-header-btn');
    if (hb) hb.addEventListener('click', openPage);
    // 设置里的旧开关 → 打开音乐页
    var toggle = $('music-player-toggle');
    if (toggle) toggle.addEventListener('click', function () { openPage(); });
    // 暴露 API
    window.MilkMusic = {
      open: openPage,
      close: closePage,
      openFloat: showFloat,
      hideFloat: function () { hideFloat(); },
      showFloat: function () { if (currentId) showFloat(); },
      play: function (id) { var i = library.findIndex(function (m) { return m.id === id; }); if (i >= 0) { libView = library.slice(); loadAndPlay(i, true); } },
      pause: function () { if (audio) audio.pause(); },
      toggle: togglePlay,
      next: function () { next(false); },
      prev: prev,
      current: function () { return findTrack(currentId); },
      list: function () { return library.slice(); },
      isPlaying: function () { return isPlaying; },
      partnerName: function () { return (typeof settings !== 'undefined' && settings.partnerName) || '对方'; },
      // 一起听记录（记录开始，结束时调用 stopTogether 写入）
      startTogether: function (name) { togetherStart = Date.now(); togetherName = name || '一起听'; },
      stopTogether: function () {
        if (!togetherStart) return;
        history.push({ id: uid(), type: 'together', name: togetherName, start: togetherStart, dur: Date.now() - togetherStart });
        if (history.length > 200) history = history.slice(-200);
        saveHistory();
        togetherStart = null; togetherName = null;
        if (page) renderHistory();
      }
    };
    // 记录听歌
    audio_go(initAudio());
    // 恢复上次播放（若有），悬浮窗跟随
    resumeLast();
    return Promise.resolve();
  }
  // 不再记录"我的听歌"（仅保留一起听记录）
  var togetherStart = null, togetherName = null;
  function audio_go(a) { /* 保留钩子，播放时不写个人听歌记录 */ }

  // 暴露到 window 供 app.js 启动调用
  window.initMusicPlayer = init;
  window.MilkMusic = window.MilkMusic || { open: function () {}, close: function () {} };

})();
