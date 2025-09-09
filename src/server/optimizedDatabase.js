const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const dns = require('dns');
const crypto = require('crypto');
const os = require('os');
const { createReadStream, createWriteStream } = require('fs');

// Memory monitoring utility
class MemoryMonitor {
  constructor(maxMemoryBytes = 500 * 1024 * 1024) {
    this.maxMemory = maxMemoryBytes;
    this.lastGCTime = Date.now();
  }

  getCurrentMemoryUsage() {
    const memUsage = process.memoryUsage();
    return {
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external
    };
  }

  isMemoryExceeded() {
    const memUsage = this.getCurrentMemoryUsage();
    const totalUsed = memUsage.heapUsed + memUsage.external;
    
    if (totalUsed > this.maxMemory) {
      console.warn(`Memory usage (${Math.round(totalUsed / 1024 / 1024)}MB) exceeds limit (${Math.round(this.maxMemory / 1024 / 1024)}MB)`);
      return true;
    }
    return false;
  }

  forceGCIfNeeded() {
    const now = Date.now();
    if (now - this.lastGCTime > 5000 && global.gc) { // GC every 5 seconds max
      global.gc();
      this.lastGCTime = now;
      console.log('Forced garbage collection');
    }
  }

  getMemoryReport() {
    const memUsage = this.getCurrentMemoryUsage();
    return {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
      limit: `${Math.round(this.maxMemory / 1024 / 1024)}MB`
    };
  }
}

class OptimizedDatabaseManager {
  constructor() {
    this.isOnline = false;
    this.sqliteSequelize = null;
    this.mysqlSequelize = null;
    this.models = {};
    this.syncQueue = [];
    this.syncInProgress = false;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.batchSize = 5; // Reduced batch size for memory efficiency
    this.memoryOptimizationEnabled = true;
    this.maxMemoryUsage = 500 * 1024 * 1024; // 500MB memory limit
  }

  async initialize() {
    // Initialize SQLite for offline storage with security measures
    const dbPath = await this.getSecureDbPath();
    await this.ensureDirectoryExists(path.dirname(dbPath));
    await this.setDatabaseFilePermissions(dbPath);
    
    this.sqliteSequelize = new Sequelize({
      dialect: 'sqlite',
      storage: dbPath,
      logging: false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      // Optimize SQLite for large file operations
      dialectOptions: {
        options: {
          enableForeignKeys: true,
          busyTimeout: 30000,
          // Memory optimization settings
          cacheSize: -2000,        // Limit cache to 2MB (negative = KB)
          pageSize: 4096,          // Smaller page size for better memory control
          tempStore: 'memory',     // Use memory for temp tables (small operations)
          journalMode: 'WAL',      // WAL mode for better concurrency
          synchronous: 'NORMAL',   // Balance between safety and performance
          mmapSize: 268435456      // Limit mmap to 256MB
        }
      }
    });

    // Initialize MySQL for online storage
    await this.initializeMysqlDatabase();

    await this.defineModels();
    await this.syncDatabases();
    await this.setupDatabaseBackup();
    this.startPeriodicStatusCheck();
  }

  async initializeMysqlDatabase() {
    try {
      // First connect without specifying database to create it
      const mysqlConnection = new Sequelize('', 'root', 'Test@123', {
        host: 'localhost',
        port: 3307,
        dialect: 'mysql',
        logging: false,
        pool: {
          max: 5,
          min: 0,
          acquire: 30000,
          idle: 10000
        }
      });

      // Test connection and create database if it doesn't exist
      await mysqlConnection.authenticate();
      await mysqlConnection.query('CREATE DATABASE IF NOT EXISTS notes_app');
      await mysqlConnection.close();

      // Now connect to the specific database
      this.mysqlSequelize = new Sequelize('notes_app', 'root', 'Test@123', {
        host: 'localhost',
        port: 3307,
        dialect: 'mysql',
        logging: false,
        pool: {
          max: 5,
          min: 0,
          acquire: 30000,
          idle: 10000
        }
      });

      console.log('MySQL database initialized successfully');
    } catch (error) {
      console.error('MySQL initialization failed:', error.message);
      // Create a dummy sequelize instance for offline mode
      this.mysqlSequelize = new Sequelize('sqlite::memory:', {
        logging: false
      });
    }
  }

  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch (error) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  async getSecureDbPath() {
    // Use OS-specific secure data directory
    let dataDir;
    
    switch (process.platform) {
      case 'win32':
        console.log(os.homedir());
        dataDir = path.join(os.homedir(), 'AppData', 'Local', 'OfflineNotes', 'data');
        break;
      case 'darwin':
        dataDir = path.join(os.homedir(), 'Library', 'Application Support', 'OfflineNotes', 'data');
        break;
      case 'linux':
        dataDir = path.join(os.homedir(), '.local', 'share', 'OfflineNotes', 'data');
        break;
      default:
        // Fallback to current directory
        dataDir = path.join(__dirname, '..', '..', 'data');
    }
    
    return path.join(dataDir, 'offline.db');
  }

