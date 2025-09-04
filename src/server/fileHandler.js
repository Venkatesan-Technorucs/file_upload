const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class FileHandler {
  constructor() {
    this.uploadsDir = path.join(__dirname, '..', '..', 'uploads');
    this.tempDir = path.join(__dirname, '..', '..', 'temp');
    this.ensureDirectories();
  }

  async ensureDirectories() {
    try {
      await fs.access(this.uploadsDir);
    } catch (error) {
      await fs.mkdir(this.uploadsDir, { recursive: true });
    }

    try {
      await fs.access(this.tempDir);
    } catch (error) {
      await fs.mkdir(this.tempDir, { recursive: true });
    }
  }

  async saveFile(fileBuffer, originalName, mimeType) {
    const fileExtension = path.extname(originalName);
    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(this.uploadsDir, fileName);

    try {
      await fs.writeFile(filePath, fileBuffer);
      
      const stats = await fs.stat(filePath);
      const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');

      return {
        originalName,
        fileName,
        filePath,
        fileSize: stats.size,
        mimeType,
        hash: fileHash
      };
    } catch (error) {
      console.error('Error saving file:', error);
      throw error;
    }
  }

  async saveJsonFile(jsonData, fileName = null) {
    const actualFileName = fileName || `data_${Date.now()}.json`;
    const filePath = path.join(this.uploadsDir, actualFileName);

    try {
      const jsonString = JSON.stringify(jsonData, null, 2);
      await fs.writeFile(filePath, jsonString, 'utf8');
      
      const stats = await fs.stat(filePath);
      
      return {
        originalName: actualFileName,
        fileName: actualFileName,
        filePath,
        fileSize: stats.size,
        mimeType: 'application/json'
      };
    } catch (error) {
      console.error('Error saving JSON file:', error);
      throw error;
    }
  }

  async readFile(filePath) {
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      console.error('Error reading file:', error);
      throw error;
    }
  }

  async readJsonFile(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading JSON file:', error);
      throw error;
    }
  }

  async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  async getFileInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime
      };
    } catch (error) {
      console.error('Error getting file info:', error);
      throw error;
    }
  }

  async moveToTemp(filePath) {
    const fileName = path.basename(filePath);
    const tempPath = path.join(this.tempDir, fileName);
    
    try {
      await fs.rename(filePath, tempPath);
      return tempPath;
    } catch (error) {
      console.error('Error moving file to temp:', error);
      throw error;
    }
  }

  async moveFromTemp(tempPath, finalPath) {
    try {
      await fs.rename(tempPath, finalPath);
      return finalPath;
    } catch (error) {
      console.error('Error moving file from temp:', error);
      throw error;
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  isValidJsonFile(filePath) {
    return path.extname(filePath).toLowerCase() === '.json';
  }

  isImageFile(mimeType) {
    return mimeType.startsWith('image/');
  }

  isVideoFile(mimeType) {
    return mimeType.startsWith('video/');
  }

  isAudioFile(mimeType) {
    return mimeType.startsWith('audio/');
  }

  isDocumentFile(mimeType) {
    const documentTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv'
    ];
    return documentTypes.includes(mimeType);
  }
}

module.exports = new FileHandler();
