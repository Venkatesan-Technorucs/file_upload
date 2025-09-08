const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('fs').promises;
// const databaseManager = require('./database'); // Standard database manager (disabled)
// Optimized database manager with better performance and error handling
const databaseManager = require('./optimizedDatabase');
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
  try {
    console.log('Initializing database...');
    await databaseManager.initialize();
    console.log('Database initialized successfully');
    
    setupIpcHandlers();
    createWindow();

    // Send ready event to renderer when fully loaded
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app-ready');
      }
    }, 1000);
  } catch (error) {
    console.error('Failed to initialize application:', error);
    // Create window anyway but with error state
    setupIpcHandlers();
    createWindow();
  }

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
      console.log('IPC: Creating note:', noteData?.title);
      const result = await databaseManager.createNote(noteData);
      console.log('IPC: Note created successfully:', result?.id);
      return result;
    } catch (error) {
      console.error('IPC: Error creating note:', error);
      throw error;
    }
  });

  ipcMain.handle('update-note', async (event, id, noteData) => {
    try {
      console.log('IPC: Updating note:', id);
      const result = await databaseManager.updateNote(id, noteData);
      console.log('IPC: Note updated successfully:', result?.id);
      return result;
    } catch (error) {
      console.error('IPC: Error updating note:', error);
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
      console.log('IPC: Getting all notes...');
      const notes = await databaseManager.getAllNotes();
      console.log(`IPC: Retrieved ${notes?.length || 0} notes`);
      return notes || [];
    } catch (error) {
      console.error('IPC: Error getting notes:', error);
      // Return empty array with error indication instead of throwing
      return [];
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

  // New streaming file upload handler
  ipcMain.handle('upload-file-stream', async (event, filePath, originalName, mimeType, noteId) => {
    try {
      let progressData = null;
      
      const savedFile = await fileHandler.saveFileStream(
        filePath,
        originalName,
        mimeType,
        (progress) => {
          // Send progress updates to renderer
          event.sender.send('upload-progress', progress);
          progressData = progress;
        }
      );
      
      const dbRecord = await databaseManager.saveFile(savedFile, noteId);
      
      // Send completion notification
      event.sender.send('upload-complete', {
        uploadId: savedFile.uploadId,
        file: dbRecord
      });
      
      return dbRecord;
    } catch (error) {
      console.error('Error uploading file stream:', error);
      event.sender.send('upload-error', {
        error: error.message,
        originalName
      });
      throw error;
    }
  });

  // Chunked upload handlers
  ipcMain.handle('initialize-chunked-upload', async (event, originalName, totalSize, mimeType) => {
    try {
      return await fileHandler.initializeChunkedUpload(originalName, totalSize, mimeType);
    } catch (error) {
      console.error('Error initializing chunked upload:', error);
      throw error;
    }
  });

  ipcMain.handle('upload-chunk', async (event, uploadId, chunkData, chunkIndex) => {
    try {
      const progress = await fileHandler.uploadChunk(uploadId, Buffer.from(chunkData), chunkIndex);
      
      // Send progress update
      event.sender.send('upload-progress', progress);
      
      return progress;
    } catch (error) {
      console.error('Error uploading chunk:', error);
      throw error;
    }
  });

  ipcMain.handle('finalize-chunked-upload', async (event, uploadId, noteId) => {
    try {
      const savedFile = await fileHandler.finalizeChunkedUpload(uploadId);
      const dbRecord = await databaseManager.saveFile(savedFile, noteId);
      
      // Send completion notification
      event.sender.send('upload-complete', {
        uploadId,
        file: dbRecord
      });
      
      return dbRecord;
    } catch (error) {
      console.error('Error finalizing chunked upload:', error);
      throw error;
    }
  });

  // Upload management
  ipcMain.handle('get-upload-progress', async (event, uploadId) => {
    return fileHandler.getUploadProgress(uploadId);
  });

  ipcMain.handle('get-all-active-uploads', async () => {
    return fileHandler.getAllActiveUploads();
  });

  ipcMain.handle('cancel-upload', async (event, uploadId) => {
    return fileHandler.cancelUpload(uploadId);
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
        // Only read file stats, not the entire file content for large files
        const stats = await fs.stat(filePath);
        const fileName = path.basename(filePath);
        
        // For small files (< 10MB), read into memory for compatibility
        // For large files, just provide the path for streaming
        if (stats.size < 10 * 1024 * 1024) {
          const buffer = await fs.readFile(filePath);
          files.push({
            name: fileName,
            buffer: Array.from(buffer),
            size: stats.size,
            type: getFileType(fileName),
            path: filePath,
            useStreaming: false
          });
        } else {
          files.push({
            name: fileName,
            buffer: null, // No buffer for large files
            size: stats.size,
            type: getFileType(fileName),
            path: filePath,
            useStreaming: true
          });
        }
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
