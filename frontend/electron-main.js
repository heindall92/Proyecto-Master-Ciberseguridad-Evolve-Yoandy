import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    frame: true, // Se puede cambiar a false para el estilo Cyberpunk
    autoHideMenuBar: true, // Oculta la barra de menús típica
    backgroundColor: '#0a0a0f', // Fondo oscuro por defecto
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    }
  });

  // En desarrollo, cargar el servidor de Vite
  // En producción, cargar el archivo HTML compilado
  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

  if (isDev) {
    // Modo de desarrollo: Carga el servidor de Vite en tiempo real
    mainWindow.loadURL('http://localhost:3000');
    
    // Abrir las herramientas de desarrollo
    // mainWindow.webContents.openDevTools();
  } else {
    // Modo de producción: Carga el archivo compilado final
    mainWindow.loadFile(path.join(__dirname, 'app/dist/index.html'));
  }

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(createWindow);

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});
