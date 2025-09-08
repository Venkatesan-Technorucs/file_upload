const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { createReadStream, createWriteStream } = require('fs');

class FileHandler {
  constructor() {
    this.uploadsDir = path.join(__dirname, '..', '..', 'uploads');
    this.tempDir = path.join(__dirname, '..', '..', 'temp');
    this.chunkSize = 1024 * 1024; // 1MB chunks
    this.activeUploads = new Map(); // Track active uploads
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

  // New optimized streaming file save method
  async saveFileStream(sourcePath, originalName, mimeType, progressCallback = null) {
    const fileExtension = path.extname(originalName);
    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(this.uploadsDir, fileName);
    const uploadId = uuidv4();

    try {
      const sourceStats = await fs.stat(sourcePath);
      const fileSize = sourceStats.size;
      
      // Track upload progress
      this.activeUploads.set(uploadId, {
        fileName: originalName,
        totalSize: fileSize,
        uploadedSize: 0,
        status: 'uploading'
      });

      const hash = crypto.createHash('md5');
      let uploadedSize = 0;

      await pipeline(
        createReadStream(sourcePath),
        async function* (source) {
          for await (const chunk of source) {
            hash.update(chunk);
            uploadedSize += chunk.length;
            
            // Update progress
            const upload = this.activeUploads.get(uploadId);
            if (upload) {
              upload.uploadedSize = uploadedSize;
              if (progressCallback) {
                progressCallback({
                  uploadId,
                  fileName: originalName,
                  progress: (uploadedSize / fileSize) * 100,
                  uploadedSize,
                  totalSize: fileSize
                });
              }
            }
            
            yield chunk;
          }
        }.bind(this),
        createWriteStream(filePath)
      );

      const fileHash = hash.digest('hex');
      
      // Mark upload as complete
      this.activeUploads.set(uploadId, {
        ...this.activeUploads.get(uploadId),
        status: 'completed'
      });

      // Clean up tracking after delay
      setTimeout(() => this.activeUploads.delete(uploadId), 30000);

      return {
        uploadId,
        originalName,
        fileName,
        filePath,
        fileSize,
        mimeType,
        hash: fileHash
      };
    } catch (error) {
      // Mark upload as failed
      this.activeUploads.set(uploadId, {
        ...this.activeUploads.get(uploadId),
        status: 'failed',
        error: error.message
      });
      
      console.error('Error saving file stream:', error);
      throw error;
    }
  }

  // Chunked upload method for very large files
  async initializeChunkedUpload(originalName, totalSize, mimeType) {
    const fileExtension = path.extname(originalName);
    const fileName = `${uuidv4()}${fileExtension}`;
    const uploadId = uuidv4();
    const tempPath = path.join(this.tempDir, `${uploadId}_${fileName}`);

    this.activeUploads.set(uploadId, {
      fileName: originalName,
      tempPath,
      finalPath: path.join(this.uploadsDir, fileName),
      totalSize,
      uploadedSize: 0,
      chunks: [],
      mimeType,
      hash: crypto.createHash('md5'),
      status: 'initialized'
    });

    return { uploadId, fileName };
  }

  async uploadChunk(uploadId, chunkData, chunkIndex) {
    const upload = this.activeUploads.get(uploadId);
    if (!upload) {
      throw new Error('Upload session not found');
    }

    try {
      // Append chunk to temp file
      await fs.appendFile(upload.tempPath, chunkData);
      
      // Update hash and progress
      upload.hash.update(chunkData);
      upload.uploadedSize += chunkData.length;
      upload.chunks.push(chunkIndex);
      upload.status = 'uploading';

      const progress = (upload.uploadedSize / upload.totalSize) * 100;
      
      return {
        uploadId,
        chunkIndex,
        progress,
        uploadedSize: upload.uploadedSize,
        totalSize: upload.totalSize
      };
    } catch (error) {
      upload.status = 'failed';
      upload.error = error.message;
      throw error;
    }
  }

  async finalizeChunkedUpload(uploadId) {
    const upload = this.activeUploads.get(uploadId);
    if (!upload) {
      throw new Error('Upload session not found');
    }

    try {
      // Move from temp to final location
      await fs.rename(upload.tempPath, upload.finalPath);
      
      const stats = await fs.stat(upload.finalPath);
      const fileHash = upload.hash.digest('hex');

      upload.status = 'completed';

      const result = {
        uploadId,
        originalName: upload.fileName,
        fileName: path.basename(upload.finalPath),
        filePath: upload.finalPath,
        fileSize: stats.size,
        mimeType: upload.mimeType,
        hash: fileHash
      };

      // Clean up tracking after delay
      setTimeout(() => this.activeUploads.delete(uploadId), 30000);

      return result;
    } catch (error) {
      upload.status = 'failed';
      upload.error = error.message;
      
      // Clean up temp file
      try {
        await fs.unlink(upload.tempPath);
      } catch (cleanupError) {
        console.error('Error cleaning up temp file:', cleanupError);
      }
      
      throw error;
    }
  }

  getUploadProgress(uploadId) {
    return this.activeUploads.get(uploadId) || null;
  }

  getAllActiveUploads() {
    return Array.from(this.activeUploads.entries()).map(([id, upload]) => ({
      uploadId: id,
      ...upload
    }));
  }

  cancelUpload(uploadId) {
    const upload = this.activeUploads.get(uploadId);
    if (upload) {
      upload.status = 'cancelled';
      
      // Clean up temp file if exists
      if (upload.tempPath) {
        fs.unlink(upload.tempPath).catch(console.error);
      }
      
      this.activeUploads.delete(uploadId);
      return true;
    }
    return false;
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
