(function(){
  function cur(){ try{var v=localStorage.getItem('milk-theme-mode'); if(v==='light'||v==='dark') return v;}catch(e){} return 'auto'; }
  function sysDark(){ try{ return window.matchMedia('(prefers-color-scheme: dark)').matches; }catch(e){ return false; } }
  function sync(){
    var c=cur();
    document.querySelectorAll('.theme-mode-btn').forEach(function(b){
      var on = b.getAttribute('data-mode')===c;
      b.style.borderColor = on ? 'var(--accent-color)' : 'var(--border-color)';
      b.style.background = on ? 'rgba(var(--accent-color-rgb),.15)' : 'var(--secondary-bg)';
      b.style.color = on ? 'var(--accent-color)' : 'var(--text-secondary)';
      b.style.fontWeight = on ? '600' : '400';
    });
  }
  function apply(m){
    try{ if(m==='auto') localStorage.removeItem('milk-theme-mode'); else localStorage.setItem('milk-theme-mode',m); }catch(e){}
    var dark = (m==='dark') || (m==='auto' && sysDark());
    document.documentElement.setAttribute('data-theme', dark?'dark':'light');
    sync();
  }
  document.addEventListener('click', function(e){
    var b=e.target.closest && e.target.closest('.theme-mode-btn');
    if(b){ e.preventDefault(); apply(b.getAttribute('data-mode')); }
  });
  document.addEventListener('DOMContentLoaded', sync);
  setTimeout(sync,500);
  try{ window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(){ if(cur()==='auto') apply('auto'); }); }catch(e){}
})();

document.addEventListener('click', function(e){
  var b = e.target.closest && e.target.closest('#garden-data-btn');
  if(b){ e.preventDefault(); var dm=document.getElementById('garden-data-manage'); if(dm){ dm.style.display = (dm.style.display==='none' ? 'block' : 'none'); } }
});
// 沉浸模式顶部条
(function(){
  function syncName(){
    var el=document.getElementById('ib-name'); if(!el) return;
    var n=''; try{ n=(window.settings&&settings.partnerName)||''; }catch(e){}
    if(!n){ var p=document.getElementById('partner-name'); if(p) n=p.textContent||''; }
    el.textContent = n || '对方';
  }
  document.addEventListener('click', function(e){
    if(e.target.closest && e.target.closest('#ib-back')){ if(typeof window.toggleImmersiveMode==='function') window.toggleImmersiveMode(false); }
    else if(e.target.closest && e.target.closest('#ib-set')){ var s=document.getElementById('settings-btn'); if(s) s.click(); }
  });
  try{
    new MutationObserver(function(){ if(document.body.classList.contains('immersive-mode')) syncName(); })
      .observe(document.body,{attributes:true,attributeFilter:['class']});
  }catch(e){}
  document.addEventListener('DOMContentLoaded', syncName);
  setTimeout(syncName, 800);
})();