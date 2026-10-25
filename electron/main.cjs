const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

let mainWindow;

// Development mode: `npm run electron:dev` passes --dev (cross-platform);
// ELECTRON_DEV=true is still honoured for anyone setting it by hand.
const isDev = process.argv.includes('--dev') || process.env.ELECTRON_DEV === 'true';

const DEV_SERVER_URL = 'http://localhost:8080';
const DIST_DIR = path.join(__dirname, '..', 'dist');
// Trailing separator so "…/dist-other/" cannot pass the prefix check.
const DIST_URL_PREFIX = pathToFileURL(DIST_DIR + path.sep).href;

// Only the bundled app (or the Vite dev server in dev mode) is trusted.
function isTrustedUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl === '') return false;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (isDev) {
    return url.origin === new URL(DEV_SERVER_URL).origin;
  }
  return url.protocol === 'file:' && url.href.startsWith(DIST_URL_PREFIX);
}

function isMainWindowContents(webContents) {
  return Boolean(mainWindow && webContents && webContents.id === mainWindow.webContents.id);
}

// Permissions the renderer may be granted, and only from trusted content in
// the main frame of the app window.
const ALLOWED_PERMISSIONS = new Set(['media', 'mediaKeySystem', 'notifications']);

function isTrustedPermissionRequest(webContents, permission, details) {
  if (!ALLOWED_PERMISSIONS.has(permission)) return false;
  if (!isMainWindowContents(webContents)) return false;
  if (details && details.isMainFrame === false) return false;
  const requestingUrl =
    (details && details.requestingUrl) || (webContents && webContents.getURL()) || '';
  return isTrustedUrl(requestingUrl);
}

function openExternally(url) {
  // Hand http(s) links to the OS browser; drop everything else.
  if (/^https?:$/.test(safeProtocol(url))) {
    shell.openExternal(url).catch(() => {});
  }
}

function safeProtocol(rawUrl) {
  try {
    return new URL(rawUrl).protocol;
  } catch {
    return '';
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Joke & Smile Camera',
    icon: path.join(__dirname, '..', 'public', 'icons', 'icon-512x512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f8f5ff',
    show: false,
  });

  // Load the app - use dev server in dev, built files in production
  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(DIST_DIR, 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function configureSession() {
  const ses = session.defaultSession;

  // Camera / microphone / notifications: granted only to the bundled app's
  // main frame, never to an external page or an embedded frame.
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isTrustedPermissionRequest(webContents, permission, details));
  });

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (!ALLOWED_PERMISSIONS.has(permission)) return false;
    if (webContents && !isMainWindowContents(webContents)) return false;
    if (details && details.isMainFrame === false) return false;
    return isTrustedUrl((details && details.requestingUrl) || requestingOrigin);
  });
}

// Lock down navigation for every WebContents the app creates.
app.on('web-contents-created', (_event, contents) => {
  // No new windows: external links open in the system browser instead.
  contents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });

  // The main frame may only navigate within the trusted app content.
  contents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) {
      event.preventDefault();
      openExternally(url);
    }
  });

  // Sub-frames may not navigate anywhere untrusted either.
  contents.on('will-frame-navigate', (details) => {
    if (!isTrustedUrl(details.url)) {
      details.preventDefault();
    }
  });

  // <webview> tags are disabled in webPreferences; refuse any that slip through.
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

app.whenReady().then(() => {
  configureSession();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Exposed for tests; unused by Electron itself.
module.exports = { isTrustedUrl, isTrustedPermissionRequest };
