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
  uploadFileStream: (filePath, originalName, mimeType, noteId) => ipcRenderer.invoke('upload-file-stream', filePath, originalName, mimeType, noteId),
  
  // Chunked upload operations
  initializeChunkedUpload: (originalName, totalSize, mimeType) => ipcRenderer.invoke('initialize-chunked-upload', originalName, totalSize, mimeType),
  uploadChunk: (uploadId, chunkData, chunkIndex) => ipcRenderer.invoke('upload-chunk', uploadId, chunkData, chunkIndex),
  finalizeChunkedUpload: (uploadId, noteId) => ipcRenderer.invoke('finalize-chunked-upload', uploadId, noteId),
  
  // Upload management
  getUploadProgress: (uploadId) => ipcRenderer.invoke('get-upload-progress', uploadId),
  getAllActiveUploads: () => ipcRenderer.invoke('get-all-active-uploads'),
  cancelUpload: (uploadId) => ipcRenderer.invoke('cancel-upload', uploadId),
  
  // Upload event listeners
  onUploadProgress: (callback) => ipcRenderer.on('upload-progress', callback),
  onUploadComplete: (callback) => ipcRenderer.on('upload-complete', callback),
  onUploadError: (callback) => ipcRenderer.on('upload-error', callback),
  onAppReady: (callback) => ipcRenderer.on('app-ready', callback),
  removeUploadListeners: () => {
    ipcRenderer.removeAllListeners('upload-progress');
    ipcRenderer.removeAllListeners('upload-complete');
    ipcRenderer.removeAllListeners('upload-error');
    ipcRenderer.removeAllListeners('app-ready');
  },
  uploadJsonFile: (jsonData, fileName, noteId) => ipcRenderer.invoke('upload-json-file', jsonData, fileName, noteId),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  readJsonFile: (filePath) => ipcRenderer.invoke('read-json-file', filePath),

  // Sync operations
  forceSync: () => ipcRenderer.invoke('force-sync'),
  syncToOnline: () => ipcRenderer.invoke('force-sync'), // Alias for force-sync

  // Utility
  formatFileSize: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
});
