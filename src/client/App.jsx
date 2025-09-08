import React, { useState, useEffect } from 'react';
import NotesList from './components/NotesList';
import NoteEditor from './components/NoteEditor';
import FileUploadOptimized from './components/FileUploadOptimized';
// import FileUpload from './components/FileUpload'; // Original component
import StatusBar from './components/StatusBar';
import SearchBar from './components/SearchBar';
import DebugPanel from './components/DebugPanel';

const App = () => {
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [dbStatus, setDbStatus] = useState({ isOnline: false, sqliteConnected: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredNotes, setFilteredNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    initializeApp();
    
    // Listen for app ready event from main process
    const handleAppReady = () => {
      console.log('App ready event received from main process');
      loadNotes(true); // Reload notes when app is fully ready with delay
    };
    
    window.electronAPI.onAppReady(handleAppReady);
    
    // Check database status every 3 seconds for more responsive updates
    const statusInterval = setInterval(loadDatabaseStatus, 3000);
    
    return () => {
      clearInterval(statusInterval);
      // Clean up app ready listener
      window.electronAPI.removeUploadListeners();
    };
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      searchNotes(searchQuery);
    } else {
      setFilteredNotes(notes);
    }
  }, [searchQuery, notes]);

  const initializeApp = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Wait for database to be ready
      await waitForDatabase();
      
      // Load initial data
      await loadDatabaseStatus();
      await loadNotes();
    } catch (error) {
      console.error('Error initializing app:', error);
      setError('Failed to initialize application: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const waitForDatabase = async () => {
    let retries = 10;
    while (retries > 0) {
      try {
        await window.electronAPI.getDatabaseStatus();
        return; // Database is ready
      } catch (error) {
        console.log('Waiting for database to initialize...', retries);
        await new Promise(resolve => setTimeout(resolve, 500));
        retries--;
      }
    }
    throw new Error('Database initialization timeout');
  };

  const loadNotes = async (forceReload = false) => {
    try {
      setError(null);
      
      // Add small delay if this is a forced reload after an operation
      if (forceReload) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log('Loading notes...');
      const allNotes = await window.electronAPI.getAllNotes();
      console.log('Notes loaded:', allNotes?.length || 0);
      
      setNotes(allNotes || []); // Ensure we always have an array
      setFilteredNotes(allNotes || []);
    } catch (error) {
      console.error('Error loading notes:', error);
      setError('Failed to load notes: ' + error.message);
      // Don't clear existing notes on error
      if (notes.length === 0) {
        setNotes([]);
        setFilteredNotes([]);
      }
    }
  };

  const loadDatabaseStatus = async () => {
    try {
      const status = await window.electronAPI.getDatabaseStatus();
      setDbStatus(status);
    } catch (error) {
      console.error('Error loading database status:', error);
      // Set offline status if there's an error
      setDbStatus({
        isOnline: false,
        canConnectSQLite: true,
        canConnectMySQL: false,
        message: 'Error checking connection status'
      });
    }
  };

  const handleManualSync = async () => {
    if (!dbStatus.isOnline) {
      alert('Cannot sync: Database is offline');
      return;
    }
    
    try {
      setError(null);
      await window.electronAPI.forceSync();
      await loadNotes(true); // Reload notes after sync with delay
      await loadDatabaseStatus();
      alert('Sync completed successfully!');
    } catch (error) {
      console.error('Sync error:', error);
      setError('Sync failed: ' + error.message);
      alert('Sync failed: ' + error.message);
    }
  };

  const searchNotes = async (query) => {
    try {
      const results = await window.electronAPI.searchNotes(query);
      setFilteredNotes(results);
    } catch (error) {
      console.error('Error searching notes:', error);
      // Fallback to client-side filtering
      const filtered = notes.filter(note => 
        note.title.toLowerCase().includes(query.toLowerCase()) ||
        note.content.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredNotes(filtered);
    }
  };

  const handleCreateNote = () => {
    setSelectedNote(null);
    setIsCreatingNote(true);
  };

  const handleSelectNote = (note) => {
    setSelectedNote(note);
    setIsCreatingNote(false);
  };

  const handleSaveNote = async (noteData) => {
    try {
      setError(null);
      if (selectedNote) {
        // Update existing note
        const updatedNote = await window.electronAPI.updateNote(selectedNote.id, noteData);
        console.log('Note updated:', updatedNote);
      } else {
        // Create new note
        const newNote = await window.electronAPI.createNote(noteData);
        console.log('Note created:', newNote);
      }
      
      // Reload notes to ensure UI is in sync
      await loadNotes(true); // Force reload with delay
      setIsCreatingNote(false);
      setSelectedNote(null);
    } catch (error) {
      console.error('Error saving note:', error);
      setError('Error saving note: ' + error.message);
      alert('Error saving note: ' + error.message);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (confirm('Are you sure you want to delete this note?')) {
      try {
        setError(null);
        await window.electronAPI.deleteNote(noteId);
        console.log('Note deleted:', noteId);
        
        // Clear selection if deleted note was selected
        if (selectedNote && selectedNote.id === noteId) {
          setSelectedNote(null);
          setIsCreatingNote(false);
        }
        
        // Reload notes to ensure UI is in sync
        await loadNotes(true); // Force reload with delay
      } catch (error) {
        console.error('Error deleting note:', error);
        setError('Error deleting note: ' + error.message);
        alert('Error deleting note: ' + error.message);
      }
    }
  };

  const handleForceSync = async () => {
    try {
      setError(null);
      await window.electronAPI.forceSync();
      await loadDatabaseStatus();
      await loadNotes(true); // Reload notes after force sync
      alert('Sync completed successfully!');
    } catch (error) {
      console.error('Error forcing sync:', error);
      setError('Error during sync: ' + error.message);
      alert('Error during sync: ' + error.message);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 20px',
        backgroundColor: '#2c3e50',
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{ margin: 0, fontSize: '20px' }}>📝 Offline Notes</h1>
        <button
          onClick={handleCreateNote}
          disabled={isLoading}
          style={{
            padding: '8px 16px',
            backgroundColor: isLoading ? '#6c757d' : '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer'
          }}
        >
          + New Note
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          padding: '10px 20px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderBottom: '1px solid #f5c6cb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>⚠️ {error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#721c24',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div style={{
          padding: '10px 20px',
          backgroundColor: '#d1ecf1',
          color: '#0c5460',
          borderBottom: '1px solid #bee5eb',
          textAlign: 'center'
        }}>
          🔄 Loading application...
        </div>
      )}

      {/* Search Bar */}
      <SearchBar 
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{
          width: '300px',
          borderRight: '1px solid #ddd',
          backgroundColor: '#f8f9fa',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <NotesList
            notes={filteredNotes}
            selectedNote={selectedNote}
            onSelectNote={handleSelectNote}
            onDeleteNote={handleDeleteNote}
          />
        </div>

        {/* Editor Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {(selectedNote || isCreatingNote) ? (
            <NoteEditor
              note={selectedNote}
              onSave={handleSaveNote}
              onCancel={() => {
                setSelectedNote(null);
                setIsCreatingNote(false);
              }}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
              fontSize: '18px'
            }}>
              Select a note to edit or create a new one
            </div>
          )}

          {/* File Upload Area */}
          <FileUploadOptimized
            selectedNote={selectedNote}
            onFileUploaded={() => loadNotes(true)}
          />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        dbStatus={dbStatus}
        onForceSync={handleForceSync}
        notesCount={notes.length}
      />

      {/* Debug Panel */}
      <DebugPanel
        notes={notes}
        dbStatus={dbStatus}
        isLoading={isLoading}
        error={error}
      />
    </div>
  );
};

export default App;