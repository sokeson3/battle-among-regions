// ─────────────────────────────────────────────────────────────
// electron/main.js — Electron main process for Battle Among Regions
// ─────────────────────────────────────────────────────────────

const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// Keep a global reference so the window isn't garbage-collected
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'Battle Among Regions — War for Supremacy',
        icon: path.join(__dirname, '..', 'dist', 'Background.png'),
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // Remove the default menu bar
    Menu.setApplicationMenu(null);

    // Load the built Vite app from the dist folder
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

    // Maximize on launch for a fullscreen game feel
    mainWindow.maximize();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Create the window once Electron is ready
app.whenReady().then(createWindow);

// Quit when all windows are closed (Windows / Linux)
app.on('window-all-closed', () => {
    app.quit();
});

// macOS: re-create window when dock icon is clicked
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
