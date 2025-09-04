import React, { useState, useEffect } from 'react';

const NoteEditor = ({ note, onSave, onCancel }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (note) {
      setTitle(note.title || '');
      setContent(note.content || '');
      setTags(note.tags ? note.tags.join(', ') : '');
    } else {
      setTitle('');
      setContent('');
      setTags('');
    }
  }, [note]);

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter a title for the note');
      return;
    }

    setIsSaving(true);
    try {
      const tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      await onSave({
        title: title.trim(),
        content: content.trim(),
        tags: tagsArray
      });
    } catch (error) {
      console.error('Error saving note:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      padding: '20px'
    }}>
      {/* Editor Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h2 style={{ margin: 0 }}>
          {note ? 'Edit Note' : 'Create New Note'}
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              backgroundColor: '#95a5a6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !title.trim()}
            style={{
              padding: '8px 16px',
              backgroundColor: isSaving || !title.trim() ? '#bdc3c7' : '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isSaving || !title.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            {isSaving ? 'Saving...' : 'Save (Ctrl+S)'}
          </button>
        </div>
      </div>

      {/* Title Input */}
      <input
        type="text"
        placeholder="Note title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          fontSize: '18px',
          fontWeight: 'bold',
          padding: '12px',
          border: '2px solid #ddd',
          borderRadius: '4px',
          marginBottom: '15px',
          outline: 'none'
        }}
        autoFocus
      />

      {/* Tags Input */}
      <input
        type="text"
        placeholder="Tags (comma separated)..."
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          fontSize: '14px',
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          marginBottom: '15px',
          outline: 'none'
        }}
      />

      {/* Content Textarea */}
      <textarea
        placeholder="Start writing your note..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          flex: 1,
          fontSize: '14px',
          padding: '12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          resize: 'none',
          outline: 'none',
          fontFamily: 'inherit',
          lineHeight: '1.5'
        }}
      />

      {/* Files Display */}
      {note && note.files && note.files.length > 0 && (
        <div style={{
          marginTop: '15px',
          padding: '12px',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px'
        }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
            Attached Files ({note.files.length})
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {note.files.map(file => (
              <div
                key={file.id}
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'white',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>📎</span>
                <span>{file.originalName}</span>
                <span style={{ color: '#666' }}>
                  ({window.electronAPI?.formatFileSize(file.fileSize) || file.fileSize})
                </span>
                {!file.synced && (
                  <span style={{
                    backgroundColor: '#ff9800',
                    color: 'white',
                    fontSize: '9px',
                    padding: '1px 4px',
                    borderRadius: '8px'
                  }}>
                    OFFLINE
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{
        marginTop: '10px',
        fontSize: '12px',
        color: '#666',
        textAlign: 'center'
      }}>
        Use Ctrl+S to save • Files can be uploaded in the area below
      </div>
    </div>
  );
};

export default NoteEditor;
