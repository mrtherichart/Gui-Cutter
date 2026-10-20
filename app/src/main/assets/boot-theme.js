// Run synchronously before the stylesheet and before the editor module.
// Storage is authoritative for the user's choice; only system mode consults Android.
(() => {
  let mode = 'system';
  try {
    const saved = JSON.parse(localStorage.getItem('gui-cutter.preferences.v1') || '{}');
    if (['light', 'dark', 'system'].includes(saved.theme)) mode = saved.theme;
  } catch {}
  let systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  try { if (window.NativeAndroid?.initialSystemDark) systemDark = window.NativeAndroid.initialSystemDark(); } catch {}
  const dark = mode === 'dark' || (mode === 'system' && systemDark);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#121C2A' : '#EEF3F7';
})();
