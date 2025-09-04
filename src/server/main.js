const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('fs').promises;
const databaseManager = require('./database');
const fileHandler = require('./fileHandler');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  await databaseManager.initialize();
  setupIpcHandlers();
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers for communication with renderer process
function setupIpcHandlers() {
  // Database status
  ipcMain.handle('get-database-status', async () => {
    return databaseManager.getStatus();
  });

  // Test database connections
  ipcMain.handle('test-connections', async () => {
    try {
      return await databaseManager.testConnections();
    } catch (error) {
      console.error('Error testing connections:', error);
      throw error;
    }
  });

  // Notes operations
  ipcMain.handle('create-note', async (event, noteData) => {
    try {
      return await databaseManager.createNote(noteData);
    } catch (error) {
      console.error('Error creating note:', error);
      throw error;
    }
  });

  ipcMain.handle('update-note', async (event, id, noteData) => {
    try {
      return await databaseManager.updateNote(id, noteData);
    } catch (error) {
      console.error('Error updating note:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-note', async (event, id) => {
    try {
      await databaseManager.deleteNote(id);
      return { success: true };
    } catch (error) {
      console.error('Error deleting note:', error);
      throw error;
    }
  });

  ipcMain.handle('get-all-notes', async () => {
    try {
      return await databaseManager.getAllNotes();
    } catch (error) {
      console.error('Error getting notes:', error);
      throw error;
    }
  });

  ipcMain.handle('search-notes', async (event, query) => {
    try {
      return await databaseManager.searchNotes(query);
    } catch (error) {
      console.error('Error searching notes:', error);
      throw error;
    }
  });

  // File operations
  ipcMain.handle('upload-file', async (event, fileData, noteId) => {
    try {
      const buffer = Buffer.from(fileData.buffer);
      const savedFile = await fileHandler.saveFile(
        buffer, 
        fileData.name, 
        fileData.type
      );
      
      return await databaseManager.saveFile(savedFile, noteId);
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  });

  ipcMain.handle('upload-json-file', async (event, jsonData, fileName, noteId) => {
    try {
      const savedFile = await fileHandler.saveJsonFile(jsonData, fileName);
      return await databaseManager.saveFile(savedFile, noteId);
    } catch (error) {
      console.error('Error uploading JSON file:', error);
      throw error;
    }
  });

  ipcMain.handle('open-file-dialog', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'] },
          { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf'] },
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'aac'] },
          { name: 'Video', extensions: ['mp4', 'avi', 'mkv', 'mov'] }
        ]
      });

      if (result.canceled) {
        return { canceled: true };
      }

      const files = [];
      for (const filePath of result.filePaths) {
        const buffer = await fs.readFile(filePath);
        const stats = await fs.stat(filePath);
        const fileName = path.basename(filePath);
        
        files.push({
          name: fileName,
          buffer: Array.from(buffer),
          size: stats.size,
          type: getFileType(fileName),
          path: filePath
        });
      }

      return { files };
    } catch (error) {
      console.error('Error opening file dialog:', error);
      throw error;
    }
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      return await fileHandler.readFile(filePath);
    } catch (error) {
      console.error('Error reading file:', error);
      throw error;
    }
  });

  ipcMain.handle('read-json-file', async (event, filePath) => {
    try {
      return await fileHandler.readJsonFile(filePath);
    } catch (error) {
      console.error('Error reading JSON file:', error);
      throw error;
    }
  });

  // Sync operations
  ipcMain.handle('force-sync', async () => {
    try {
      await databaseManager.syncPendingData();
      return { success: true };
    } catch (error) {
      console.error('Error forcing sync:', error);
      throw error;
    }
  });
}

function getFileType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg'];
  const videoExts = ['.mp4', '.avi', '.mkv', '.mov', '.wmv'];
  const audioExts = ['.mp3', '.wav', '.flac', '.aac', '.ogg'];
  const docExts = ['.pdf', '.doc', '.docx', '.txt', '.rtf'];

  if (imageExts.includes(ext)) return 'image/*';
  if (videoExts.includes(ext)) return 'video/*';
  if (audioExts.includes(ext)) return 'audio/*';
  if (docExts.includes(ext)) return 'application/*';
  if (ext === '.json') return 'application/json';
  
  return 'application/octet-stream';
}
