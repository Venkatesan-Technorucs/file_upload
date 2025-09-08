# Electron Offline-First File Upload System - Technical Overview

## Title & Purpose

This is a comprehensive offline-first file upload and note-taking application built with Electron, React, and SQLite. The system enables users to create notes with file attachments that work seamlessly offline and sync to a MySQL backend when online. The application supports streaming uploads, chunked transfers for large files, and provides robust data synchronization with conflict resolution.

**Core Goals:**
- Offline-first architecture with SQLite local storage
- Seamless online/offline transitions with background sync
- Optimized file uploads (streaming, chunking, resume capability)
- Dual database architecture (SQLite + MySQL) for data redundancy
- Secure IPC communication between Electron processes

## Assumptions

- **Database Layer**: SQLite3 v5.1.7 for local storage, MySQL2 v3.14.4 for online sync
- **ORM**: Sequelize v6.37.7 for database abstraction across SQLite/MySQL
- **Runtime**: Electron v33.0.2, Node.js compatible environment
- **Frontend**: React v19.1.1 with modern JavaScript features
- **Security**: Context isolation enabled, nodeIntegration disabled
- **File Storage**: Local file system with organized upload/temp directories
- **Network**: Periodic connectivity checks via DNS resolution (Google's 8.8.8.8)
- **Development**: Webpack-based build system via Electron Forge

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Electron Main Process                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │  Database Mgr   │  │  File Handler   │  │   IPC Handlers  │    │
│  │  - SQLite       │  │  - Stream Ops   │  │  - 25+ Channels │    │
│  │  - MySQL Sync   │  │  - Chunk Ops    │  │  - Validation   │    │
│  │  - Status Check │  │  - Progress     │  │  - Error Handle │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘    │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ IPC Channels (Secure Context Bridge)
┌─────────────────────────┼───────────────────────────────────────────┐
│                     Preload.js (Security Boundary)                 │
│           ┌─────────────┼───────────────────────────────┐           │
│           │   electronAPI Context Bridge Exposure      │           │
│           └─────────────┬───────────────────────────────┘           │
└─────────────────────────┼───────────────────────────────────────────┘
                          │ Safe API Calls
┌─────────────────────────┼───────────────────────────────────────────┐
│                  Renderer Process (React)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │      App.jsx    │  │  FileUpload     │  │   Components    │    │
│  │  - State Mgmt   │  │  - Progress UI  │  │  - NotesEditor  │    │
│  │  - Error Handle │  │  - Resume Logic │  │  - SearchBar    │    │
│  │  - Loading UI   │  │  - Strategy Sel │  │  - StatusBar    │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘

External Dependencies:
┌─────────────────┐      ┌─────────────────┐
│  Local Storage  │      │  Remote MySQL   │
│  - offline.db   │◄────►│  - notes_app    │
│  - uploads/     │      │  - sync data    │
│  - temp/        │      │  - localhost    │
└─────────────────┘      └─────────────────┘
```

**Component Responsibilities:**
- **Main Process**: Database management, file operations, IPC coordination, security enforcement
- **Preload Script**: Secure API exposure via contextBridge, input validation
- **Renderer Process**: UI state management, user interactions, progress visualization
- **Background Sync**: Automatic online/offline detection and data synchronization

## Dataflow & Sync Logic

### Create Operations (Offline-First)
```
1. User creates note/uploads file
   ↓
2. Save immediately to SQLite (guaranteed success)
   ↓
3. Check network connectivity (DNS lookup to 8.8.8.8)
   ↓
4. If online: Attempt immediate MySQL sync
   ├─ Success: Mark as synced (synced=1)
   └─ Failure: Queue for later sync (synced=0)
   ↓
5. Return success to UI (data always saved locally)
```

### Read Operations
```
1. Always read from SQLite (local-first)
   ↓
2. Include sync status in response
   ↓
3. UI shows sync indicators
```

### Update/Delete Operations
```
1. Update/Delete in SQLite first
   ↓
2. Mark as unsynced (synced=0)
   ↓
3. Attempt immediate remote sync if online
   ↓
4. Background sync will retry if failed
```

### Background Sync Process
```
Every 5 seconds:
1. Check network connectivity (DNS resolution)
   ↓
2. If offline: Set isOnline=false, skip sync
   ↓
3. If online: Test MySQL connection
   ├─ Success: Trigger sync process
   └─ Failure: Set isOnline=false
   ↓
4. Sync Process:
   ├─ Query unsynced records (synced=0)
   ├─ Upsert to MySQL (handle conflicts)
   ├─ Mark as synced (synced=1) on success
   └─ Log errors, maintain offline state
```

### File Upload Strategies
```
File Size Based Strategy Selection:
├─ < 10MB: Direct buffer upload
├─ 10MB-100MB: Streaming upload with progress
└─ > 100MB: Chunked upload (1MB chunks)

Chunked Upload Process:
1. initializeChunkedUpload() → uploadId
2. Loop: uploadChunk(uploadId, chunk, index)
3. finalizeChunkedUpload(uploadId) → file record
4. saveFile() to database with metadata
```

### Retry & Error Handling
```
Network Errors:
├─ Connection timeout: 3 second timeout
├─ MySQL unavailable: Fall back to offline mode
├─ Sync failure: Queue for next sync cycle
└─ File upload error: Clean temp files, notify UI

Database Errors:
├─ SQLite schema issues: Auto-migrate with sync()
├─ Foreign key constraints: Handle gracefully
└─ Corruption: Force sync with backup logic
```

## Database Design

### SQLite Schema (Local Storage)
```sql
-- Notes table (SQLite-optimized)
CREATE TABLE "Notes" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "content" TEXT,
  "tags" TEXT DEFAULT '[]',        -- JSON stored as TEXT
  "createdAt" TEXT DEFAULT (datetime('now')),
  "updatedAt" TEXT DEFAULT (datetime('now')),
  "synced" INTEGER DEFAULT 0       -- 0=unsynced, 1=synced
);

