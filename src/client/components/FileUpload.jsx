import React, { useState, useRef } from 'react';

const FileUpload = ({ selectedNote, onFileUploaded }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const fileInputRef = useRef(null);

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
  };

  const handleFiles = async (files) => {
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        await uploadFile(file);
      }
      onFileUploaded();
    } catch (error) {
      console.error('Error uploading files:', error);
      alert('Error uploading files: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const uploadFile = async (file) => {
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

  const handleOpenFileDialog = async () => {
    try {
      const result = await window.electronAPI.openFileDialog();
      if (!result.canceled && result.files) {
        setUploading(true);
        for (const fileData of result.files) {
          await window.electronAPI.uploadFile(fileData, selectedNote?.id);
        }
        onFileUploaded();
      }
    } catch (error) {
      console.error('Error opening file dialog:', error);
      alert('Error opening file dialog: ' + error.message);
    } finally {
      setUploading(false);
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
      onFileUploaded();
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

  return (
    <div style={{
      borderTop: '1px solid #ddd',
      backgroundColor: '#f8f9fa',
      overflow: 'auto'
    }}>
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
            <div>Uploading files...</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>📁</div>
            <div style={{ fontSize: '16px', marginBottom: '5px' }}>
              Drop files here or click to browse
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Supports images, documents, audio, video, and JSON files
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
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.6 : 1
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

export default FileUpload;
