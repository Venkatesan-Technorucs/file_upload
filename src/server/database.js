const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

class DatabaseManager {
  constructor() {
    this.isOnline = false;
    this.sqliteSequelize = null;
    this.mysqlSequelize = null;
    this.models = {};
    this.syncQueue = [];
  }

  async initialize() {
    // Initialize SQLite for offline storage
    const dbPath = path.join(__dirname, '..', '..', 'data', 'offline.db');
    await this.ensureDirectoryExists(path.dirname(dbPath));
    
    this.sqliteSequelize = new Sequelize({
      dialect: 'sqlite',
      storage: dbPath,
      logging: false
    });

    // Initialize MySQL for online storage - first try to create database
    await this.initializeMysqlDatabase();

    await this.defineModels();
    await this.syncDatabases();
    this.checkOnlineStatus();
  }

  async initializeMysqlDatabase() {
    try {
      // First connect without specifying database to create it
      const mysqlConnection = new Sequelize('', 'root', 'Test@123', {
        host: 'localhost',
        port: 3306,
        dialect: 'mysql',
        logging: false
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
        logging: false
      });

      console.log('MySQL database initialized successfully');
    } catch (error) {
      console.error('MySQL initialization failed:', error.message);
      // Create a dummy sequelize instance for offline mode
      this.mysqlSequelize = new Sequelize('notes_app', 'root', 'Test@123', {
        host: 'localhost',
        port: 3307,
        dialect: 'mysql',
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
    try {
      // Use Node.js net module to check for network connectivity
      const net = require('net');
      
      return new Promise((resolve) => {
        const socket = new net.Socket();
        const timeout = 3000; // 3 second timeout
        
        socket.setTimeout(timeout);
        
        socket.on('connect', () => {
          socket.destroy();
          resolve(true);
        });
        
        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });
        
        socket.on('error', () => {
          socket.destroy();
          resolve(false);
        });
        
        // Try to connect to a reliable server (Google DNS)
        socket.connect(53, '8.8.8.8');
      });
    } catch (error) {
      return false;
    }
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
        type: DataTypes.TEXT, // Use TEXT instead of JSON for SQLite compatibility
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
      // Try creating database without foreign keys first
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
      this.syncPendingData();
    } catch (error) {
      console.error('MySQL connection failed, working offline:', error.message);
      this.isOnline = false;
    }
  }