-- Files table
CREATE TABLE "Files" (
  "id" TEXT PRIMARY KEY,
  "originalName" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "noteId" TEXT,
  "createdAt" TEXT DEFAULT (datetime('now')),
  "synced" INTEGER DEFAULT 0,
  FOREIGN KEY ("noteId") REFERENCES "Notes"("id") ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX "idx_notes_updated" ON "Notes"("updatedAt");
CREATE INDEX "idx_notes_synced" ON "Notes"("synced");
CREATE INDEX "idx_files_synced" ON "Files"("synced");
CREATE INDEX "idx_files_note" ON "Files"("noteId");
```

### MySQL Schema (Cloud Sync)
```sql
-- Notes table (MySQL-optimized)
CREATE TABLE `notes` (
  `id` CHAR(36) PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `content` TEXT,
  `tags` JSON,                     -- Native JSON type
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `synced` BOOLEAN DEFAULT FALSE,
  INDEX `idx_updated` (`updatedAt`),
  INDEX `idx_synced` (`synced`)
) ENGINE=InnoDB;

-- Files table
CREATE TABLE `files` (
  `id` CHAR(36) PRIMARY KEY,
  `originalName` VARCHAR(255) NOT NULL,
  `fileName` VARCHAR(255) NOT NULL,
  `filePath` VARCHAR(500) NOT NULL,
  `fileSize` BIGINT NOT NULL,
  `mimeType` VARCHAR(100) NOT NULL,
  `noteId` CHAR(36),
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `synced` BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (`noteId`) REFERENCES `notes`(`id`) ON DELETE SET NULL,
  INDEX `idx_synced` (`synced`),
  INDEX `idx_note` (`noteId`)
) ENGINE=InnoDB;
```

### Migration Strategy
```javascript
// Sequelize auto-migration on startup
await this.sqliteSequelize.sync({ force: false, alter: true });
await this.mysqlSequelize.sync();

// Data type mapping between SQLite/MySQL
const convertSQLiteToMySQL = (data) => ({
  ...data,
  createdAt: new Date(data.createdAt),    // TEXT → DATETIME
  updatedAt: new Date(data.updatedAt),
  tags: JSON.parse(data.tags),            // TEXT → JSON
  synced: Boolean(data.synced)            // INTEGER → BOOLEAN
});
```

## Storage & File Handling

### Directory Structure
```
project-root/
├── data/
│   └── offline.db              # SQLite database file
├── uploads/                    # Permanent file storage
│   ├── {uuid}.pdf
│   ├── {uuid}.png
│   └── ...
├── temp/                       # Temporary upload chunks
│   ├── {uploadId}_{filename}
│   └── ...
└── src/
    ├── server/
    │   ├── database.js         # Database manager
    │   ├── fileHandler.js      # File operations
    │   └── main.js            # IPC handlers
    └── client/                # React components
```

### File Storage Strategy
```javascript
// File naming: UUID + original extension
const fileName = `${uuidv4()}${path.extname(originalName)}`;
const filePath = path.join(uploadsDir, fileName);

// Streaming vs Buffering Decision Matrix:
if (fileSize < 10 * 1024 * 1024) {           // < 10MB
  return saveFile(buffer);                    // Buffer in memory
} else if (fileSize < 100 * 1024 * 1024) {   // 10-100MB
  return saveFileStream(path, progressCb);    // Stream with progress
} else {                                       // > 100MB
  return initializeChunkedUpload();           // Chunk-based upload
}
```

### Cleanup Rules
```javascript
// Temp file cleanup
setTimeout(() => {
  fs.unlink(tempPath).catch(console.error);
}, 30000); // Clean temp files after 30 seconds

// Failed upload cleanup
if (upload.status === 'failed' && upload.tempPath) {
  fs.unlink(upload.tempPath).catch(console.error);
}

// Active upload tracking cleanup
setTimeout(() => this.activeUploads.delete(uploadId), 30000);
```

## Security & Compliance

### Electron Security Configuration
```javascript
// BrowserWindow security settings
new BrowserWindow({
  webPreferences: {
    preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    nodeIntegration: false,        // Disable Node.js in renderer
    contextIsolation: true,        // Isolate contexts
    enableRemoteModule: false,     // Disable remote module
    webSecurity: true,             // Enable web security
    allowRunningInsecureContent: false
  }
});

// Content Security Policy (recommended addition)
// <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline';">
```

### Secure IPC Communication
```javascript
// Preload script - only expose necessary APIs
contextBridge.exposeInMainWorld('electronAPI', {
  // Input validation on all exposed methods
  createNote: (noteData) => {
    if (!noteData || typeof noteData.title !== 'string') {
      throw new Error('Invalid note data');
    }
    return ipcRenderer.invoke('create-note', noteData);
  }
});
```

### Database Encryption (Recommended Enhancement)
```javascript
// For SQLCipher implementation:
const Database = require('better-sqlite3');
const db = new Database('encrypted.db');
db.pragma('key = "your-encryption-key"');
db.pragma('cipher_compatibility = 4');
```

### Key Management (Recommended)
```javascript
// Using keytar for secure key storage
const keytar = require('keytar');

// Store encryption key in OS keychain
await keytar.setPassword('your-app', 'db-encryption', encryptionKey);
const key = await keytar.getPassword('your-app', 'db-encryption');
```

### File Permissions
```javascript
// Secure file permissions
const fs = require('fs');
fs.chmodSync(filePath, 0o600); // Owner read/write only
```

### Audit Logging (Recommended Enhancement)
```javascript
// Log all file operations and database changes
const auditLog = {
  timestamp: new Date().toISOString(),
  action: 'CREATE_NOTE',
  userId: getCurrentUser(),
  entityId: noteId,
  details: { title: noteData.title }
};
await logAuditEvent(auditLog);
```

### Compliance Mappings

**HIPAA Requirements:**
- ✅ Data encryption at rest (via SQLCipher)
- ✅ Access controls (OS-level file permissions)
- ✅ Audit logging (recommended implementation)
- ✅ Data integrity (SHA256 checksums)

**GDPR Requirements:**
- ✅ Data portability (JSON export capability)
- ✅ Right to deletion (note/file deletion)
- ✅ Data minimization (only necessary data stored)
- ⚠️ Need: Consent management system

**PCI DSS:**
- ✅ Secure data transmission (if applicable)
- ✅ Regular security testing (recommended)
- ✅ Secure file storage
- ⚠️ Need: Regular vulnerability scans

## IPC & API Contracts

### IPC Channel Definitions

**Database Operations:**
```javascript
// Channel: 'get-database-status'
Request: void
Response: {
  isOnline: boolean,
  networkConnected: boolean,
  sqliteConnected: boolean,
  mysqlConnected: boolean,
  message: string,
  timestamp: string
}

// Channel: 'create-note'
Request: {
  title: string,
  content?: string,
  tags?: string[]
}
Response: {
  id: string,
  title: string,
  content: string,
  tags: string[],
  createdAt: string,
  updatedAt: string,
  synced: number,
  files?: FileRecord[]
}
```

**File Operations:**
```javascript
// Channel: 'upload-file-stream'
Request: {
  filePath: string,
  originalName: string,
  mimeType: string,
  noteId?: string
}
Response: {
  id: string,
  originalName: string,
  fileName: string,
  filePath: string,
  fileSize: number,
  mimeType: string,
  hash: string,
  createdAt: string
}

// Progress Events: 'upload-progress'
Event: {
  uploadId: string,
  fileName: string,
  progress: number,      // 0-100
  uploadedSize: number,
  totalSize: number
}
```

**Input Validation Rules:**
```javascript
// Note validation
const validateNote = (noteData) => {
  if (!noteData || typeof noteData !== 'object') {
    throw new Error('Note data must be an object');
  }
  if (!noteData.title || typeof noteData.title !== 'string') {
    throw new Error('Note title is required and must be a string');
  }
  if (noteData.title.length > 255) {
    throw new Error('Note title must be less than 255 characters');
  }
  if (noteData.content && typeof noteData.content !== 'string') {
    throw new Error('Note content must be a string');
  }
  if (noteData.tags && !Array.isArray(noteData.tags)) {
    throw new Error('Note tags must be an array');
  }
};

// File validation
const validateFile = (fileData) => {
  if (!fileData.originalName || typeof fileData.originalName !== 'string') {
    throw new Error('Original filename is required');
  }
  if (!fileData.mimeType || typeof fileData.mimeType !== 'string') {
    throw new Error('MIME type is required');
  }
  if (fileData.fileSize && (typeof fileData.fileSize !== 'number' || fileData.fileSize < 0)) {
    throw new Error('File size must be a positive number');
  }
};
```

**Handler Locations:**
- **Main Process**: `src/server/main.js` (setupIpcHandlers function)
- **Preload**: `src/preload.js` (contextBridge exposures)
- **Renderer**: React components use `window.electronAPI.*`

## Code Snippets

### 1. Opening Encrypted SQLite with SQLCipher
```javascript
// src/server/database.js - Enhanced with encryption
const Database = require('better-sqlite3');
const keytar = require('keytar');

class SecureDatabaseManager {
  async initializeEncryptedSQLite() {
    const dbPath = path.join(__dirname, '..', '..', 'data', 'offline.db');
    
    // Retrieve encryption key from OS keychain
    let encryptionKey = await keytar.getPassword('file-upload-app', 'db-encryption');
    
    if (!encryptionKey) {
      // Generate new key for first-time setup
      encryptionKey = crypto.randomBytes(32).toString('hex');
      await keytar.setPassword('file-upload-app', 'db-encryption', encryptionKey);
    }
    
    // Initialize encrypted database
    const db = new Database(dbPath);
    db.pragma(`key = "${encryptionKey}"`);
    db.pragma('cipher_compatibility = 4');
    
    // Configure SQLite performance settings
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    
    // Test encryption by creating a simple table
    try {
      db.exec('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY)');
      db.exec('DROP TABLE test');
      console.log('Encrypted SQLite database initialized successfully');
    } catch (error) {
      throw new Error('Failed to initialize encrypted database: ' + error.message);
    }
    
    return db;
  }
}
```

### 2. Streaming File Upload with Resume & SHA256 Integrity
```javascript
// src/server/fileHandler.js - Enhanced streaming with integrity
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

class SecureFileHandler extends FileHandler {
  async saveFileStreamWithIntegrity(sourcePath, originalName, mimeType, progressCallback) {
    const fileExtension = path.extname(originalName);
    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(this.uploadsDir, fileName);
    const resumeMarker = filePath + '.resume';
    
    try {
      const sourceStats = await fs.stat(sourcePath);
      const fileSize = sourceStats.size;
      
      // Check for existing partial upload
      let resumeOffset = 0;
      let existingHash = crypto.createHash('sha256');
      
      try {
        const resumeData = JSON.parse(await fs.readFile(resumeMarker, 'utf8'));
        resumeOffset = resumeData.offset;
        
        // Verify existing partial file
        if (await fs.access(filePath).then(() => true).catch(() => false)) {
          const partialStats = await fs.stat(filePath);
          if (partialStats.size === resumeOffset) {
            // Restore hash state for existing data
            const existingData = await fs.readFile(filePath);
            existingHash.update(existingData);
            console.log(`Resuming upload from ${resumeOffset} bytes`);
          } else {
            resumeOffset = 0; // Size mismatch, restart
          }
        }
      } catch (error) {
        resumeOffset = 0; // No valid resume data
      }
      
      const hash = existingHash;
      let uploadedSize = resumeOffset;
      const uploadId = uuidv4();
      
      // Track upload progress
      this.activeUploads.set(uploadId, {
        fileName: originalName,
        totalSize: fileSize,
        uploadedSize: resumeOffset,
        resumeOffset,
        status: 'uploading'
      });
      
      // Create read stream starting from resume point
      const readStream = createReadStream(sourcePath, { start: resumeOffset });
      const writeStream = createWriteStream(filePath, { flags: resumeOffset ? 'a' : 'w' });
      
      await pipeline(
        readStream,
        async function* (source) {
          for await (const chunk of source) {
            hash.update(chunk);
            uploadedSize += chunk.length;
            
            // Update progress
            const upload = this.activeUploads.get(uploadId);
            if (upload) {
              upload.uploadedSize = uploadedSize;
              
              // Save resume state every 1MB
              if (uploadedSize % (1024 * 1024) === 0) {
                await fs.writeFile(resumeMarker, JSON.stringify({
                  offset: uploadedSize,
                  timestamp: Date.now()
                }));
              }
              
              if (progressCallback) {
                progressCallback({
                  uploadId,
                  fileName: originalName,
                  progress: (uploadedSize / fileSize) * 100,
                  uploadedSize,
                  totalSize: fileSize,
                  resumed: resumeOffset > 0
                });
              }
            }
            
            yield chunk;
          }
        }.bind(this),
        writeStream
      );
      
      const fileHash = hash.digest('hex');
      
      // Verify file integrity
      const finalStats = await fs.stat(filePath);
      if (finalStats.size !== fileSize) {
        throw new Error('File size mismatch after upload');
      }
      
      // Clean up resume marker
      await fs.unlink(resumeMarker).catch(() => {});
      
      // Set secure file permissions
      await fs.chmod(filePath, 0o600);
      
      return {
        uploadId,
        originalName,
        fileName,
        filePath,
        fileSize: finalStats.size,
        mimeType,
        hash: fileHash,
        integrity: 'sha256-' + fileHash
      };
      
    } catch (error) {
      // Clean up on error
      await fs.unlink(filePath).catch(() => {});
      await fs.unlink(resumeMarker).catch(() => {});
      throw error;
    }
  }
}
```

### 3. Applying Aspose License
```javascript
// src/server/asposeManager.js - Document processing with Aspose
const aspose = require('aspose.words');

class AsposeManager {
  constructor() {
    this.isLicensed = false;
    this.initializeLicense();
  }
  
  async initializeLicense() {
    try {
      // Load license from secure location
      const keytar = require('keytar');
      const licenseKey = await keytar.getPassword('file-upload-app', 'aspose-license');
      
      if (licenseKey) {
        const license = new aspose.License();
        license.setLicense(licenseKey);
        this.isLicensed = true;
        console.log('Aspose license applied successfully');
      } else {
        console.warn('Aspose license not found - using evaluation mode');
      }
    } catch (error) {
      console.error('Failed to apply Aspose license:', error);
    }
  }
  
  async processDocument(filePath, outputFormat = 'pdf') {
    if (!this.isLicensed) {
      console.warn('Operating in Aspose evaluation mode');
    }
    
    try {
      const doc = new aspose.Document(filePath);
      
      // Configure save options based on format
      let saveOptions;
      switch (outputFormat.toLowerCase()) {
        case 'pdf':
          saveOptions = new aspose.PdfSaveOptions();
          saveOptions.setJpegQuality(90);
          break;
        case 'docx':
          saveOptions = new aspose.DocxSaveOptions();
          break;
        default:
          throw new Error('Unsupported output format: ' + outputFormat);
      }
      
      const outputPath = filePath.replace(path.extname(filePath), `.${outputFormat}`);
      doc.save(outputPath, saveOptions);
      
      return {
        originalPath: filePath,
        outputPath,
        format: outputFormat,
        processed: true
      };
      
    } catch (error) {
      console.error('Document processing failed:', error);
      throw new Error('Failed to process document: ' + error.message);
    }
  }
}

module.exports = new AsposeManager();
```

### 4. Safe IPC Exposure in Preload.js
```javascript
// src/preload.js - Enhanced security with validation
const { contextBridge, ipcRenderer } = require('electron');

// Input sanitization helpers
const sanitizeString = (str, maxLength = 1000) => {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLength).replace(/[<>]/g, '');
};

