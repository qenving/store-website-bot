import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { registerIPCHandlers } from './ipcHandlers';
import { io, Socket } from 'socket.io-client';

const SOCKET_PORT = parseInt(process.env.SOCKET_PORT || '3002', 10);
const SOCKET_HOST = process.env.SOCKET_HOST || 'localhost';

let mainWindow: BrowserWindow | null = null;
let socketClient: Socket | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    autoHideMenuBar: true,
    title: 'Discord Store Bot - Admin Dashboard'
  });

  const indexPath = path.join(__dirname, '..', 'renderer', 'index.html');
  mainWindow.loadFile(indexPath);

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  connectToSocketServer();
}

function connectToSocketServer(): void {
  if (socketClient) {
    socketClient.disconnect();
  }

  socketClient = io(`http://${SOCKET_HOST}:${SOCKET_PORT}`, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity
  });

  socketClient.on('connect', () => {
    console.log('Dashboard connected to socket server');
  });

  socketClient.on('disconnect', () => {
    console.log('Dashboard disconnected from socket server');
  });

  socketClient.on('bot_status', (status) => {
    if (mainWindow) {
      mainWindow.webContents.send('bot-status-update', status);
    }
  });

  socketClient.on('log_message', (log) => {
    if (mainWindow) {
      mainWindow.webContents.send('log-event', log);
    }
  });

  socketClient.on('transaction_created', (event) => {
    if (mainWindow) {
      mainWindow.webContents.send('transaction-event', event);
    }
  });

  socketClient.on('transaction_updated', (event) => {
    if (mainWindow) {
      mainWindow.webContents.send('transaction-event', event);
    }
  });

  socketClient.on('transaction_completed', (event) => {
    if (mainWindow) {
      mainWindow.webContents.send('transaction-event', event);
    }
  });

  socketClient.on('transaction_failed', (event) => {
    if (mainWindow) {
      mainWindow.webContents.send('transaction-event', event);
    }
  });

  socketClient.on('maintenance_mode', (mode) => {
    if (mainWindow) {
      mainWindow.webContents.send('maintenance-mode-update', mode);
    }
  });

  socketClient.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
  });
}

app.whenReady().then(() => {
  registerIPCHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (socketClient) {
    socketClient.disconnect();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (socketClient) {
    socketClient.disconnect();
  }
});