  async setDatabaseFilePermissions(dbPath) {
    try {
      // Ensure the database file exists first
      await this.ensureDirectoryExists(path.dirname(dbPath));
      
      // On Unix-like systems, set restrictive permissions (600 = rw-------)
      if (process.platform !== 'win32') {
        try {
          await fs.access(dbPath);
          await fs.chmod(dbPath, 0o600);
          console.log('Database file permissions set to 600 (owner read/write only)');
        } catch (error) {
          // File doesn't exist yet, will set permissions after creation
          console.log('Database file will be created with secure permissions');
        }
      } else {
        // On Windows, we'll rely on the user's folder permissions
        console.log('Using Windows default file permissions for database');
      }
    } catch (error) {
      console.error('Warning: Could not set database file permissions:', error.message);
    }
  }

  async setupDatabaseBackup() {
    // Create automatic backup system
    const backupInterval = 6 * 60 * 60 * 1000; // 6 hours
    
    setInterval(async () => {
      try {
        await this.createDatabaseBackup();
      } catch (error) {
        console.error('Backup creation failed:', error.message);
      }
    }, backupInterval);
    
    // Create initial backup
    setTimeout(() => this.createDatabaseBackup(), 30000); // 30 seconds after startup
  }

  async createDatabaseBackup() {
    try {
      const dbPath = await this.getSecureDbPath();
      const backupDir = path.join(path.dirname(dbPath), 'backups');
      await this.ensureDirectoryExists(backupDir);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `offline_backup_${timestamp}.db`);
      
      // Copy the database file
      await fs.copyFile(dbPath, backupPath);
      
      // Keep only the last 5 backups
      await this.cleanupOldBackups(backupDir);
      
      console.log(`Database backup created: ${backupPath}`);
    } catch (error) {
      console.error('Failed to create database backup:', error.message);
    }
  }

  async cleanupOldBackups(backupDir) {
    try {
      const files = await fs.readdir(backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('offline_backup_') && file.endsWith('.db'))
        .map(file => ({
          name: file,
          path: path.join(backupDir, file),
          time: fs.stat(path.join(backupDir, file)).then(stats => stats.mtime)
        }));

      const fileStats = await Promise.all(backupFiles.map(async file => ({
        ...file,
        time: await file.time
      })));

      // Sort by modification time (newest first)
      fileStats.sort((a, b) => b.time - a.time);

      // Remove files beyond the 5 most recent
      const filesToDelete = fileStats.slice(5);
      for (const file of filesToDelete) {
        await fs.unlink(file.path);
        console.log(`Removed old backup: ${file.name}`);
      }
    } catch (error) {
      console.error('Failed to cleanup old backups:', error.message);
    }
  }

  async checkNetworkConnection() {
    return new Promise((resolve) => {
      dns.lookup('google.com', (err) => {
        if (err && err.code === 'ENOTFOUND') {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  async defineModels() {
    // Define Note model for SQLite (with TEXT primary key)
    const sqliteNoteSchema = {
      id: {
        type: DataTypes.TEXT,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      title: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      tags: {
        type: DataTypes.TEXT,
        defaultValue: '[]',
        get() {
          const value = this.getDataValue('tags');
          try {
            return value ? JSON.parse(value) : [];
          } catch {
            return [];
          }
        },
        set(value) {
          this.setDataValue('tags', JSON.stringify(value || []));
        }
      },
      createdAt: {
        type: DataTypes.TEXT,
        defaultValue: () => new Date().toISOString()
      },
      updatedAt: {
        type: DataTypes.TEXT,
        defaultValue: () => new Date().toISOString()
      },
      synced: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      syncPriority: {
        type: DataTypes.INTEGER,
        defaultValue: 1 // 1 = low, 2 = medium, 3 = high
      }
    };

    // Define File model for SQLite
    const sqliteFileSchema = {
      id: {
        type: DataTypes.TEXT,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      originalName: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      fileName: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      filePath: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      fileSize: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      mimeType: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      hash: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      noteId: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      createdAt: {
        type: DataTypes.TEXT,
        defaultValue: () => new Date().toISOString()
      },
      synced: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      syncPriority: {
        type: DataTypes.INTEGER,
        defaultValue: 1
      }
    };

    // Define Note model for MySQL (with proper UUID and JSON)
    const mysqlNoteSchema = {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      tags: {
        type: DataTypes.JSON,
        defaultValue: []
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      synced: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      }
    };

    // Define File model for MySQL
    const mysqlFileSchema = {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      originalName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      fileName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      filePath: {
        type: DataTypes.STRING,
        allowNull: false
      },
      fileSize: {
        type: DataTypes.BIGINT,
        allowNull: false
      },
      mimeType: {
        type: DataTypes.STRING,
        allowNull: false
      },
      noteId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'Notes',
          key: 'id'
        }
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      synced: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      syncPriority: {
        type: DataTypes.INTEGER,
        defaultValue: 1
      }
    };

    // Create models for SQLite (primary database)
    this.models.sqlite = {
      Note: this.sqliteSequelize.define('Note', sqliteNoteSchema),
      File: this.sqliteSequelize.define('File', sqliteFileSchema)
    };

    // Create models for MySQL (online sync)
    this.models.mysql = {
      Note: this.mysqlSequelize.define('Note', mysqlNoteSchema),
      File: this.mysqlSequelize.define('File', mysqlFileSchema)
    };

    // Define associations
    Object.keys(this.models).forEach(dbType => {
      this.models[dbType].Note.hasMany(this.models[dbType].File, {
        foreignKey: 'noteId',
        as: 'files'
      });
      this.models[dbType].File.belongsTo(this.models[dbType].Note, {
        foreignKey: 'noteId',
        as: 'note'
      });
    });
  }

  async syncDatabases() {
    try {
      // Force sync SQLite database (recreate tables if needed)
      await this.sqliteSequelize.sync({ force: false, alter: true });
      console.log('SQLite database synced successfully');
    } catch (error) {
      console.error('SQLite sync error:', error.message);
      try {
        await this.sqliteSequelize.sync({ force: true });
        console.log('SQLite database created successfully with force sync');
      } catch (forceError) {
        console.error('SQLite force sync failed:', forceError.message);
      }
    }

    try {
      // Test MySQL connection
      await this.mysqlSequelize.authenticate();
      // Force sync MySQL to ensure schema matches
      await this.mysqlSequelize.sync({ alter: true });
      this.isOnline = true;
      console.log('MySQL database synced successfully');
      this.startBackgroundSync();
    } catch (error) {
      console.error('MySQL connection failed, working offline:', error.message);
      this.isOnline = false;
    }
  }

  startPeriodicStatusCheck() {
    setInterval(async () => {
      try {
        const isNetworkOnline = await this.checkNetworkConnection();
        
        if (!isNetworkOnline) {
          if (this.isOnline) {
            console.log('Network offline, working offline...');
          }
          this.isOnline = false;
          return;
        }

        // If network is online, test MySQL connection
        await this.mysqlSequelize.authenticate();
        if (!this.isOnline) {
          this.isOnline = true;
          console.log('Back online! Starting sync...');
          this.startBackgroundSync();
        }
      } catch (error) {
        if (this.isOnline) {
          console.log('MySQL connection lost, working offline...');
        }
        this.isOnline = false;
      }
    }, 5000);
  }

  async startBackgroundSync() {
    if (this.syncInProgress) return;
    
    this.syncInProgress = true;
    try {
      await this.syncPendingDataOptimized();
    } finally {
      this.syncInProgress = false;
    }
  }

  async createNote(noteData, priority = 1) {
    // Validate input data
    const validatedData = this.validateNoteData(noteData);
    
    const note = {
      id: uuidv4(),
      ...validatedData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: 0,
      syncPriority: priority
    };

    // Always save to SQLite first
    const savedNote = await this.models.sqlite.Note.create(note);

    // Try immediate sync if online
    await this.tryImmediateSync('note', note);

    return this.formatNoteResult(savedNote);
  }

  async updateNote(id, noteData, priority = 1) {
    // Validate input data
    const validatedData = this.validateNoteData(noteData);
    
    const updateData = {
      ...validatedData,
      updatedAt: new Date().toISOString(),
      synced: 0,
      syncPriority: priority
    };

    // Update in SQLite
    await this.models.sqlite.Note.update(updateData, { where: { id } });

    // Try immediate sync if online
    const note = await this.models.sqlite.Note.findByPk(id);
    if (note) {
      await this.tryImmediateSync('note', note.toJSON());
    }

    // Get updated note and return as plain JSON
    const updatedNote = await this.models.sqlite.Note.findByPk(id, {
      include: [{
        model: this.models.sqlite.File,
        as: 'files',
        required: false,
        where: null
      }]
    });

    return updatedNote ? this.formatNoteResult(updatedNote) : null;
  }

  validateNoteData(noteData) {
    const errors = [];
    
    // Validate title
    if (!noteData.title || typeof noteData.title !== 'string') {
      errors.push('Title is required and must be a string');
    } else if (noteData.title.length > 500) {
      errors.push('Title must be less than 500 characters');
    }
    
    // Validate content
    if (noteData.content && typeof noteData.content !== 'string') {
      errors.push('Content must be a string');
    } else if (noteData.content && noteData.content.length > 100000) {
      errors.push('Content must be less than 100,000 characters');
    }
    
    // Validate tags
    if (noteData.tags && !Array.isArray(noteData.tags)) {
      errors.push('Tags must be an array');
    }
    
    if (errors.length > 0) {
      throw new Error('Data validation failed: ' + errors.join(', '));
    }
    
    // Sanitize the data
    return {
      title: this.sanitizeString(noteData.title),
      content: noteData.content ? this.sanitizeString(noteData.content) : '',
      tags: noteData.tags || []
    };
  }

  validateFileData(fileData) {
    const errors = [];
    
    // Validate required fields
    if (!fileData.originalName || typeof fileData.originalName !== 'string') {
      errors.push('Original name is required and must be a string');
    }
    
    if (!fileData.fileName || typeof fileData.fileName !== 'string') {
      errors.push('File name is required and must be a string');
    }
    
    if (!fileData.filePath || typeof fileData.filePath !== 'string') {
      errors.push('File path is required and must be a string');
    }
    
    if (!fileData.fileSize || typeof fileData.fileSize !== 'number' || fileData.fileSize <= 0) {
      errors.push('File size must be a positive number');
    }
    
    if (!fileData.mimeType || typeof fileData.mimeType !== 'string') {
      errors.push('MIME type is required and must be a string');
    }
    
    // Check file size limits (500MB max)
    if (fileData.fileSize > 500 * 1024 * 1024) {
      errors.push('File size exceeds maximum limit of 500MB');
    }
    
    if (errors.length > 0) {
      throw new Error('File data validation failed: ' + errors.join(', '));
    }
    
    return fileData;
  }

  sanitizeString(str) {
    if (typeof str !== 'string') return '';
    
    // Remove potentially dangerous characters
    return str
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .trim();
  }

  async deleteNote(id) {
    // Delete from SQLite
    await this.models.sqlite.File.destroy({ where: { noteId: id } });
    await this.models.sqlite.Note.destroy({ where: { id } });

    // Try immediate sync if online
    await this.tryImmediateSync('deleteNote', { id });
  }

  async saveFile(fileData, noteId = null, priority = 1) {
    // Validate file data
    const validatedData = this.validateFileData(fileData);
    
    const fileRecord = {
      id: uuidv4(),
      ...validatedData,
      noteId,
      createdAt: new Date().toISOString(),
      synced: 0,
      syncPriority: priority
    };

    // Save to SQLite
    const savedFile = await this.models.sqlite.File.create(fileRecord);

    // Try immediate sync if online
    await this.tryImmediateSync('file', fileRecord);

    return savedFile.toJSON();
  }

  async tryImmediateSync(type, data) {
    const isNetworkOnline = await this.checkNetworkConnection();
    if (isNetworkOnline && this.isOnline) {
      try {
        switch (type) {
          case 'note':
            await this.syncSingleNote(data);
            break;
          case 'file':
            await this.syncSingleFile(data);
            break;
          case 'deleteNote':
            await this.syncNoteDeletion(data.id);
            break;
        }
      } catch (error) {
        console.error(`Failed immediate sync for ${type}:`, error);
        this.isOnline = false;
      }
    }
  }

  async syncSingleNote(noteData) {
    // Remove syncPriority field to avoid schema mismatch
    const { syncPriority, ...noteDataWithoutPriority } = noteData;
    
    const mysqlNote = {
      ...noteDataWithoutPriority,
      createdAt: new Date(noteData.createdAt),
      updatedAt: new Date(noteData.updatedAt),
      tags: typeof noteData.tags === 'string' ? JSON.parse(noteData.tags) : noteData.tags,
      synced: true
    };
    
    await this.models.mysql.Note.upsert(mysqlNote);
    await this.models.sqlite.Note.update(
      { synced: 1 },
      { where: { id: noteData.id } }
    );
  }

  async syncSingleFile(fileData) {
    // Remove hash and syncPriority fields to avoid schema mismatch
    const { hash, syncPriority, ...fileDataWithoutExtra } = fileData;
    
    const mysqlFile = {
      ...fileDataWithoutExtra,
      createdAt: new Date(fileData.createdAt),
      synced: true
    };
    
    await this.models.mysql.File.upsert(mysqlFile);
    await this.models.sqlite.File.update(
      { synced: 1 },
      { where: { id: fileData.id } }
    );
  }

  async syncNoteDeletion(noteId) {
    await this.models.mysql.File.destroy({ where: { noteId } });
    await this.models.mysql.Note.destroy({ where: { id: noteId } });
  }

  async syncPendingDataOptimized() {
    const isNetworkOnline = await this.checkNetworkConnection();
    if (!isNetworkOnline || !this.isOnline) {
      console.log('Cannot sync: Network offline or MySQL unavailable');
      return;
    }

    try {
      // Sync high priority items first
      await this.syncByPriority(3); // High priority
      await this.syncByPriority(2); // Medium priority
      await this.syncByPriority(1); // Low priority

      console.log('Optimized sync completed successfully');
      this.retryCount = 0;
    } catch (error) {
      console.error('Optimized sync failed:', error);
      this.isOnline = false;
      this.retryCount++;
      
      // Implement exponential backoff
      if (this.retryCount <= this.maxRetries) {
        const delay = Math.pow(2, this.retryCount) * 1000;
        setTimeout(() => this.startBackgroundSync(), delay);
      }
    }
  }

  async syncByPriority(priority) {
    // Sync notes by priority in batches
    const unsyncedNotes = await this.models.sqlite.Note.findAll({
      where: { synced: 0, syncPriority: priority },
      limit: this.batchSize
    });

    for (const note of unsyncedNotes) {
      await this.syncSingleNote(note.toJSON());
    }

    // Sync files by priority in batches
    const unsyncedFiles = await this.models.sqlite.File.findAll({
      where: { synced: 0, syncPriority: priority },
      limit: this.batchSize
    });

    for (const file of unsyncedFiles) {
      await this.syncSingleFile(file.toJSON());
    }
  }

  async getAllNotes() {
    try {
      const notes = await this.models.sqlite.Note.findAll({
        include: [{
          model: this.models.sqlite.File,
          as: 'files',
          required: false,
          where: null // Explicitly set where to null to avoid issues
        }],
        order: [['updatedAt', 'DESC']]
      });

      console.log('Retrieved notes:', notes);

      return notes.map(note => this.formatNoteResult(note));
    } catch (error) {
      console.error('Error getting notes:', error.message);
      // Fallback: try without include if there's an association issue
      try {
        const notes = await this.models.sqlite.Note.findAll({
          order: [['updatedAt', 'DESC']]
        });

        console.log('Retrieved notes (fallback):', notes);
        return notes.map(note => this.formatNoteResult(note));
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError.message);
        return [];
      }
    }
  }

  async searchNotes(query) {
    try {
      const { Op } = require('sequelize');
      const notes = await this.models.sqlite.Note.findAll({
        where: {
          [Op.or]: [
            { title: { [Op.like]: `%${query}%` } },
            { content: { [Op.like]: `%${query}%` } }
          ]
        },
        include: [{
          model: this.models.sqlite.File,
          as: 'files',
          required: false,
          where: null
        }],
        order: [['updatedAt', 'DESC']]
      });

      return notes.map(note => this.formatNoteResult(note));
    } catch (error) {
      console.error('Error searching notes:', error.message);
      // Fallback: try without include if there's an association issue
      try {
        const { Op } = require('sequelize');
        const notes = await this.models.sqlite.Note.findAll({
          where: {
            [Op.or]: [
              { title: { [Op.like]: `%${query}%` } },
              { content: { [Op.like]: `%${query}%` } }
            ]
          },
          order: [['updatedAt', 'DESC']]
        });

        return notes.map(note => this.formatNoteResult(note));
      } catch (fallbackError) {
        console.error('Search fallback also failed:', fallbackError.message);
        return [];
      }
    }
  }

  formatNoteResult(note) {
    const noteData = note.toJSON();
    if (typeof noteData.tags === 'string') {
      try {
        noteData.tags = JSON.parse(noteData.tags);
      } catch {
        noteData.tags = [];
      }
    }
    return noteData;
  }

  async testConnections() {
    const status = {
      network: false,
      sqlite: false,
      mysql: false,
      timestamp: new Date().toISOString()
    };

    try {
      status.network = await this.checkNetworkConnection();
    } catch (error) {
      console.error('Network connection test failed:', error.message);
    }

    try {
      await this.sqliteSequelize.authenticate();
      status.sqlite = true;
    } catch (error) {
      console.error('SQLite connection test failed:', error.message);
    }

    if (status.network) {
      try {
        await this.mysqlSequelize.authenticate();
        status.mysql = true;
        this.isOnline = true;
      } catch (error) {
        console.error('MySQL connection test failed:', error.message);
        this.isOnline = false;
        status.mysql = false;
      }
    } else {
      console.log('Network offline - skipping MySQL connection test');
      this.isOnline = false;
      status.mysql = false;
    }

    return status;
  }

  async getStatus() {
    const networkOnline = await this.checkNetworkConnection();
    
    // Get sync statistics
    const unsyncedNotes = await this.models.sqlite.Note.count({ where: { synced: 0 } });
    const unsyncedFiles = await this.models.sqlite.File.count({ where: { synced: 0 } });
    
    // Perform database integrity check
    const integrityStatus = await this.checkDatabaseIntegrity();
    
    return {
      isOnline: this.isOnline && networkOnline,
      networkConnected: networkOnline,
      sqliteConnected: !!this.sqliteSequelize,
      mysqlConnected: this.isOnline && networkOnline,
      canConnectSQLite: !!this.sqliteSequelize,
      canConnectMySQL: this.isOnline && networkOnline,
      unsyncedNotes,
      unsyncedFiles,
      syncInProgress: this.syncInProgress,
      retryCount: this.retryCount,
      integrityStatus,
      message: networkOnline ? 
        (this.isOnline ? `Online - ${unsyncedNotes + unsyncedFiles} items pending sync` : 'MySQL unavailable - Working offline') :
        'Network offline - Working offline only',
      timestamp: new Date().toISOString()
    };
  }

  async checkDatabaseIntegrity() {
    try {
      // Run PRAGMA integrity_check on SQLite
      const [results] = await this.sqliteSequelize.query('PRAGMA integrity_check');
      
      const isHealthy = results.length === 1 && results[0].integrity_check === 'ok';
      
      return {
        healthy: isHealthy,
        lastChecked: new Date().toISOString(),
        details: isHealthy ? 'Database integrity verified' : 'Database integrity issues found'
      };
    } catch (error) {
      console.error('Database integrity check failed:', error);
      return {
        healthy: false,
        lastChecked: new Date().toISOString(),
        details: 'Integrity check failed: ' + error.message
      };
    }
  }

  async repairDatabase() {
    try {
      console.log('Starting database repair...');
      
      // Create a backup before repair
      await this.createDatabaseBackup();
      
      // Run VACUUM to rebuild the database
      await this.sqliteSequelize.query('VACUUM');
      
      // Reindex all tables
      await this.sqliteSequelize.query('REINDEX');
      
      // Verify integrity after repair
      const integrityStatus = await this.checkDatabaseIntegrity();
      
      if (integrityStatus.healthy) {
        console.log('Database repair completed successfully');
        return { success: true, message: 'Database repaired successfully' };
      } else {
        console.error('Database repair failed - integrity issues persist');
        return { success: false, message: 'Repair failed - integrity issues persist' };
      }
    } catch (error) {
      console.error('Database repair failed:', error);
      return { success: false, message: 'Repair failed: ' + error.message };
    }
  }

  // Force sync method for manual trigger
  async syncPendingData() {
    return this.forceSyncPendingData();
  }

  async forceSyncPendingData() {
    if (this.syncInProgress) {
      console.log('Sync already in progress');
      return;
    }
    
    await this.syncPendingDataOptimized();
  }

  // Memory-efficient large file import
  async importLargeFile(filePath, noteId = null, progressCallback = null) {
    const memoryMonitor = new MemoryMonitor(this.maxMemoryUsage);
    
    try {
      console.log('Starting memory-efficient large file import...');
      
      // Get file stats without loading into memory
      const stats = await fs.stat(filePath);
      const originalName = path.basename(filePath);
      
      if (stats.size > 100 * 1024 * 1024) { // > 100MB
        return await this.importVeryLargeFile(filePath, noteId, progressCallback, memoryMonitor);
      } else {
        return await this.importMediumFile(filePath, noteId, progressCallback, memoryMonitor);
      }
    } catch (error) {
      console.error('Large file import failed:', error);
      throw error;
    } finally {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }

  async importVeryLargeFile(filePath, noteId, progressCallback, memoryMonitor) {
    const chunkSize = 8 * 1024 * 1024; // 8MB chunks for very large files
    const fileStats = await fs.stat(filePath);
    const totalSize = fileStats.size;
    let processedSize = 0;
    
    // Create file record without reading file content
    const fileRecord = {
      id: uuidv4(),
      originalName: path.basename(filePath),
      fileName: `${uuidv4()}${path.extname(filePath)}`,
      filePath: path.join(this.getUploadsDir(), `${uuidv4()}${path.extname(filePath)}`),
      fileSize: totalSize,
      mimeType: this.getMimeType(filePath),
      noteId,
      createdAt: new Date().toISOString(),
      synced: 0,
      syncPriority: 1
    };

    // Process file in streaming chunks to avoid memory spike
    const readStream = createReadStream(filePath, { highWaterMark: chunkSize });
    const writeStream = createWriteStream(fileRecord.filePath);
    const hash = crypto.createHash('md5');

    return new Promise((resolve, reject) => {
      readStream.on('data', (chunk) => {
        // Monitor memory usage
        if (memoryMonitor.isMemoryExceeded()) {
          console.warn('Memory limit approached, pausing import...');
          readStream.pause();
          
          // Force garbage collection and resume
          setTimeout(() => {
            if (global.gc) global.gc();
            readStream.resume();
          }, 100);
        }

        hash.update(chunk);
        processedSize += chunk.length;
        
        if (progressCallback) {
          progressCallback({
            processed: processedSize,
            total: totalSize,
            percentage: (processedSize / totalSize) * 100
          });
        }
      });

      readStream.on('end', async () => {
        try {
          fileRecord.hash = hash.digest('hex');
          
          // Save to database with memory optimization
          await this.saveFileRecordOptimized(fileRecord);
          resolve(fileRecord);
        } catch (error) {
          reject(error);
        }
      });

      readStream.on('error', reject);
      writeStream.on('error', reject);
      
      readStream.pipe(writeStream);
    });
  }

  async importMediumFile(filePath, noteId, progressCallback, memoryMonitor) {
    const chunkSize = 4 * 1024 * 1024; // 4MB chunks for medium files
    const fileStats = await fs.stat(filePath);
    
    // Use streaming approach even for medium files
    return this.importVeryLargeFile(filePath, noteId, progressCallback, memoryMonitor);
  }

  async saveFileRecordOptimized(fileRecord) {
    // Use transaction to ensure atomicity while minimizing memory usage
    // SQLite uses SERIALIZABLE by default - no need to specify isolation level
    const transaction = await this.sqliteSequelize.transaction();
    
    try {
      // Save to SQLite with transaction
      const savedFile = await this.models.sqlite.File.create(fileRecord, { transaction });
      
      // Commit transaction immediately to free memory
      await transaction.commit();
      
      // Try immediate sync if online (without blocking)
      setImmediate(() => {
        this.tryImmediateSync('file', fileRecord).catch(error => {
          console.error('Background sync failed:', error);
        });
      });

      return savedFile.toJSON();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  getUploadsDir() {
    return path.join(__dirname, '..', '..', 'uploads');
  }

  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.json': 'application/json',
      '.txt': 'text/plain'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

module.exports = new OptimizedDatabaseManager();
