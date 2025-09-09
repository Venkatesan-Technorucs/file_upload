import React, { useState, useEffect } from 'react';

const DatabaseManager = ({ dbStatus, onStatusUpdate }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [lastAction, setLastAction] = useState(null);
  const [memoryUsage, setMemoryUsage] = useState(null);
  const [memoryHistory, setMemoryHistory] = useState([]);

  // Memory monitoring
  useEffect(() => {
    if (!isVisible) return;

    const updateMemoryUsage = async () => {
      try {
        const memoryData = await window.electronAPI.getMemoryUsage();
        setMemoryUsage(memoryData);
        
        // Keep last 10 readings for trend analysis
        setMemoryHistory(prev => {
          const newHistory = [...prev, memoryData].slice(-10);
          return newHistory;
        });
      } catch (error) {
        console.error('Failed to get memory usage:', error);
      }
    };

    // Update memory usage every 2 seconds
    const interval = setInterval(updateMemoryUsage, 2000);
    updateMemoryUsage(); // Initial update

    return () => clearInterval(interval);
  }, [isVisible]);

  const handleIntegrityCheck = async () => {
    setIsChecking(true);
    setLastAction(null);
    
    try {
      const result = await window.electronAPI.checkDatabaseIntegrity();
      setLastAction({
        type: 'integrity-check',
        success: result.healthy,
        message: result.details,
        timestamp: new Date().toLocaleString()
      });
      
      if (onStatusUpdate) {
        onStatusUpdate();
      }
    } catch (error) {
      setLastAction({
        type: 'integrity-check',
        success: false,
        message: 'Failed to check integrity: ' + error.message,
        timestamp: new Date().toLocaleString()
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleRepairDatabase = async () => {
    if (!confirm('Database repair will create a backup first. Continue?')) {
      return;
    }
    
    setIsRepairing(true);
    setLastAction(null);
    
    try {
      const result = await window.electronAPI.repairDatabase();
      setLastAction({
        type: 'repair',
        success: result.success,
        message: result.message,
        timestamp: new Date().toLocaleString()
      });
      
      if (onStatusUpdate) {
        onStatusUpdate();
      }
    } catch (error) {
      setLastAction({
        type: 'repair',
        success: false,
        message: 'Failed to repair database: ' + error.message,
        timestamp: new Date().toLocaleString()
      });
    } finally {
      setIsRepairing(false);
    }
  };

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    setLastAction(null);
    
    try {
      const result = await window.electronAPI.createDatabaseBackup();
      setLastAction({
        type: 'backup',
        success: result.success,
        message: result.message,
        timestamp: new Date().toLocaleString()
      });
    } catch (error) {
      setLastAction({
        type: 'backup',
        success: false,
        message: 'Failed to create backup: ' + error.message,
        timestamp: new Date().toLocaleString()
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        style={{
          position: 'fixed',
          bottom: '50px',
          left: '20px',
          padding: '10px 15px',
          backgroundColor: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '25px',
          cursor: 'pointer',
          fontSize: '14px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          zIndex: 1000
        }}
        title="Database Management"
      >
        🛠️ DB Tools
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      width: '400px',
      backgroundColor: 'white',
      border: '1px solid #ddd',
      borderRadius: '8px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      zIndex: 1000,
      maxHeight: '500px',
      overflow: 'auto'
    }}>
      {/* Header */}
      <div style={{
        padding: '15px',
        backgroundColor: '#6c757d',
        color: 'white',
        borderRadius: '8px 8px 0 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>🛠️ Database Management</h3>
        <button
          onClick={() => setIsVisible(false)}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: '18px'
          }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '15px' }}>
        {/* Memory Usage Monitor */}
        {memoryUsage && (
          <div style={{
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: '#f8f9fa',
            borderRadius: '4px'
          }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>📊 Memory Usage</h4>
            <div style={{ fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>RSS (Resident Set Size):</span>
                <span style={{ fontWeight: 'bold' }}>{Math.round(memoryUsage.rss / 1024 / 1024)} MB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Heap Used:</span>
                <span style={{ fontWeight: 'bold' }}>{Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Heap Total:</span>
                <span style={{ fontWeight: 'bold' }}>{Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span>External Memory:</span>
                <span style={{ fontWeight: 'bold' }}>{Math.round(memoryUsage.external / 1024 / 1024)} MB</span>
              </div>
              
              {/* Memory usage bar */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ 
                  width: '100%', 
                  height: '8px', 
                  backgroundColor: '#e9ecef', 
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${Math.min(100, (memoryUsage.heapUsed / (500 * 1024 * 1024)) * 100)}%`,
                    height: '100%',
                    backgroundColor: memoryUsage.heapUsed > 400 * 1024 * 1024 ? '#dc3545' : 
                                   memoryUsage.heapUsed > 300 * 1024 * 1024 ? '#ffc107' : '#28a745',
                    transition: 'width 0.3s ease'
                  }}></div>
                </div>
                <div style={{ fontSize: '10px', textAlign: 'center', color: '#6c757d' }}>
                  Memory Limit: 500 MB
                </div>
              </div>

              {/* Memory efficiency info */}
              {memoryHistory.length > 1 && (
                <div style={{ fontSize: '11px', color: '#6c757d', marginTop: '5px' }}>
                  <div>Peak Usage: {Math.round(Math.max(...memoryHistory.map(m => m.heapUsed)) / 1024 / 1024)} MB</div>
                  <div>Avg Usage: {Math.round(memoryHistory.reduce((sum, m) => sum + m.heapUsed, 0) / memoryHistory.length / 1024 / 1024)} MB</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            onClick={handleIntegrityCheck}
            disabled={isChecking}
            style={{
              padding: '10px',
              backgroundColor: isChecking ? '#6c757d' : '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isChecking ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            {isChecking ? '🔍 Checking...' : '🔍 Check Database Integrity'}
          </button>

          <button
            onClick={handleRepairDatabase}
            disabled={isRepairing}
            style={{
              padding: '10px',
              backgroundColor: isRepairing ? '#6c757d' : '#ffc107',
              color: isRepairing ? 'white' : 'black',
              border: 'none',
              borderRadius: '4px',
              cursor: isRepairing ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            {isRepairing ? '🔧 Repairing...' : '🔧 Repair Database'}
          </button>

          <button
            onClick={handleCreateBackup}
            disabled={isBackingUp}
            style={{
              padding: '10px',
              backgroundColor: isBackingUp ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isBackingUp ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            {isBackingUp ? '💾 Creating...' : '💾 Create Backup'}
          </button>
        </div>

        {/* Last Action Result */}
        {lastAction && (
          <div style={{
            marginTop: '15px',
            padding: '10px',
            backgroundColor: lastAction.success ? '#d4edda' : '#f8d7da',
            color: lastAction.success ? '#155724' : '#721c24',
            borderRadius: '4px',
            fontSize: '12px'
          }}>
            <div style={{ fontWeight: 'bold' }}>
              {lastAction.type === 'integrity-check' && '🔍 Integrity Check'}
              {lastAction.type === 'repair' && '🔧 Database Repair'}
              {lastAction.type === 'backup' && '💾 Backup Creation'}
            </div>
            <div>{lastAction.message}</div>
            <div style={{ opacity: 0.7, marginTop: '5px' }}>
              {lastAction.timestamp}
            </div>
          </div>
        )}

        {/* Security Information */}
        <div style={{
          marginTop: '15px',
          padding: '10px',
          backgroundColor: '#e2e3e5',
          borderRadius: '4px',
          fontSize: '11px'
        }}>
          <h5 style={{ margin: '0 0 5px 0', fontSize: '12px' }}>🔒 Security Features Active:</h5>
          <ul style={{ margin: 0, paddingLeft: '15px' }}>
            <li>Database stored in OS-specific secure directory</li>
            <li>File permissions restricted to owner only (Unix/Linux)</li>
            <li>Automatic backups every 6 hours</li>
            <li>Input validation and sanitization</li>
            <li>Database integrity monitoring</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DatabaseManager;
