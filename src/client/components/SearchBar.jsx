import React from 'react';

const SearchBar = ({ searchQuery, onSearchChange }) => {
  const handleClear = () => {
    onSearchChange('');
  };

  return (
    <div style={{
      padding: '10px 20px',
      backgroundColor: '#ecf0f1',
      borderBottom: '1px solid #bdc3c7',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }}>
      <div style={{ position: 'relative', flex: 1 }}>
        <input
          type="text"
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px 8px 35px',
            border: '1px solid #bdc3c7',
            borderRadius: '20px',
            fontSize: '14px',
            outline: 'none',
            backgroundColor: 'white'
          }}
        />
        <span style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#7f8c8d',
          fontSize: '14px'
        }}>
          🔍
        </span>
        {searchQuery && (
          <button
            onClick={handleClear}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#7f8c8d',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '2px'
            }}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>
      
      {searchQuery && (
        <div style={{
          fontSize: '12px',
          color: '#7f8c8d',
          whiteSpace: 'nowrap'
        }}>
          Searching for: "{searchQuery}"
        </div>
      )}
    </div>
  );
};

export default SearchBar;
