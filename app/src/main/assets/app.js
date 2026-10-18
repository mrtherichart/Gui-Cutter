'use strict';
// No frameworks and no Android code in the editor UI. JS talks to one small native interface.
const native = window.NativeAndroid || null;
const byId = (id) => document.getElementById(id);
const setStatus = (value) => { byId('status').textContent = String(value); };

function refreshStatus() {
  if (!native) {
    byId('folder').textContent = 'Browser preview';
    byId('logs-state').textContent = 'Android only';
    setStatus('Browser preview: native folder, updater and log actions are Android-only.');
    return;
  }
  try {
    const info = JSON.parse(native.appStatus());
    byId('version').textContent = 'v' + info.version;
    byId('folder').textContent = info.folder;
    byId('logs-state').textContent = info.logsEnabled ? 'Diagnostics enabled' : 'Diagnostics disabled';
  } catch (error) { setStatus('Cannot read native status: ' + error.message); }
}

// Kotlin always emits JSON objects, not snippets of executable JavaScript.
window.GuiCutterReceive = function(type, data) {
  if (type === 'status') {
    byId('version').textContent = 'v' + data.version;
    byId('folder').textContent = data.folder;
    byId('logs-state').textContent = data.logsEnabled ? 'Diagnostics enabled' : 'Diagnostics disabled';
  }
  if (data.message) setStatus(data.message);
  if (type === 'update') {
    byId('install-update').hidden = data.state !== 'available' && data.state !== 'permission';
  }
};

function action(button, method) {
  byId(button).addEventListener('click', () => {
    if (!native || typeof native[method] !== 'function') {
      setStatus('This action is available inside the Android APK.');
      return;
    }
    try { native[method](); }
    catch (error) { setStatus('Action failed: ' + error.message); }
  });
}

action('choose-folder', 'chooseFolder');
action('test-folder', 'testFolder');
action('check-update', 'checkUpdates');
action('install-update', 'installUpdate');
action('export-log', 'exportLog');

window.addEventListener('error', (event) => {
  if (native) native.jsError('Uncaught: ' + event.message + ' at ' + event.filename + ':' + event.lineno);
});
window.addEventListener('unhandledrejection', (event) => {
  if (native) native.jsError('Promise rejection: ' + String(event.reason));
});
refreshStatus();