const validateFileData = (fileData) => {
  const errors = [];
  if (!fileData || typeof fileData !== 'object') {
    errors.push('File data must be an object');
  }
  if (!fileData.name || typeof fileData.name !== 'string') {
    errors.push('File name is required');
  }
  if (fileData.size && (typeof fileData.size !== 'number' || fileData.size < 0)) {
    errors.push('File size must be a positive number');
  }
  if (fileData.size > 500 * 1024 * 1024) { // 500MB limit
    errors.push('File size exceeds maximum limit (500MB)');
  }
  return errors;
};

// Rate limiting for IPC calls
const rateLimiter = new Map();
const checkRateLimit = (operation, limit = 10, window = 60000) => {
  const key = `${operation}-${Date.now() - (Date.now() % window)}`;
  const count = rateLimiter.get(key) || 0;
  if (count >= limit) {
    throw new Error(`Rate limit exceeded for ${operation}`);
  }
  rateLimiter.set(key, count + 1);
};

contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations with validation
  createNote: async (noteData) => {
    checkRateLimit('createNote', 20);
    
    if (!noteData || typeof noteData !== 'object') {
      throw new Error('Note data is required');
    }
    
    const sanitizedData = {
      title: sanitizeString(noteData.title, 255),
      content: sanitizeString(noteData.content, 10000),
      tags: Array.isArray(noteData.tags) ? 
        noteData.tags.slice(0, 10).map(tag => sanitizeString(tag, 50)) : []
    };
    
    if (!sanitizedData.title.trim()) {
      throw new Error('Note title is required');
    }
    
    return ipcRenderer.invoke('create-note', sanitizedData);
  },
  
  // File operations with validation
  uploadFile: async (fileData, noteId) => {
    checkRateLimit('uploadFile', 5);
    
    const validationErrors = validateFileData(fileData);
    if (validationErrors.length > 0) {
      throw new Error('Validation failed: ' + validationErrors.join(', '));
    }
    
    if (noteId && typeof noteId !== 'string') {
      throw new Error('Note ID must be a string');
    }
    
    return ipcRenderer.invoke('upload-file', fileData, noteId);
  },
  
  // Secure event listeners with cleanup
  onUploadProgress: (callback) => {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    
    const wrappedCallback = (event, data) => {
      try {
        // Validate progress data
        if (data && typeof data.progress === 'number' && data.progress >= 0 && data.progress <= 100) {
          callback(event, data);
        }
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    };
    
    ipcRenderer.on('upload-progress', wrappedCallback);
    return () => ipcRenderer.removeListener('upload-progress', wrappedCallback);
  },
  
  // Utility functions (client-side only, no IPC)
  formatFileSize: (bytes) => {
    if (typeof bytes !== 'number' || bytes < 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },
  
  // Security utilities
  sanitizeHtml: (html) => {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  }
});

