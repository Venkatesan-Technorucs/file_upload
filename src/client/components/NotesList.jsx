import React from 'react';

const NotesList = ({ notes, selectedNote, onSelectNote, onDeleteNote }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const truncateContent = (content, maxLength = 100) => {
    if (!content) return '';
    return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
  };

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {notes.length === 0 ? (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          color: '#666'
        }}>
          No notes found
        </div>
      ) : (
        notes.map(note => (
          <div
            key={note.id}
            style={{
              padding: '12px',
              borderBottom: '1px solid #eee',
              cursor: 'pointer',
              backgroundColor: selectedNote && selectedNote.id === note.id ? '#e3f2fd' : 'transparent',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}
            onClick={() => onSelectNote(note)}
          >
            <div style={{ flex: 1, marginRight: '8px' }}>
              <div style={{
                fontWeight: 'bold',
                marginBottom: '4px',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                {note.title}
                {!note.synced && (
                  <span style={{
                    backgroundColor: '#ff9800',
                    color: 'white',
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '10px'
                  }}>
                    OFFLINE
                  </span>
                )}
              </div>
              <div style={{
                fontSize: '12px',
                color: '#666',
                marginBottom: '4px'
              }}>
                {truncateContent(note.content)}
              </div>
              <div style={{
                fontSize: '11px',
                color: '#999'
              }}>
                {formatDate(note.updatedAt)}
              </div>
              {note.files && note.files.length > 0 && (
                <div style={{
                  fontSize: '11px',
                  color: '#2196f3',
                  marginTop: '4px'
                }}>
                  📎 {note.files.length} file{note.files.length > 1 ? 's' : ''}
                </div>
              )}
              {note.tags && note.tags.length > 0 && (
                <div style={{ marginTop: '4px' }}>
                  {note.tags.map(tag => (
                    <span
                      key={tag}
                      style={{
                        backgroundColor: '#e0e0e0',
                        color: '#333',
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        marginRight: '4px'
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteNote(note.id);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#f44336',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '4px'
              }}
              title="Delete note"
            >
              🗑️
            </button>
          </div>
        ))
      )}
    </div>
  );
};

export default NotesList;
