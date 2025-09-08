import React, { useState, useEffect } from 'react';

const DebugPanel = ({ notes, dbStatus, isLoading, error }) => {
  const [showDebug, setShowDebug] = useState(false);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    // Add log entry when notes change
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [
      ...prev.slice(-9), // Keep last 10 logs
      `${timestamp}: Notes updated - Count: ${notes?.length || 0}`
    ]);
  }, [notes]);

  useEffect(() => {
    // Add log entry when db status changes
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [
      ...prev.slice(-9),
      `${timestamp}: DB Status - Online: ${dbStatus.isOnline}, SQLite: ${dbStatus.sqliteConnected}`
    ]);
  }, [dbStatus]);

  if (!showDebug) {
    return (
      <button
        onClick={() => setShowDebug(true)}
        style={{
          position: 'fixed',
          bottom: '10px',
          right: '10px',
          padding: '5px 10px',
          backgroundColor: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          zIndex: 1000
        }}
      >
        🐛 Debug
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      width: '300px',
      backgroundColor: 'white',
      border: '1px solid #ddd',
      borderRadius: '4px',
      padding: '10px',
      fontSize: '12px',
      zIndex: 1000,
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px',
        fontWeight: 'bold'
      }}>
        🐛 Debug Panel
        <button
          onClick={() => setShowDebug(false)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          ×
        </button>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>Current State:</strong>
        <div>• Notes: {notes?.length || 0}</div>
        <div>• Loading: {isLoading ? '✅' : '❌'}</div>
        <div>• Error: {error ? '⚠️' : '✅'}</div>
        <div>• DB Online: {dbStatus.isOnline ? '✅' : '❌'}</div>
        <div>• SQLite: {dbStatus.sqliteConnected ? '✅' : '❌'}</div>
        {dbStatus.unsyncedNotes !== undefined && (
          <div>• Unsynced: {dbStatus.unsyncedNotes + (dbStatus.unsyncedFiles || 0)}</div>
        )}
      </div>

      <div>
        <strong>Recent Activity:</strong>
        <div style={{
          maxHeight: '150px',
          overflowY: 'auto',
          backgroundColor: '#f8f9fa',
          padding: '5px',
          borderRadius: '2px',
          marginTop: '5px'
        }}>
          {logs.map((log, index) => (
            <div key={index} style={{ marginBottom: '2px' }}>
              {log}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '10px' }}>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '5px 10px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '2px',
            cursor: 'pointer',
            marginRight: '5px'
          }}
        >
          🔄 Reload
        </button>
        <button
          onClick={() => setLogs([])}
          style={{
            padding: '5px 10px',
            backgroundColor: '#ffc107',
            color: 'black',
            border: 'none',
            borderRadius: '2px',
            cursor: 'pointer'
          }}
        >
          🗑️ Clear Logs
        </button>
      </div>
    </div>
  );
};

export default DebugPanel;