// Clean up rate limiter periodically
setInterval(() => {
  const now = Date.now();
  for (const [key] of rateLimiter) {
    const timestamp = parseInt(key.split('-').pop());
    if (now - timestamp > 120000) { // Clean up entries older than 2 minutes
      rateLimiter.delete(key);
    }
  }
}, 60000);
```

## Operational Procedures

### Local Development Commands
```bash
# Initial setup
npm install
npm start                    # Start development server

# Database operations
sqlite3 data/offline.db ".schema"              # View SQLite schema
sqlite3 data/offline.db ".dump" > backup.sql   # Backup SQLite
sqlite3 data/offline.db < backup.sql           # Restore SQLite

# MySQL operations (if running locally)
mysqldump -u root -p notes_app > mysql_backup.sql
mysql -u root -p notes_app < mysql_backup.sql

# File system operations
find uploads/ -name "*.tmp" -delete           # Clean temp files
du -sh uploads/                               # Check upload directory size
```

### Build & Release Process
```bash
# Package for distribution
npm run package             # Create distributable packages
npm run make                # Create installers

# Code signing (production)
export CSC_LINK="path/to/certificate.p12"
export CSC_KEY_PASSWORD="certificate_password"
npm run make

# Release to distribution platforms
npm run publish             # Publish to configured platforms
```

### Database Backup & Restore
```javascript
// Automated backup script
const backupDatabase = async () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `backups/offline-${timestamp}.db`;
  
  await fs.copyFile('data/offline.db', backupPath);
  console.log('Database backed up to:', backupPath);
};

