/* ══════════════════════════════════════════════════════════════════
   一起听（听歌邀请）—— 仿视频通话/陪伴邀请的交互：
     · 我可以邀请 TA 一起听（对方有概率拒绝）
     · TA 也能主动邀请我（我接听 / 拒绝，来电解可能错过）
   —— 依赖 js/music-player.js 暴露的 window.MilkMusic（play/pause/next/current/list 等）
   —— 聊天里的提示复用 milk 的 window._addCallEvent / showNotification
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // 复用一个<尾部最小>状态标记，避免跟 music-player 的状态冲突
  var active = false;            // 是否有一起听流程进行中（含连接阶段）
  var phase = 'idle';            // idle / out-connect / in-coming / together
  var timer = null;              // 单个流程定时器
  var togetherSong = null;       // 当前一起听的歌曲
  var incomingSong = null;       // TA 邀请我的那首歌

  // 概率（可按需改）
  var REJECT_PROB = 0.35;        // 我邀请时，TA 拒绝的概率
  var MISS_PROB   = 0.30;        // TA 邀请我时，错过/未接听的概率
  var ENABLED_KEY = 'musicListenEnabled';
  var enabled = true;            // TA 也能主动邀请（可关闭）

  function pname() { try { return window.MilkMusic && window.MilkMusic.partnerName ? window.MilkMusic.partnerName() : 'TA'; } catch (e) { return 'TA'; } }
  function myname() { return (typeof settings !== 'undefined' && settings.myName) || '我'; }
  function toast(msg, type) { try { if (typeof showNotification === 'function') showNotification(msg, type || 'info', 3000); } catch (e) {} }

  // 写进聊天时间线（复用通话/陪伴那套卡片）
  function chatEvent(icon, label, detail) {
    var done = function (icon2, label2, detail2) {
      if (typeof window._addCallEvent === 'function') window._addCallEvent(icon2 || icon, label2 || label, detail2 || detail || null);
    };
    if (typeof window._addCallEvent === 'function') { done(); return; }
    var tries = 0;
    var t = setInterval(function () { if (typeof window._addCallEvent === 'function') { clearInterval(t); done(); } if (++tries > 25) clearInterval(t); }, 200);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function getAvatar() {
    var img = document.querySelector('#partner-avatar img,[id*="partner-avatar"] img,.partner-avatar img');
    return img ? img.src : null;
  }

  function injectCSS() {
    if (document.getElementById('music-listen-style')) return;
    var el = document.createElement('style');
    el.id = 'music-listen-style';
    el.textContent = `
#ml-inviting-overlay,#ml-incoming-overlay{
    position:fixed;inset:0;z-index:99991;
    display:none;align-items:center;justify-content:center;
    background:rgba(0,0,0,.6);
    backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
}
#ml-inviting-overlay.show,#ml-incoming-overlay.show{display:flex;animation:mlFade .3s ease;}
.ml-card{
    width:284px;max-width:88vw;
    background:var(--secondary-bg);
    border:1px solid var(--surface-border);
    border-radius:28px;padding:34px 26px 28px;
    display:flex;flex-direction:column;align-items:center;gap:8px;
    box-shadow:0 28px 70px rgba(0,0,0,.4);
    position:relative;overflow:hidden;
    animation:mlPop .42s cubic-bezier(.22,1,.36,1);
}
.ml-card::before{
    content:'';position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(ellipse at 50% 0%,rgba(var(--accent-color-rgb,197,164,126),.26),transparent 62%);
}
.ml-av-wrap{position:relative;margin:6px 0 8px;}
.ml-av-ring,.ml-av-ring2{
    content:'';position:absolute;border-radius:50%;
    border:1.5px solid rgba(var(--accent-color-rgb,197,164,126),.35);
    animation:mlPulse 2.1s ease-in-out infinite;
}
.ml-av-ring{top:-12px;left:-12px;right:-12px;bottom:-12px;}
.ml-av-ring2{top:-22px;left:-22px;right:-22px;bottom:-22px;border-color:rgba(var(--accent-color-rgb,197,164,126),.18);animation-delay:.6s;}
.ml-avatar{
    position:relative;width:88px;height:88px;border-radius:50%;
    background:var(--accent-color,#c5a47e);
    border:2px solid rgba(var(--accent-color-rgb,197,164,126),.4);
    display:flex;align-items:center;justify-content:center;overflow:hidden;
    box-shadow:0 8px 28px rgba(var(--accent-color-rgb,197,164,126),.4);
}
.ml-avatar img{width:100%;height:100%;object-fit:cover;}
.ml-avatar i{font-size:34px;color:rgba(255,255,255,.86);}
.ml-name{font-size:20px;font-weight:800;color:var(--text-primary);}
.ml-sub{font-size:12.5px;color:var(--text-secondary);display:flex;align-items:center;gap:6px;}
.ml-dot{width:6px;height:6px;border-radius:50%;background:var(--accent-color);animation:mlBlink 1.1s step-end infinite;}
.ml-song{font-size:15px;font-weight:700;color:var(--accent-color);max-width:88%;text-align:center;word-break:break-word;}
.ml-actions{display:flex;gap:40px;margin-top:20px;}
.ml-inc-btn{display:flex;flex-direction:column;align-items:center;gap:7px;background:none;border:none;cursor:pointer;color:var(--text-secondary);}
.ml-inc-circle{width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:transform .18s;padding:15px;color:#fff;}
.ml-inc-btn:hover .ml-inc-circle{transform:scale(1.1);}
.ml-inc-btn:active .ml-inc-circle{transform:scale(.9);}
.ml-inc-reject .ml-inc-circle{background:linear-gradient(135deg,#ff5252,#c62828);box-shadow:0 6px 20px rgba(255,82,82,.45);}
.ml-inc-accept .ml-inc-circle{background:linear-gradient(135deg,#4caf50,#2e7d32);box-shadow:0 6px 20px rgba(76,175,80,.45);padding:17px;}
.ml-inc-lbl{font-size:12px;color:var(--text-secondary);font-weight:600;}
.ml-cancel{margin-top:18px;padding:9px 24px;border:1px solid var(--border-color);border-radius:22px;background:var(--primary-bg);color:var(--text-secondary);font-size:13px;cursor:pointer;}

/* 一起听中的小窗 */
#ml-together{
    position:fixed;z-index:99900;right:18px;bottom:110px;width:262px;
    background:rgba(var(--secondary-bg-rgb),.96);
    backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
    border:1px solid rgba(var(--accent-color-rgb,197,164,126),.22);
    border-radius:20px;box-shadow:0 14px 42px rgba(0,0,0,.24);
    display:none;flex-direction:column;overflow:hidden;user-select:none;touch-action:none;
}
#ml-together.show{display:flex;animation:mlPop .4s cubic-bezier(.22,1,.36,1);}
.ml-tg-head{display:flex;align-items:center;gap:8px;padding:11px 12px;cursor:grab;background:rgba(var(--accent-color-rgb,197,164,126),.08);border-bottom:1px solid var(--border-color);}
.ml-tg-head:active{cursor:grabbing;}
.ml-tg-label{font-size:11px;font-weight:700;letter-spacing:1px;color:var(--accent-color);flex:1;}
.ml-tg-ico{width:22px;height:22px;border-radius:50%;background:rgba(var(--accent-color-rgb,197,164,126),.14);color:var(--accent-color);display:flex;align-items:center;justify-content:center;font-size:10px;}
.ml-tg-body{display:flex;align-items:center;gap:10px;padding:12px;}
.ml-tg-cover{width:42px;height:42px;border-radius:9px;flex-shrink:0;background:rgba(var(--accent-color-rgb,197,164,126),.15);color:var(--accent-color);display:flex;align-items:center;justify-content:center;overflow:hidden;}
.ml-tg-cover.has-cov{background-size:cover;background-position:center;}
.ml-tg-cover svg{width:20px;height:20px;}
.ml-tg-info{flex:1;min-width:0;}
.ml-tg-song{font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ml-tg-who{font-size:11px;color:var(--text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ml-tg-controls{display:flex;align-items:center;gap:5px;}
.ml-tg-btn{width:30px;height:30px;border-radius:50%;border:none;background:none;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;}
.ml-tg-btn:hover{color:var(--accent-color);background:rgba(var(--accent-color-rgb,197,164,126),.12);}
.ml-tg-btn.hang{background:linear-gradient(135deg,#ff5252,#c62828);color:#fff;box-shadow:0 4px 12px rgba(255,82,82,.4);}
.ml-tg-btn.hang:hover{filter:brightness(1.08);}
@keyframes mlFade{from{opacity:0}to{opacity:1}}
@keyframes mlPop{from{opacity:0;transform:translateY(24px) scale(.95)}to{opacity:1;transform:none}}
@keyframes mlPulse{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:.1;transform:scale(1.12)}}
@keyframes mlBlink{from{opacity:1}to{opacity:.15}}
`;
    document.head.appendChild(el);
  }

  function injectHTML() {
    if (document.getElementById('music-listen-root')) return;
    var root = document.createElement('div');
    root.id = 'music-listen-root';
    root.innerHTML =
      '<div id="ml-inviting-overlay">' +
        '<div class="ml-card">' +
          '<div class="ml-av-wrap"><div class="ml-av-ring"></div><div class="ml-av-ring2"></div>' +
            '<div class="ml-avatar" id="ml-out-avatar"><i class="fas fa-user"></i></div></div>' +
          '<div class="ml-name" id="ml-out-name"></div>' +
          '<div class="ml-sub"><span class="ml-dot"></span><span>正在邀请一起听…</span></div>' +
          '<div class="ml-song" id="ml-out-song"></div>' +
          '<button class="ml-cancel" id="ml-out-cancel">取消</button>' +
        '</div>' +
      '</div>' +
      '<div id="ml-incoming-overlay">' +
        '<div class="ml-card">' +
          '<div class="ml-av-wrap"><div class="ml-av-ring"></div><div class="ml-av-ring2"></div>' +
            '<div class="ml-avatar" id="ml-in-avatar"><i class="fas fa-user"></i></div></div>' +
          '<div class="ml-name" id="ml-in-name"></div>' +
          '<div class="ml-sub"><span class="ml-dot"></span><span>想邀你一起听这首歌</span></div>' +
          '<div class="ml-song" id="ml-in-song"></div>' +
          '<div class="ml-actions">' +
            '<button class="ml-inc-btn ml-inc-reject" id="ml-in-decline">' +
              '<div class="ml-inc-circle"><i class="fas fa-phone-slash"></i></div><span class="ml-inc-lbl">拒绝</span>' +
            '</button>' +
            '<button class="ml-inc-btn ml-inc-accept" id="ml-in-accept">' +
              '<div class="ml-inc-circle"><i class="fas fa-headphones"></i></div><span class="ml-inc-lbl">一起听</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="ml-together">' +
        '<div class="ml-tg-head" id="ml-tg-drag">' +
          '<span class="ml-tg-label">一起听中</span>' +
          '<span class="ml-tg-ico"><i class="fas fa-headphones"></i></span>' +
        '</div>' +
        '<div class="ml-tg-body">' +
          '<div class="ml-tg-cover" id="ml-tg-cover"><i class="fas fa-music"></i></div>' +
          '<div class="ml-tg-info">' +
            '<div class="ml-tg-song" id="ml-tg-song">—</div>' +
            '<div class="ml-tg-who" id="ml-tg-who">—</div>' +
          '</div>' +
          '<div class="ml-tg-controls">' +
            '<button class="ml-tg-btn" id="ml-tg-prev" title="上一首"><i class="fas fa-backward"></i></button>' +
            '<button class="ml-tg-btn" id="ml-tg-play" title="播放/暂停"><i class="fas fa-play"></i></button>' +
            '<button class="ml-tg-btn" id="ml-tg-next" title="下一首"><i class="fas fa-forward"></i></button>' +
            '<button class="ml-tg-btn hang" id="ml-tg-end" title="结束一起听"><i class="fas fa-phone-slash"></i></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
  }

  function fillAvatar(id) {
    var av = document.getElementById(id); if (!av) return;
    var src = getAvatar();
    av.innerHTML = src ? '<img src="' + src + '" alt="">' : '<i class="fas fa-user"></i>';
  }

  function hideOverlays() {
    ['ml-inviting-overlay', 'ml-incoming-overlay'].forEach(function (id) {
      var e = document.getElementById(id); if (e) e.classList.remove('show');
    });
  }
  function showTogether(song) {
    togetherSong = song;
    phase = 'together';
    var cover = document.getElementById('ml-tg-cover');
    if (cover) { if (song.cover) { cover.className = 'ml-tg-cover has-cov'; cover.style.backgroundImage = 'url(' + song.cover + ')'; cover.innerHTML = ''; } else { cover.className = 'ml-tg-cover'; cover.style.backgroundImage = ''; cover.innerHTML = '<i class="fas fa-music"></i>'; } }
    var n = document.getElementById('ml-tg-song'); if (n) n.textContent = '《' + song.name + '》';
    var w = document.getElementById('ml-tg-who'); if (w) w.textContent = '和 ' + pname() + ' 一起听';
    var t = document.getElementById('ml-together'); if (t) t.classList.add('show');
    syncTogetherPlay();
  }
  function syncTogetherPlay() {
    var pe = document.getElementById('ml-tg-play'); if (!pe) return;
    var playing = window.MilkMusic && window.MilkMusic.isPlaying ? window.MilkMusic.isPlaying() : false;
    pe.innerHTML = playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
  }

  // ─── 我方发起邀请 ───
  function startInvite() {
    if (active) return;
    var cur = window.MilkMusic && window.MilkMusic.current ? window.MilkMusic.current() : null;
    var song = cur && cur.id ? cur : ((window.MilkMusic && window.MilkMusic.list && window.MilkMusic.list()[0]) || null);
    if (!song) { toast('音乐库还没有歌曲，先添加一首吧', 'warning'); return; }
    // 确保这首歌正在播放
    if (!cur) { try { window.MilkMusic.play(song.id); } catch (e) {} }

    active = true; phase = 'out-connect';
    fillAvatar('ml-out-avatar');
    var nm = document.getElementById('ml-out-name'); if (nm) nm.textContent = pname();
    var sg = document.getElementById('ml-out-song'); if (sg) sg.textContent = '《' + song.name + '》';
    document.getElementById('ml-inviting-overlay').classList.add('show');

    chatEvent('fa-headphones', '邀请 ' + pname() + ' 一起听《' + song.name + '》', null);

    connectTimer(1400 + Math.random() * 1400, function () {
      if (phase !== 'out-connect') return;
      if (Math.random() < REJECT_PROB) {
        // TA 拒绝/无法加入
        var labels = [
          pname() + ' 拒绝了听歌邀请',
          pname() + ' 正在忙，暂不能一起听',
          pname() + ' 拒绝了《' + song.name + '》',
          pname() + ' 说现在没空一起听'
        ];
        var lbl = labels[Math.floor(Math.random() * labels.length)];
        active = false; phase = 'idle';
        hideOverlays();
        chatEvent('fa-headphones', lbl, null);
        toast(lbl, 'info');
      } else {
        // TA 加入
        hideOverlays();
        showTogether(song);
        chatEvent('fa-headphones', pname() + ' 已加入一起听《' + song.name + '》', null);
        toast('已和 ' + pname() + ' 一起听 ♥', 'success');
      }
    });
  }

  // ─── TA 主动邀请我 ───
  function showIncoming() {
    if (active) return;
    var lib = (window.MilkMusic && window.MilkMusic.list) ? window.MilkMusic.list() : [];
    if (!lib.length) return;
    var song = lib[Math.floor(Math.random() * lib.length)];

    active = true; phase = 'in-coming';
    incomingSong = song;
    fillAvatar('ml-in-avatar');
    var nm = document.getElementById('ml-in-name'); if (nm) nm.textContent = pname();
    var sg = document.getElementById('ml-in-song'); if (sg) sg.textContent = '《' + song.name + '》';
    document.getElementById('ml-incoming-overlay').classList.add('show');

    try { if (typeof window._sendPartnerNotification === 'function') window._sendPartnerNotification(pname() + ' 想邀你一起听歌', '快加入吧 🎧'); } catch (e) {}

    // 可能被「错过」：30% 概率一段时间后自动移除
    if (Math.random() < MISS_PROB) {
      connectTimer(4000 + Math.random() * 5000, function () {
        var ov = document.getElementById('ml-incoming-overlay');
        if (phase !== 'in-coming' || !ov.classList.contains('show')) return;
        active = false; phase = 'idle';
        hideOverlays();
        var labels = [myname() + ' 错过了 ' + pname() + ' 的听歌邀请', '错过了 ' + pname() + ' 的一起听邀请'];
        var lbl = labels[Math.floor(Math.random() * labels.length)];
        chatEvent('fa-heart-crack', lbl, null);
        toast(lbl, 'info');
      });
    } else {
      // 等用户接听，设个兜底超时
      connectTimer(60000, function () {
        var ov = document.getElementById('ml-incoming-overlay');
        if (phase !== 'in-coming' || !ov.classList.contains('show')) return;
        active = false; phase = 'idle';
        hideOverlays();
        chatEvent('fa-heart-crack', myname() + ' 未接听 ' + pname() + ' 的一起听邀请', null);
      });
    }
  }

  // ─── 定时器（一次只用一个） ───
  function connectTimer(ms, fn) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; try { fn(); } catch (e) { console.warn('[listen]', e); } }, ms);
  }

  // ─── 结束一起听 ───
  function endTogether() {
    if (phase === 'together' && togetherSong) {
      chatEvent('fa-headphones', '结束与 ' + pname() + ' 的一起听', null);
    }
    active = false; phase = 'idle'; togetherSong = null;
    hideOverlays();
    var t = document.getElementById('ml-together'); if (t) t.classList.remove('show');
    if (window.MilkMusic && window.MilkMusic.pause) { try { window.MilkMusic.pause(); } catch (e) {} }
  }

  // ─── 拖动小窗 ───
  function initDrag() {
    var h = document.getElementById('ml-tg-drag');
    var box = document.getElementById('ml-together');
    if (!h || !box) return;
    var on = false, ox, oy, lx, ly;
    h.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      var r = box.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top; lx = r.left; ly = r.top; on = true;
      try { h.setPointerCapture(e.pointerId); } catch (_) {}
    });
    h.addEventListener('pointermove', function (e) {
      if (!on) return; e.preventDefault();
      var nl = Math.max(0, Math.min(lx + (e.clientX - ox), window.innerWidth - box.offsetWidth));
      var nt = Math.max(0, Math.min(ly + (e.clientY - oy), window.innerHeight - box.offsetHeight));
      box.style.left = nl + 'px'; box.style.top = nt + 'px'; box.style.right = 'auto'; box.style.bottom = 'auto';
    });
    var stop = function () { on = false; };
    h.addEventListener('pointerup', stop);
    h.addEventListener('pointercancel', stop);
  }

  // ─── 绑定 ───
  function bind() {
    var outCancel = document.getElementById('ml-out-cancel');
    if (outCancel) outCancel.addEventListener('click', function () {
      if (phase !== 'out-connect') return;
      active = false; phase = 'idle';
      hideOverlays();
      chatEvent('fa-circle-xmark', '取消了对 ' + pname() + ' 的一起听邀请', null);
    });

    var inDecline = document.getElementById('ml-in-decline');
    if (inDecline) inDecline.addEventListener('click', function () {
      active = false; phase = 'idle';
      hideOverlays();
      chatEvent('fa-heart-crack', myname() + ' 拒绝了 ' + pname() + ' 的一起听邀请', null);
    });

    var inAccept = document.getElementById('ml-in-accept');
    if (inAccept) inAccept.addEventListener('click', function () {
      if (phase !== 'in-coming') return;
      hideOverlays();
      var song = incomingSong || ((window.MilkMusic && window.MilkMusic.list && window.MilkMusic.list()[0]) || null);
      incomingSong = null;
      if (!song) { active = false; phase = 'idle'; return; }
      if (window.MilkMusic.play) { try { window.MilkMusic.play(song.id); } catch (e) {} }
      showTogether(song);
      chatEvent('fa-headphones', myname() + ' 加入与 ' + pname() + ' 的一起听《' + song.name + '》', null);
    });

    var endBtn = document.getElementById('ml-tg-end');
    if (endBtn) endBtn.addEventListener('click', endTogether);
    var playBtn = document.getElementById('ml-tg-play');
    if (playBtn) playBtn.addEventListener('click', function () { if (window.MilkMusic && window.MilkMusic.toggle) { try { window.MilkMusic.toggle(); } catch (e) {} setTimeout(syncTogetherPlay, 80); } });
    var nextBtn = document.getElementById('ml-tg-next');
    if (nextBtn) nextBtn.addEventListener('click', function () { if (window.MilkMusic && window.MilkMusic.next) { try { window.MilkMusic.next(); } catch (e) {} setTimeout(syncTogetherPlay, 80); } });
    var prevBtn = document.getElementById('ml-tg-prev');
    if (prevBtn) prevBtn.addEventListener('click', function () { if (window.MilkMusic && window.MilkMusic.prev) { try { window.MilkMusic.prev(); } catch (e) {} setTimeout(syncTogetherPlay, 80); } });

    initDrag();
  }

  // ─── TA 主动邀请的调度：间隔 1min~24h 随机，到期 30% 概率触发一次，未触发保持静默 ───
  function schedulePartner() {
    if (!enabled) return;
    var MIN = 60 * 1000;               // 最小 1 分钟
    var MAX = 24 * 60 * 60 * 1000;     // 最大 24 小时
    var wait = MIN + Math.random() * (MAX - MIN);
    setTimeout(function () {
      if (!enabled) return;
      // 30% 概率触发一次；未触发（或正忙）则什么都不做
      if (Math.random() < 0.30 && !active) {
        showIncoming();
      }
      schedulePartner();
    }, wait);
  }

  function init() {
    injectCSS();
    injectHTML();
    bind();
    var prevEnabled = null;
    try { prevEnabled = localStorage.getItem((window.APP_PREFIX || 'CHAT_APP_V3_') + ENABLED_KEY); } catch (e) {}
    enabled = prevEnabled !== 'false';
    schedulePartner();
    window.listenFeature = {
      startInvite: startInvite,
      showIncoming: showIncoming,
      endInvite: endTogether,
      isActive: function () { return active; },
      setEnabled: function (v) { enabled = !!v; try { localStorage.setItem((window.APP_PREFIX || 'CHAT_APP_V3_') + ENABLED_KEY, enabled ? 'true' : 'false'); } catch (e) {} },
      isEnabled: function () { return enabled; }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
