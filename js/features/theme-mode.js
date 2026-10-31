(function(){
  function isDark(){ return document.documentElement.getAttribute('data-theme')==='dark'; }
  function sync(){ var b=document.getElementById('theme-mode-toggle'); if(b) b.textContent = isDark()?'🌙 夜间':'☀️ 白天'; }
  function apply(dark){ document.documentElement.setAttribute('data-theme', dark?'dark':'light'); try{ localStorage.setItem('milk-theme-mode', dark?'dark':'light'); }catch(e){} sync(); }
  document.addEventListener('click', function(e){ var b=e.target.closest && e.target.closest('#theme-mode-toggle'); if(b){ e.preventDefault(); apply(!isDark()); } });
  document.addEventListener('DOMContentLoaded', sync);
  setTimeout(sync, 500);
})();
// 花园“数据”按钮：切换数据管理显示
document.addEventListener('click', function(e){
  var b = e.target.closest && e.target.closest('#garden-data-btn');
  if(b){ e.preventDefault(); var dm=document.getElementById('garden-data-manage'); if(dm){ dm.style.display = (dm.style.display==='none' ? 'block' : 'none'); } }
});