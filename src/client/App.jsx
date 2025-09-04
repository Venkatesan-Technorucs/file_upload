import React, { useState, useEffect } from 'react';
import NotesList from './components/NotesList';
import NoteEditor from './components/NoteEditor';
import FileUpload from './components/FileUpload';
import StatusBar from './components/StatusBar';
import SearchBar from './components/SearchBar';

const App = () => {
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [dbStatus, setDbStatus] = useState({ isOnline: false, sqliteConnected: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredNotes, setFilteredNotes] = useState([]);

  useEffect(() => {
    loadNotes();
    loadDatabaseStatus();
    
    // Check database status every 3 seconds for more responsive updates
    const statusInterval = setInterval(loadDatabaseStatus, 3000);
    
    return () => clearInterval(statusInterval);
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      searchNotes(searchQuery);
    } else {
      setFilteredNotes(notes);
    }
  }, [searchQuery, notes]);

  const loadNotes = async () => {
    try {
      const allNotes = await window.electronAPI.getAllNotes();
      setNotes(allNotes);
      setFilteredNotes(allNotes);
    } catch (error) {
      console.error('Error loading notes:', error);
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
      await window.electronAPI.syncToOnline();
      await loadNotes(); // Reload notes after sync
      alert('Sync completed successfully!');
    } catch (error) {
      console.error('Sync error:', error);
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
      if (selectedNote) {
        // Update existing note
        await window.electronAPI.updateNote(selectedNote.id, noteData);
      } else {
        // Create new note
        await window.electronAPI.createNote(noteData);
      }
      
      await loadNotes();
      setIsCreatingNote(false);
      setSelectedNote(null);
    } catch (error) {
      console.error('Error saving note:', error);
      alert('Error saving note: ' + error.message);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (confirm('Are you sure you want to delete this note?')) {
      try {
        await window.electronAPI.deleteNote(noteId);
        await loadNotes();
        
        // Clear selection if deleted note was selected
        if (selectedNote && selectedNote.id === noteId) {
          setSelectedNote(null);
          setIsCreatingNote(false);
        }
      } catch (error) {
        console.error('Error deleting note:', error);
        alert('Error deleting note: ' + error.message);
      }
    }
  };

  const handleForceSync = async () => {
    try {
      await window.electronAPI.forceSync();
      await loadDatabaseStatus();
      alert('Sync completed successfully!');
    } catch (error) {
      console.error('Error forcing sync:', error);
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
          style={{
            padding: '8px 16px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          + New Note
        </button>
      </div>

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
          <FileUpload
            selectedNote={selectedNote}
            onFileUploaded={loadNotes}
          />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        dbStatus={dbStatus}
        onForceSync={handleForceSync}
        notesCount={notes.length}
      />
    </div>
  );
};

export default App;