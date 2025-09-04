import React, { useState } from 'react';

const StatusBar = ({ dbStatus, onForceSync, notesCount }) => {
  const [testing, setTesting] = useState(false);

  const getStatusIcon = () => {
    if (!dbStatus.networkConnected) {
      return '🔴'; // Network offline
    } else if (dbStatus.isOnline && dbStatus.mysqlConnected) {
      return '🟢'; // Full online
    } else if (dbStatus.sqliteConnected) {
      return '🟡'; // SQLite only
    } else {
      return '🔴'; // Database error
    }
  };

  const getStatusText = () => {
    if (!dbStatus.networkConnected) {
      return 'Network Offline - Using SQLite only';
    } else if (dbStatus.isOnline && dbStatus.mysqlConnected) {
      return 'Online - Syncing to MySQL';
    } else if (dbStatus.sqliteConnected) {
      return 'MySQL Unavailable - Using SQLite';
    } else {
      return 'Database Error';
    }
  };

  const handleTestConnections = async () => {
    setTesting(true);
    try {
      const result = await window.electronAPI.testConnections();
      console.log('Connection test result:', result);
      alert(`Connection Test Results:\nNetwork: ${result.network ? 'Connected' : 'Offline'}\nSQLite: ${result.sqlite ? 'Connected' : 'Failed'}\nMySQL: ${result.mysql ? 'Connected' : 'Failed'}`);
    } catch (error) {
      console.error('Connection test failed:', error);
      alert('Connection test failed: ' + error.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{
      padding: '8px 20px',
      backgroundColor: '#34495e',
      color: 'white',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: '12px',
      borderTop: '1px solid #2c3e50'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span>{getStatusIcon()}</span>
          <span>{getStatusText()}</span>
        </div>
        
        <div>
          📝 {notesCount} note{notesCount !== 1 ? 's' : ''}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span>💾</span>
          <span>SQLite: {dbStatus.sqliteConnected ? 'Connected' : 'Disconnected'}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span>🌐</span>
          <span>MySQL: {dbStatus.mysqlConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {!dbStatus.isOnline && (
          <span style={{
            backgroundColor: '#e74c3c',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '10px'
          }}>
            OFFLINE MODE
          </span>
        )}
        
        <button
          onClick={handleTestConnections}
          disabled={testing}
          style={{
            padding: '4px 12px',
            backgroundColor: testing ? '#95a5a6' : '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            cursor: testing ? 'not-allowed' : 'pointer',
            fontSize: '11px'
          }}
          title="Test database connections"
        >
          {testing ? '⏳ Testing...' : '🔍 Test'}
        </button>
        
        <button
          onClick={onForceSync}
          disabled={!dbStatus.isOnline}
          style={{
            padding: '4px 12px',
            backgroundColor: dbStatus.isOnline ? '#27ae60' : '#7f8c8d',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            cursor: dbStatus.isOnline ? 'pointer' : 'not-allowed',
            fontSize: '11px'
          }}
          title={dbStatus.isOnline ? 'Force sync to MySQL' : 'Cannot sync - MySQL not connected'}
        >
          🔄 Sync
        </button>

        <div style={{ fontSize: '11px', color: '#bdc3c7' }}>
          {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
