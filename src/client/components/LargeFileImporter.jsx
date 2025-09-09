import React, { useState, useEffect } from 'react';

const LargeFileImporter = ({ selectedNote, onFileImported }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState([]);
  const [memoryUsage, setMemoryUsage] = useState(null);
  const [importHistory, setImportHistory] = useState([]);

  useEffect(() => {
    // Setup import event listeners
    const handleImportProgress = (event, progress) => {
      setImportProgress(prev => {
        const existing = prev.find(p => p.filePath === progress.filePath);
        if (existing) {
          return prev.map(p => p.filePath === progress.filePath ? { ...p, ...progress } : p);
        } else {
          return [...prev, progress];
        }
      });
    };

    const handleImportComplete = (event, data) => {
      console.log('Large file import completed:', data);
      setImportProgress(prev => prev.filter(p => p.filePath !== data.filePath));
      
      setImportHistory(prev => [...prev, {
        ...data,
        completedAt: new Date().toLocaleString(),
        status: 'completed'
      }]);

      if (onFileImported) {
        onFileImported();
      }
    };

    const handleImportError = (event, error) => {
      console.error('Large file import error:', error);
      setImportProgress(prev => prev.filter(p => p.filePath !== error.filePath));
      
      setImportHistory(prev => [...prev, {
        filePath: error.filePath,
        error: error.error,
        completedAt: new Date().toLocaleString(),
        status: 'error'
      }]);
    };

    window.electronAPI.onImportProgress(handleImportProgress);
    window.electronAPI.onImportComplete(handleImportComplete);
    window.electronAPI.onImportError(handleImportError);

    // Monitor memory usage during imports
    const memoryInterval = setInterval(async () => {
      if (isImporting || importProgress.length > 0) {
        try {
          const usage = await window.electronAPI.getMemoryUsage();
          setMemoryUsage(usage);
        } catch (error) {
          console.error('Failed to get memory usage:', error);
        }
      }
    }, 2000);

    return () => {
      clearInterval(memoryInterval);
      // Clean up listeners would go here if we had a cleanup method
    };
  }, [isImporting, importProgress.length, onFileImported]);

  const handleLargeFileImport = async () => {
    try {
      const result = await window.electronAPI.openFileDialog();
      
      if (!result.canceled && result.files) {
        setIsImporting(true);
        
        for (const fileData of result.files) {
          if (fileData.size > 50 * 1024 * 1024) { // > 50MB
            console.log('Using memory-optimized import for large file:', fileData.name);
            await window.electronAPI.importLargeFile(fileData.path, selectedNote?.id);
          } else {
            // Use regular upload for smaller files
            if (fileData.useStreaming && fileData.path) {
              await window.electronAPI.uploadFileStream(
                fileData.path,
                fileData.name,
                fileData.type,
                selectedNote?.id
              );
            } else {
              await window.electronAPI.uploadFile(fileData, selectedNote?.id);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error importing large files:', error);
      alert('Error importing files: ' + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getMemoryColor = (usage) => {
    if (!usage) return '#28a745';
    const total = usage.heapUsed + usage.external;
    if (total > 800) return '#dc3545'; // Red for high usage
    if (total > 400) return '#ffc107'; // Yellow for medium usage
    return '#28a745'; // Green for low usage
  };

  return (
    <div style={{
      borderTop: '1px solid #ddd',
      backgroundColor: '#f8f9fa',
      padding: '15px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '15px'
      }}>
        <h4 style={{ margin: 0, fontSize: '16px' }}>🚀 Memory-Optimized Large File Import</h4>
        {memoryUsage && (
          <div style={{
            fontSize: '12px',
            color: getMemoryColor(memoryUsage),
            fontWeight: 'bold'
          }}>
            RAM: {memoryUsage.heapUsed + memoryUsage.external}MB
          </div>
        )}
      </div>

      {/* Memory Usage Display */}
      {memoryUsage && (importProgress.length > 0 || isImporting) && (
        <div style={{
          marginBottom: '15px',
          padding: '10px',
          backgroundColor: 'white',
          borderRadius: '4px',
          border: '1px solid #ddd'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>
            💾 Memory Usage Monitor
          </div>
          <div style={{ fontSize: '11px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
            <div>Heap: {memoryUsage.heapUsed}MB</div>
            <div>External: {memoryUsage.external}MB</div>
            <div>RSS: {memoryUsage.rss}MB</div>
            <div>Total Heap: {memoryUsage.heapTotal}MB</div>
          </div>
        </div>
      )}

      {/* Active Import Progress */}
      {importProgress.length > 0 && (
        <div style={{
          marginBottom: '15px',
          padding: '10px',
          backgroundColor: '#fff3cd',
          borderRadius: '4px',
          border: '1px solid #ffeaa7'
        }}>
          <h5 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>🔄 Active Large File Imports:</h5>
          {importProgress.map((progress, index) => (
            <div key={progress.filePath} style={{
              marginBottom: '10px',
              padding: '8px',
              backgroundColor: 'white',
              borderRadius: '3px',
              border: '1px solid #ddd'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>
                {progress.filePath.split(/[/\\]/).pop()}
              </div>
              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: '#e9ecef',
                borderRadius: '4px',
                overflow: 'hidden',
                marginBottom: '5px'
              }}>
                <div style={{
                  width: `${progress.percentage || 0}%`,
                  height: '100%',
                  backgroundColor: '#28a745',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <div style={{ fontSize: '10px', color: '#666' }}>
                {formatBytes(progress.processed || 0)} / {formatBytes(progress.total || 0)} 
                ({Math.round(progress.percentage || 0)}%)
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Import Button */}
      <button
        onClick={handleLargeFileImport}
        disabled={isImporting}
        style={{
          width: '100%',
          padding: '12px',
          backgroundColor: isImporting ? '#6c757d' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: isImporting ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: 'bold'
        }}
      >
        {isImporting ? '🔄 Importing Large Files...' : '📁 Import Large Files (Memory Optimized)'}
      </button>

      {/* Info Box */}
      <div style={{
        marginTop: '15px',
        padding: '10px',
        backgroundColor: '#d1ecf1',
        borderRadius: '4px',
        border: '1px solid #bee5eb',
        fontSize: '12px'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>⚡ Memory Optimization Features:</div>
        <ul style={{ margin: 0, paddingLeft: '15px' }}>
          <li>Streaming file processing (no full file in memory)</li>
          <li>8MB chunk processing for files &gt;100MB</li>
          <li>Automatic garbage collection during import</li>
          <li>Memory usage monitoring and limiting</li>
          <li>Transaction-based database operations</li>
        </ul>
        {selectedNote && (
          <div style={{ marginTop: '5px', color: '#0c5460' }}>
            Files will be attached to: <strong>{selectedNote.title}</strong>
          </div>
        )}
      </div>

      {/* Import History */}
      {importHistory.length > 0 && (
        <div style={{
          marginTop: '15px',
          padding: '10px',
          backgroundColor: 'white',
          borderRadius: '4px',
          border: '1px solid #ddd'
        }}>
          <h5 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>📜 Recent Import History:</h5>
          <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {importHistory.slice(-5).reverse().map((item, index) => (
              <div key={index} style={{
                padding: '5px',
                marginBottom: '5px',
                backgroundColor: item.status === 'completed' ? '#d4edda' : '#f8d7da',
                borderRadius: '3px',
                fontSize: '11px'
              }}>
                <div style={{ fontWeight: 'bold' }}>
                  {item.status === 'completed' ? '✅' : '❌'} {item.filePath?.split(/[/\\]/).pop() || 'Unknown file'}
                </div>
                <div>{item.completedAt}</div>
                {item.error && <div style={{ color: '#721c24' }}>Error: {item.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LargeFileImporter;