  async checkOnlineStatus() {
    setInterval(async () => {
      try {
        // First check if desktop has internet connection
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
          await this.syncPendingData();
        }
      } catch (error) {
        if (this.isOnline) {
          console.log('MySQL connection lost, working offline...');
        }
        this.isOnline = false;
      }
    }, 5000); // Check every 5 seconds for more responsive status updates
  }

  async createNote(noteData) {
    const note = {
      id: uuidv4(),
      ...noteData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: 0
    };

    // Always save to SQLite first
    const savedNote = await this.models.sqlite.Note.create(note);

    // Check network connection and MySQL availability before syncing
    const isNetworkOnline = await this.checkNetworkConnection();
    if (isNetworkOnline && this.isOnline) {
      try {
        const mysqlNote = {
          ...note,
          createdAt: new Date(note.createdAt),
          updatedAt: new Date(note.updatedAt),
          synced: true
        };
        await this.models.mysql.Note.create(mysqlNote);
        await this.models.sqlite.Note.update(
          { synced: 1 },
          { where: { id: note.id } }
        );
        console.log('Note synced to MySQL successfully');
      } catch (error) {
        console.error('Failed to sync note to MySQL:', error);
        this.isOnline = false; // Update status if MySQL fails
      }
    } else {
      console.log('Network offline or MySQL unavailable - note saved locally only');
    }

    // Return plain JSON object
    const result = savedNote.toJSON();
    if (typeof result.tags === 'string') {
      try {
        result.tags = JSON.parse(result.tags);
      } catch {
        result.tags = [];
      }
    }
    return result;
  }

  async updateNote(id, noteData) {
    const updateData = {
      ...noteData,
      updatedAt: new Date().toISOString(),
      synced: 0
    };

    // Update in SQLite
    await this.models.sqlite.Note.update(updateData, { where: { id } });

    // Check network connection and MySQL availability before syncing
    const isNetworkOnline = await this.checkNetworkConnection();
    if (isNetworkOnline && this.isOnline) {
      try {
        const mysqlUpdateData = {
          ...updateData,
          updatedAt: new Date(updateData.updatedAt),
          synced: true
        };
        await this.models.mysql.Note.update(
          mysqlUpdateData,
          { where: { id } }
        );
        await this.models.sqlite.Note.update(
          { synced: 1 },
          { where: { id } }
        );
        console.log('Note update synced to MySQL successfully');
      } catch (error) {
        console.error('Failed to sync note update to MySQL:', error);
        this.isOnline = false; // Update status if MySQL fails
      }
    } else {
      console.log('Network offline or MySQL unavailable - note updated locally only');
    }

    // Get updated note and return as plain JSON
    const updatedNote = await this.models.sqlite.Note.findByPk(id, {
      include: [{ model: this.models.sqlite.File, as: 'files', required: false }]
    });

    if (updatedNote) {
      const result = updatedNote.toJSON();
      if (typeof result.tags === 'string') {
        try {
          result.tags = JSON.parse(result.tags);
        } catch {
          result.tags = [];
        }
      }
      return result;
    }

    return null;
  }

  async deleteNote(id) {
    // Delete from SQLite
    await this.models.sqlite.File.destroy({ where: { noteId: id } });
    await this.models.sqlite.Note.destroy({ where: { id } });

    // Check network connection and MySQL availability before syncing deletion
    const isNetworkOnline = await this.checkNetworkConnection();
    if (isNetworkOnline && this.isOnline) {
      try {
        await this.models.mysql.File.destroy({ where: { noteId: id } });
        await this.models.mysql.Note.destroy({ where: { id } });
        console.log('Note deletion synced to MySQL successfully');
      } catch (error) {
        console.error('Failed to sync note deletion to MySQL:', error);
        this.isOnline = false; // Update status if MySQL fails
      }
    } else {
      console.log('Network offline or MySQL unavailable - note deleted locally only');
    }
  }

  async getAllNotes() {
    try {
      const notes = await this.models.sqlite.Note.findAll({
        include: [{ 
          model: this.models.sqlite.File, 
          as: 'files',
          required: false // Use LEFT JOIN instead of INNER JOIN
        }],
        order: [['updatedAt', 'DESC']]
      });
      
      // Convert Sequelize instances to plain JSON objects to avoid cloning issues
      return notes.map(note => {
        const noteData = note.toJSON();
        // Ensure tags is parsed as array
        if (typeof noteData.tags === 'string') {
          try {
            noteData.tags = JSON.parse(noteData.tags);
          } catch {
            noteData.tags = [];
          }
        }
        return noteData;
      });
    } catch (error) {
      console.error('Error getting notes:', error.message);
      // Return empty array if tables don't exist yet
      return [];
    }
  }

  async saveFile(fileData, noteId = null) {
    const fileRecord = {
      id: uuidv4(),
      ...fileData,
      noteId,
      createdAt: new Date().toISOString(),
      synced: 0
    };

    // Save to SQLite
    const savedFile = await this.models.sqlite.File.create(fileRecord);

    // Check network connection and MySQL availability before syncing
    const isNetworkOnline = await this.checkNetworkConnection();
    if (isNetworkOnline && this.isOnline) {
      try {
        const mysqlFile = {
          ...fileRecord,
          createdAt: new Date(fileRecord.createdAt),
          synced: true
        };
        await this.models.mysql.File.create(mysqlFile);
        await this.models.sqlite.File.update(
          { synced: 1 },
          { where: { id: fileRecord.id } }
        );
        console.log('File synced to MySQL successfully');
      } catch (error) {
        console.error('Failed to sync file to MySQL:', error);
        this.isOnline = false; // Update status if MySQL fails
      }
    } else {
      console.log('Network offline or MySQL unavailable - file saved locally only');
    }

    // Return plain JSON object
    return savedFile.toJSON();
  }

  async syncPendingData() {
    // Check network connection first
    const isNetworkOnline = await this.checkNetworkConnection();
    if (!isNetworkOnline || !this.isOnline) {
      console.log('Cannot sync: Network offline or MySQL unavailable');
      return;
    }

    try {
      // Sync unsynced notes (SQLite uses INTEGER 0/1 for boolean)
      const unsyncedNotes = await this.models.sqlite.Note.findAll({
        where: { synced: 0 }
      });

      for (const note of unsyncedNotes) {
        try {
          const noteData = note.toJSON();
          // Convert SQLite data to MySQL format
          const mysqlNoteData = {
            ...noteData,
            createdAt: new Date(noteData.createdAt),
            updatedAt: new Date(noteData.updatedAt),
            tags: typeof noteData.tags === 'string' ? JSON.parse(noteData.tags) : noteData.tags,
            synced: true
          };
          
          await this.models.mysql.Note.upsert(mysqlNoteData);
          await this.models.sqlite.Note.update(
            { synced: 1 },
            { where: { id: note.id } }
          );
        } catch (error) {
          console.error('Failed to sync note:', note.id, error);
        }
      }

      // Sync unsynced files
      const unsyncedFiles = await this.models.sqlite.File.findAll({
        where: { synced: 0 }
      });

      for (const file of unsyncedFiles) {
        try {
          const fileData = file.toJSON();
          // Convert SQLite data to MySQL format
          const mysqlFileData = {
            ...fileData,
            createdAt: new Date(fileData.createdAt),
            synced: true
          };
          
          await this.models.mysql.File.upsert(mysqlFileData);
          await this.models.sqlite.File.update(
            { synced: 1 },
            { where: { id: file.id } }
          );
        } catch (error) {
          console.error('Failed to sync file:', file.id, error);
        }
      }

      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
      this.isOnline = false; // Update status if sync fails
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

      // Convert to plain JSON objects
      return notes.map(note => {
        const noteData = note.toJSON();
        if (typeof noteData.tags === 'string') {
          try {
            noteData.tags = JSON.parse(noteData.tags);
          } catch {
            noteData.tags = [];
          }
        }
        return noteData;
      });
    } catch (error) {
      console.error('Error searching notes:', error.message);
      return [];
    }
  }

  async testConnections() {
    const status = {
      network: false,
      sqlite: false,
      mysql: false,
      timestamp: new Date().toISOString()
    };

    // Test network connectivity first
    try {
      status.network = await this.checkNetworkConnection();
    } catch (error) {
      console.error('Network connection test failed:', error.message);
    }

    // Test SQLite connection
    try {
      await this.sqliteSequelize.authenticate();
      status.sqlite = true;
    } catch (error) {
      console.error('SQLite connection test failed:', error.message);
    }

    // Test MySQL connection only if network is available
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
    
    return {
      isOnline: this.isOnline && networkOnline,
      networkConnected: networkOnline,
      sqliteConnected: !!this.sqliteSequelize,
      mysqlConnected: this.isOnline && networkOnline,
      canConnectSQLite: !!this.sqliteSequelize,
      canConnectMySQL: this.isOnline && networkOnline,
      message: networkOnline ? 
        (this.isOnline ? 'Online - Ready to sync' : 'MySQL unavailable - Working offline') :
        'Network offline - Working offline only',
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new DatabaseManager();
