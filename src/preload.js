// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Database status
  getDatabaseStatus: () => ipcRenderer.invoke('get-database-status'),
  testConnections: () => ipcRenderer.invoke('test-connections'),

  // Notes operations
  createNote: (noteData) => ipcRenderer.invoke('create-note', noteData),
  updateNote: (id, noteData) => ipcRenderer.invoke('update-note', id, noteData),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),
  getAllNotes: () => ipcRenderer.invoke('get-all-notes'),
  searchNotes: (query) => ipcRenderer.invoke('search-notes', query),

  // File operations
  uploadFile: (fileData, noteId) => ipcRenderer.invoke('upload-file', fileData, noteId),
  uploadJsonFile: (jsonData, fileName, noteId) => ipcRenderer.invoke('upload-json-file', jsonData, fileName, noteId),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  readJsonFile: (filePath) => ipcRenderer.invoke('read-json-file', filePath),

  // Sync operations
  forceSync: () => ipcRenderer.invoke('force-sync'),

  // Utility
  formatFileSize: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
});
