import React, { useState, useRef, useEffect } from 'react';

const FileUploadOptimized = ({ selectedNote, onFileUploaded }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]);
  const [jsonInput, setJsonInput] = useState('');
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [useStreaming, setUseStreaming] = useState(true);
  const fileInputRef = useRef(null);
  
  // File size thresholds
  const STREAMING_THRESHOLD = 10 * 1024 * 1024; // 10MB
  const CHUNKED_THRESHOLD = 100 * 1024 * 1024; // 100MB

  useEffect(() => {
    // Setup upload event listeners
    const handleUploadProgress = (event, progress) => {
      setUploadProgress(prev => {
        const existing = prev.find(p => p.uploadId === progress.uploadId);
        if (existing) {
          return prev.map(p => p.uploadId === progress.uploadId ? { ...p, ...progress } : p);
        } else {
          return [...prev, progress];
        }
      });
    };

    const handleUploadComplete = (event, data) => {
      console.log('Upload completed:', data);
      setUploadProgress(prev => prev.filter(p => p.uploadId !== data.uploadId));
      // Trigger immediate reload
      if (onFileUploaded) {
        onFileUploaded();
      }
    };

    const handleUploadError = (event, error) => {
      console.error('Upload error:', error);
      setUploadProgress(prev => prev.map(p => 
        p.fileName === error.originalName 
          ? { ...p, status: 'error', error: error.error }
          : p
      ));
      setTimeout(() => {
        setUploadProgress(prev => prev.filter(p => p.fileName !== error.originalName));
      }, 5000);
    };

    // Check if the event listeners exist before adding them
    if (window.electronAPI?.onUploadProgress) {
      window.electronAPI.onUploadProgress(handleUploadProgress);
      window.electronAPI.onUploadComplete(handleUploadComplete);
      window.electronAPI.onUploadError(handleUploadError);
    }

    return () => {
      if (window.electronAPI?.removeUploadListeners) {
        window.electronAPI.removeUploadListeners();
      }
    };
  }, [onFileUploaded]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files);
    e.target.value = ''; // Reset input
  };

  const handleFiles = async (files) => {
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        await uploadFileOptimized(file);
      }
      // Trigger reload after all files are uploaded
      console.log('All files uploaded successfully');
      if (onFileUploaded) {
        onFileUploaded();
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      alert('Error uploading files: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const uploadFileOptimized = async (file) => {
    if (!useStreaming || file.size <= STREAMING_THRESHOLD) {
      // Use traditional upload for small files
      return uploadFileTraditional(file);
    } else if (file.size <= CHUNKED_THRESHOLD) {
      // Use streaming for medium files (10MB-100MB)
      return uploadFileStreaming(file);
    } else {
      // Use chunked upload for large files (>100MB)
      return uploadFileChunked(file);
    }
  };

  const uploadFileTraditional = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
          const fileData = {
            name: file.name,
            type: file.type,
            size: file.size,
            buffer: Array.from(new Uint8Array(arrayBuffer))
          };

          await window.electronAPI.uploadFile(fileData, selectedNote?.id);
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const uploadFileStreaming = async (file) => {
    try {
      // Generate upload ID for progress tracking
      const uploadId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Initialize progress tracking
      setUploadProgress(prev => [...prev, {
        uploadId,
        fileName: file.name,
        totalSize: file.size,
        uploadedSize: 0,
        progress: 0,
        status: 'uploading'
      }]);

      // Simulate progress updates for streaming upload
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => prev.map(p => {
          if (p.uploadId === uploadId && p.progress < 90) {
            const newProgress = Math.min(p.progress + Math.random() * 20, 90);
            return {
              ...p,
              progress: newProgress,
              uploadedSize: Math.floor((newProgress / 100) * p.totalSize)
            };
          }
          return p;
        }));
      }, 200);

      // Perform the actual upload
      const result = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const arrayBuffer = e.target.result;
            const fileData = {
              name: file.name,
              type: file.type,
              size: file.size,
              buffer: Array.from(new Uint8Array(arrayBuffer))
            };

            const uploadResult = await window.electronAPI.uploadFile(fileData, selectedNote?.id);
            resolve(uploadResult);
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });

      // Complete progress tracking
      clearInterval(progressInterval);
      setUploadProgress(prev => prev.map(p => 
        p.uploadId === uploadId 
          ? { ...p, progress: 100, uploadedSize: p.totalSize, status: 'completed' }
          : p
      ));

      // Remove completed upload from progress after delay
      setTimeout(() => {
        setUploadProgress(prev => prev.filter(p => p.uploadId !== uploadId));
      }, 2000);

      return result;
    } catch (error) {
      console.error('Error in streaming upload:', error);
      // Update progress to show error
      setUploadProgress(prev => prev.map(p => 
        p.fileName === file.name 
          ? { ...p, status: 'error', error: error.message }
          : p
      ));
      
      // Fallback to traditional upload
      return uploadFileTraditional(file);
    }
  };

  const uploadFileChunked = async (file) => {
    try {
      // Initialize chunked upload
      const { uploadId } = await window.electronAPI.initializeChunkedUpload(
        file.name,
        file.size,
        file.type
      );

      const chunkSize = 1024 * 1024; // 1MB chunks
      const totalChunks = Math.ceil(file.size / chunkSize);

      // Upload chunks
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const chunkData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(Array.from(new Uint8Array(e.target.result)));
          reader.onerror = reject;
          reader.readAsArrayBuffer(chunk);
        });

        await window.electronAPI.uploadChunk(uploadId, chunkData, chunkIndex);
        
        // Small delay to prevent overwhelming the system
        if (chunkIndex % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Finalize upload
      await window.electronAPI.finalizeChunkedUpload(uploadId, selectedNote?.id);
    } catch (error) {
      console.error('Error in chunked upload:', error);
      throw error;
    }
  };

  const handleOpenFileDialog = async () => {
    try {
      const result = await window.electronAPI.openFileDialog();
      if (!result.canceled && result.files) {
        setUploading(true);
        for (const fileData of result.files) {
          if (fileData.useStreaming && fileData.path) {
            // Use streaming for large files from dialog
            await window.electronAPI.uploadFileStream(
              fileData.path,
              fileData.name,
              fileData.type,
              selectedNote?.id
            );
          } else {
            // Use traditional upload for small files
            await window.electronAPI.uploadFile(fileData, selectedNote?.id);
          }
        }
        console.log('Dialog files uploaded successfully');
        if (onFileUploaded) {
          onFileUploaded();
        }
      }
    } catch (error) {
      console.error('Error opening file dialog:', error);
      alert('Error opening file dialog: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const cancelUpload = async (uploadId) => {
    try {
      await window.electronAPI.cancelUpload(uploadId);
      setUploadProgress(prev => prev.filter(p => p.uploadId !== uploadId));
    } catch (error) {
      console.error('Error canceling upload:', error);
    }
  };

  const handleSaveJson = async () => {
    if (!jsonInput.trim()) {
      alert('Please enter some JSON data');
      return;
    }

    try {
      const jsonData = JSON.parse(jsonInput);
      const fileName = `data_${Date.now()}.json`;
      
      setUploading(true);
      await window.electronAPI.uploadJsonFile(jsonData, fileName, selectedNote?.id);
      
      setJsonInput('');
      setShowJsonEditor(false);
      console.log('JSON file saved successfully');
      if (onFileUploaded) {
        onFileUploaded();
      }
      alert('JSON file saved successfully!');
    } catch (error) {
      if (error.message.includes('JSON')) {
        alert('Invalid JSON format. Please check your JSON syntax.');
      } else {
        console.error('Error saving JSON:', error);
        alert('Error saving JSON file: ' + error.message);
      }
    } finally {
      setUploading(false);
    }
  };

  const validateJson = (jsonString) => {
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{
      borderTop: '1px solid #ddd',
      backgroundColor: '#f8f9fa',
      overflow: 'auto'
    }}>
      {/* Upload Settings */}
      <div style={{
        padding: '10px',
        backgroundColor: '#e9ecef',
        borderBottom: '1px solid #ddd',
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        fontSize: '14px'
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <input
            type="checkbox"
            checked={useStreaming}
            onChange={(e) => setUseStreaming(e.target.checked)}
          />
          Enable optimized uploads for large files
        </label>
        <span style={{ color: '#666' }}>
          (Chunked upload for files &gt; {formatFileSize(CHUNKED_THRESHOLD)})
        </span>
      </div>

      {/* Active Uploads Progress */}
      {uploadProgress.length > 0 && (
        <div style={{
          padding: '10px',
          backgroundColor: '#fff3cd',
          borderBottom: '1px solid #ddd'
        }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Active Uploads:</h4>
          {uploadProgress.map((progress) => (
            <div key={progress.uploadId} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '5px',
              padding: '5px',
              backgroundColor: 'white',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
                  {progress.fileName}
                </div>
                <div style={{
                  width: '100%',
                  height: '6px',
                  backgroundColor: '#e9ecef',
                  borderRadius: '3px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${progress.progress || 0}%`,
                    height: '100%',
                    backgroundColor: progress.status === 'error' ? '#dc3545' : '#28a745',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                <div style={{ fontSize: '10px', color: '#666' }}>
                  {formatFileSize(progress.uploadedSize || 0)} / {formatFileSize(progress.totalSize || 0)} 
                  ({Math.round(progress.progress || 0)}%)
                </div>
              </div>
              <button
                onClick={() => cancelUpload(progress.uploadId)}
                style={{
                  padding: '2px 6px',
                  fontSize: '10px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '2px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      {/* File Upload Area */}
      <div
        style={{
          padding: '20px',
          border: isDragOver ? '2px dashed #007bff' : '2px dashed #ddd',
          backgroundColor: isDragOver ? '#e3f2fd' : 'white',
          margin: '10px',
          borderRadius: '8px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.3s ease'
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        
        {uploading ? (
          <div>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
            <div>Processing files...</div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              {useStreaming ? 'Using optimized upload methods' : 'Using standard upload'}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>📁</div>
            <div style={{ fontSize: '16px', marginBottom: '5px' }}>
              Drop files here or click to browse
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Supports images, documents, audio, video, and JSON files
              <br />
              Chunked upload for large files (&gt; {formatFileSize(CHUNKED_THRESHOLD)})
            </div>
            {selectedNote && (
              <div style={{ fontSize: '12px', color: '#007bff', marginTop: '5px' }}>
                Files will be attached to: {selectedNote.title}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0 10px 10px 10px',
        gap: '10px'
      }}>
        <button
          onClick={handleOpenFileDialog}
          disabled={uploading}
          style={{
            flex: 1,
            padding: '10px',
            backgroundColor: uploading ? '#6c757d' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: uploading ? 'not-allowed' : 'pointer'
          }}
        >
          📂 Browse Files
        </button>

        <button
          onClick={() => setShowJsonEditor(!showJsonEditor)}
          style={{
            flex: 1,
            padding: '10px',
            backgroundColor: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          📝 {showJsonEditor ? 'Hide JSON Editor' : 'Create JSON File'}
        </button>
      </div>

      {/* JSON Editor */}
      {showJsonEditor && (
        <div style={{
          margin: '0 10px 10px 10px',
          padding: '15px',
          backgroundColor: 'white',
          border: '1px solid #ddd',
          borderRadius: '4px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px'
          }}>
            <h4 style={{ margin: 0 }}>JSON Data Editor</h4>
            <div style={{ fontSize: '12px', color: '#666' }}>
              {jsonInput.trim() && (validateJson(jsonInput) ? '✅ Valid JSON' : '❌ Invalid JSON')}
            </div>
          </div>
          
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder='Enter JSON data here...\n\nExample:\n{\n  "name": "John Doe",\n  "age": 30,\n  "city": "New York"\n}'
            style={{
              width: '100%',
              height: '200px',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'Monaco, Consolas, monospace',
              resize: 'vertical'
            }}
          />
          
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '10px'
          }}>
            <button
              onClick={() => {
                setJsonInput('');
                setShowJsonEditor(false);
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveJson}
              disabled={!jsonInput.trim() || !validateJson(jsonInput) || uploading}
              style={{
                padding: '8px 16px',
                backgroundColor: (!jsonInput.trim() || !validateJson(jsonInput) || uploading) ? '#6c757d' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: (!jsonInput.trim() || !validateJson(jsonInput) || uploading) ? 'not-allowed' : 'pointer'
              }}
            >
              {uploading ? 'Saving...' : 'Save JSON File'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploadOptimized;