import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import http from 'http'
import url from 'url'

let mainWindow;
let authServer;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    autoHideMenuBar: true,
    backgroundColor: '#07070f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // DevTools aç - hata ayıklama için
  mainWindow.webContents.openDevTools({ mode: 'detach' })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Start a local HTTP server to handle OAuth callback
function setupAuthServer() {
  authServer = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    if (parsedUrl.pathname === '/callback') {
      const code = parsedUrl.query.code;
      const error = parsedUrl.query.error;
      
      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="background:#07070f;color:#ff6b35;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h1>Hata: ${error}</h1></body></html>`);
        return;
      }

      // Gelen kodu renderer process'e gönder
      if (mainWindow && !mainWindow.isDestroyed() && code) {
        mainWindow.webContents.send('oauth-callback', code);
        mainWindow.focus(); // Uygulamaya geri dön
      }
      
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html>
          <head>
            <style>
              body { background: #07070f; color: #1DB954; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              h1 { font-size: 32px; margin-bottom: 16px; }
              p { color: #eeeef5; font-size: 16px; }
            </style>
          </head>
          <body>
            <h1>Başarıyla Giriş Yapıldı!</h1>
            <p>Bu sekmeyi kapatabilir ve uygulamaya geri dönebilirsiniz.</p>
          </body>
        </html>
      `);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  authServer.on('error', (err) => {
    console.error('Auth server hatası:', err.message);
  });

  authServer.listen(8888, '127.0.0.1', () => {
    console.log('OAuth Callback sunucusu http://127.0.0.1:8888/callback adresinde dinliyor.');
  });
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  setupAuthServer();
  createWindow()

  // IPC Handler'lar
  ipcMain.on('open-external', (_, url) => {
    shell.openExternal(url);
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (authServer) authServer.close();
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