// Schedule daily backups
setInterval(backupDatabase, 24 * 60 * 60 * 1000);
```

### Migration Procedures
```javascript
// Database schema migration
const runMigrations = async () => {
  const migrations = [
    {
      version: '1.1.0',
      sql: 'ALTER TABLE Notes ADD COLUMN priority INTEGER DEFAULT 1'
    },
    {
      version: '1.2.0',
      sql: 'CREATE INDEX idx_notes_priority ON Notes(priority)'
    }
  ];
  
  for (const migration of migrations) {
    try {
      await db.exec(migration.sql);
      console.log(`Migration ${migration.version} completed`);
    } catch (error) {
      console.error(`Migration ${migration.version} failed:`, error);
    }
  }
};
```

## Monitoring, Logging & Troubleshooting

### Local Logging Strategy
```javascript
// Enhanced logging with rotation
const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: path.join(__dirname, '..', 'logs', 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: path.join(__dirname, '..', 'logs', 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Usage in database operations
const dbLogger = logger.child({ service: 'database' });
dbLogger.info('Database operation', { 
  operation: 'createNote', 
  noteId: note.id,
  duration: Date.now() - startTime 
});
```

### Backend Sync Logging
```javascript
// Sync to remote logging service (when online)
const syncLogsToBackend = async () => {
  try {
    const logs = await fs.readFile('logs/combined.log', 'utf8');
    const logEntries = logs.split('\n')
      .filter(line => line.trim())
      .slice(-100) // Last 100 entries
      .map(line => JSON.parse(line));
    
    await fetch('https://your-api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: logEntries })
    });
  } catch (error) {
    console.error('Failed to sync logs:', error);
  }
};

// Sync logs every hour when online
setInterval(syncLogsToBackend, 60 * 60 * 1000);
```

### Common Failure Modes & Fixes

**1. Database Corruption**
```javascript
// Detection and recovery
const checkDatabaseIntegrity = async () => {
  try {
    await db.exec('PRAGMA integrity_check');
    return true;
  } catch (error) {
    logger.error('Database integrity check failed', { error });
    return false;
  }
};

// Recovery procedure
const recoverDatabase = async () => {
  logger.warn('Attempting database recovery');
  try {
    // Try to backup current data
    await fs.copyFile('data/offline.db', `data/offline-corrupt-${Date.now()}.db`);
    
    // Recreate database from scratch
    await databaseManager.sqliteSequelize.sync({ force: true });
    logger.info('Database recovery completed');
  } catch (error) {
    logger.error('Database recovery failed', { error });
    throw error;
  }
};
```

**2. File Upload Failures**
```javascript
// Upload retry mechanism with exponential backoff
const retryUpload = async (uploadFunction, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await uploadFunction();
    } catch (error) {
      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
      logger.warn(`Upload attempt ${attempt} failed, retrying in ${delay}ms`, { error });
      
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};
```

**3. Sync Conflicts**
```javascript
// Conflict resolution strategy
const resolveConflict = (localData, remoteData) => {
  // Last-write-wins with timestamp comparison
  const localTime = new Date(localData.updatedAt);
  const remoteTime = new Date(remoteData.updatedAt);
  
  if (localTime > remoteTime) {
    logger.info('Conflict resolved: local version is newer', { 
      noteId: localData.id,
      localTime,
      remoteTime 
    });
    return localData;
  } else {
    logger.info('Conflict resolved: remote version is newer', { 
      noteId: localData.id,
      localTime,
      remoteTime 
    });
    return remoteData;
  }
};
```

## Performance & Scalability Considerations

### Large File Upload Optimization
```javascript
// Memory-efficient chunk processing
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
const MAX_CONCURRENT_CHUNKS = 3;

const uploadLargeFileOptimized = async (filePath, progressCallback) => {
  const fileSize = (await fs.stat(filePath)).size;
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
  const semaphore = new Semaphore(MAX_CONCURRENT_CHUNKS);
  
  const chunkPromises = [];
  for (let i = 0; i < totalChunks; i++) {
    chunkPromises.push(
      semaphore.acquire().then(async (release) => {
        try {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, fileSize);
          const chunk = await fs.readFile(filePath, { start, end });
          
          await uploadChunk(chunk, i);
          progressCallback({ completed: i + 1, total: totalChunks });
        } finally {
          release();
        }
      })
    );
  }
  
  await Promise.all(chunkPromises);
};
```

### Database Performance Tuning
```javascript
// SQLite optimization settings
const optimizeSQLite = async (db) => {
  await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = 10000;
    PRAGMA temp_store = memory;
    PRAGMA mmap_size = 268435456;
  `);
};

// Batch operations for sync
const batchSyncOperations = async (items, batchSize = 100) => {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await db.transaction(async (tx) => {
      for (const item of batch) {
        await tx.run('INSERT OR REPLACE INTO notes VALUES (?, ?, ?)', [
          item.id, item.title, item.content
        ]);
      }
    });
  }
};
```

### Memory Management
```javascript
// Monitor memory usage
const monitorMemoryUsage = () => {
  const usage = process.memoryUsage();
  if (usage.heapUsed > 500 * 1024 * 1024) { // 500MB threshold
    logger.warn('High memory usage detected', {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB'
    });
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
};

setInterval(monitorMemoryUsage, 30000); // Check every 30 seconds
```

### Connection Pooling
```javascript
// MySQL connection pool configuration
const mysqlPool = new Sequelize('notes_app', 'root', 'password', {
  host: 'localhost',
  dialect: 'mysql',
  pool: {
    max: 10,      // Maximum connections
    min: 2,       // Minimum connections
    acquire: 30000, // Maximum time to get connection
    idle: 10000,  // Maximum idle time
    evict: 60000  // Check for idle connections every minute
  }
});
```

## Checklist for Auditors / Compliance

### Security Audit Checklist
- [ ] **Encryption at Rest**: SQLCipher implementation with secure key management
- [ ] **Encryption in Transit**: TLS/HTTPS for all remote communications
- [ ] **Access Controls**: File permissions set to 0600 (owner only)
- [ ] **Input Validation**: All user inputs sanitized and validated
- [ ] **SQL Injection Prevention**: Parameterized queries via Sequelize ORM
- [ ] **XSS Prevention**: Content Security Policy implemented
- [ ] **Code Signing**: Application binaries signed with valid certificates
- [ ] **Dependency Scanning**: Regular npm audit and vulnerability scans

### Data Protection Checklist
- [ ] **Data Minimization**: Only necessary data collected and stored
- [ ] **Data Retention**: Automated cleanup of old temp files and logs
- [ ] **Data Portability**: JSON export functionality for user data
- [ ] **Right to Deletion**: Complete data removal capability
- [ ] **Consent Management**: User consent tracking for data processing
- [ ] **Breach Notification**: Automated detection and notification procedures

### Operational Security Checklist
- [ ] **Audit Logging**: All operations logged with timestamps and user context
- [ ] **Log Protection**: Logs stored securely and tamper-evident
- [ ] **Backup Procedures**: Regular automated backups with integrity checks
- [ ] **Incident Response**: Documented procedures for security incidents
- [ ] **Updates & Patches**: Automated update mechanism for security patches
- [ ] **Multi-Factor Authentication**: MFA for administrative functions

### Compliance Documentation
- [ ] **Business Associate Agreements (BAAs)**: For HIPAA compliance
- [ ] **Standard Contractual Clauses (SCCs)**: For GDPR international transfers
- [ ] **Privacy Impact Assessment (PIA)**: Completed and reviewed annually
- [ ] **Penetration Testing**: Annual third-party security assessments
- [ ] **Staff Training**: Security awareness training for all personnel
- [ ] **Vendor Management**: Security assessments for all third-party services

## References & Further Reading

### Official Documentation
- [Electron Security Guidelines](https://www.electronjs.org/docs/tutorial/security)
- [Sequelize Documentation](https://sequelize.org/docs/v6/)
- [SQLite Optimization Guide](https://www.sqlite.org/optoverview.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

### Security Resources
- [OWASP Electron Security Checklist](https://owasp.org/www-project-electron-application-security/)
- [SQLCipher Documentation](https://www.zetetic.net/sqlcipher/documentation/)
- [Content Security Policy Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

### Performance & Monitoring
- [Node.js Performance Monitoring](https://nodejs.org/en/docs/guides/simple-profiling/)
- [SQLite Performance Tuning](https://www.sqlite.org/fasterthanfs.html)
- [Electron Performance Best Practices](https://www.electronjs.org/docs/tutorial/performance)

### Compliance Resources
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [GDPR Developer Guide](https://gdpr.eu/developers/)
- [PCI DSS Requirements](https://www.pcisecuritystandards.org/document_library)

### Key Commands Reference
```bash
# Development
npm start                                    # Start development server
npm run package                            # Build distributable
npm run make                               # Create installers

# Database Management
sqlite3 data/offline.db ".backup backup.db" # Backup SQLite
sqlite3 data/offline.db ".schema"          # View schema
sqlite3 data/offline.db "PRAGMA integrity_check;" # Check integrity

# Security
npm audit                                  # Check for vulnerabilities
npm audit fix                            # Fix known vulnerabilities
openssl req -x509 -newkey rsa:4096 -nodes # Generate test certificate

# Monitoring
du -sh uploads/                           # Check upload directory size
tail -f logs/combined.log                # Monitor application logs
ps aux | grep electron                   # Check Electron processes
```

This comprehensive overview provides a complete technical reference for understanding, maintaining, and auditing the Electron offline-first file upload system. The implementation prioritizes security, performance, and compliance while maintaining a robust offline-first architecture.
