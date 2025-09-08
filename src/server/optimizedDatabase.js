const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const dns = require('dns');

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
    this.batchSize = 10; // Sync in batches for better performance
  }

  async initialize() {
    // Initialize SQLite for offline storage
    const dbPath = path.join(__dirname, '..', '..', 'data', 'offline.db');
    await this.ensureDirectoryExists(path.dirname(dbPath));
    
    this.sqliteSequelize = new Sequelize({
      dialect: 'sqlite',
      storage: dbPath,
      logging: false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    });

    // Initialize MySQL for online storage
    await this.initializeMysqlDatabase();

    await this.defineModels();
    await this.syncDatabases();
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
      },
      syncPriority: {
        type: DataTypes.INTEGER,
        defaultValue: 1
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
      hash: {
        type: DataTypes.STRING,
        allowNull: true
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
      await this.mysqlSequelize.sync();
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
    const note = {
      id: uuidv4(),
      ...noteData,
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
    const updateData = {
      ...noteData,
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
      include: [{ model: this.models.sqlite.File, as: 'files', required: false }]
    });

    return updatedNote ? this.formatNoteResult(updatedNote) : null;
  }

  async deleteNote(id) {
    // Delete from SQLite
    await this.models.sqlite.File.destroy({ where: { noteId: id } });
    await this.models.sqlite.Note.destroy({ where: { id } });

    // Try immediate sync if online
    await this.tryImmediateSync('deleteNote', { id });
  }

  async saveFile(fileData, noteId = null, priority = 1) {
    const fileRecord = {
      id: uuidv4(),
      ...fileData,
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
    const mysqlNote = {
      ...noteData,
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
    const mysqlFile = {
      ...fileData,
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
          required: false
        }],
        order: [['updatedAt', 'DESC']]
      });
      
      return notes.map(note => this.formatNoteResult(note));
    } catch (error) {
      console.error('Error getting notes:', error.message);
      return [];
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
        include: [{ model: this.models.sqlite.File, as: 'files', required: false }],
        order: [['updatedAt', 'DESC']]
      });

      return notes.map(note => this.formatNoteResult(note));
    } catch (error) {
      console.error('Error searching notes:', error.message);
      return [];
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
      message: networkOnline ? 
        (this.isOnline ? `Online - ${unsyncedNotes + unsyncedFiles} items pending sync` : 'MySQL unavailable - Working offline') :
        'Network offline - Working offline only',
      timestamp: new Date().toISOString()
    };
  }

  // Force sync method for manual trigger
  async forceSyncPendingData() {
    if (this.syncInProgress) {
      console.log('Sync already in progress');
      return;
    }
    
    await this.syncPendingDataOptimized();
  }
}

module.exports = new OptimizedDatabaseManager();
