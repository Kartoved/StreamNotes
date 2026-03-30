import React, { useState, useRef } from 'react';
import { useDB } from './db/DBContext';
import { Feed } from './components/Feed';
import { TweetEditor } from './components/LexicalEditor';
import './index.css';

function App() {
  const db = useDB();
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [focusedTweetId, setFocusedTweetId] = useState<string | null>(null);
  const [replyingToTweetId, setReplyingToTweetId] = useState<string | null>(null);

  // Глобальный твит (в корень ленты или в корень ветки)
  const insertRootNote = async (astText: string, propsJson: string) => {
    const id = "note-" + Math.random().toString(36).substring(2, 9);
    const now = Date.now();
    
    await db.exec(`
      INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
      [id, focusedTweetId, 'local-user', astText, Date.now().toString(), propsJson, now, now]
    );
  };

  // Инлайн твит (ответ конкретно под выбранным элементом)
  const handleInlineReply = async (parentId: string, astText: string, propsJson: string) => {
    const id = "note-" + Math.random().toString(36).substring(2, 9);
    const now = Date.now();
    await db.exec(`
      INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
      [id, parentId, 'local-user', astText, Date.now().toString(), propsJson, now, now]
    );
    setReplyingToTweetId(null);
  };

  const [editingTweet, setEditingTweet] = useState<any>(null); // Note type

  const handleEditSubmit = async (noteId: string, astText: string, propsJson: string) => {
    const now = Date.now();
    await db.exec(`
      UPDATE notes SET content = ?, properties = ?, updated_at = ?
      WHERE id = ?`, 
      [astText, propsJson, now, noteId]
    );
    setEditingTweet(null);
  };

  return (
    <div className="app-container">
      <header style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
        {focusedTweetId && (
          <button 
             onClick={() => { setFocusedTweetId(null); setReplyingToTweetId(null); }}
             style={{ marginRight: '1rem', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer' }}
          >
            ← В корень
          </button>
        )}
        <div>
           <h1 style={{ margin: 0, fontSize: '1.8rem' }}>
             StreamNotes
           </h1>
           <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
             {focusedTweetId ? 'Ветка обсуждения' : 'Главная лента'}
           </p>
        </div>
      </header>
      
      <main>
        <div style={{ 
          marginBottom: '2rem', padding: '1.5rem', borderRadius: '16px',
          background: 'var(--card-bg)', backdropFilter: 'blur(12px)',
          border: '1px solid var(--border)' 
        }}>
          <TweetEditor 
             placeholder={focusedTweetId ? "Оставить ответ в ветке..." : "Что происходит?"}
             buttonText="Твитнуть"
             onSubmit={insertRootNote}
          />
        </div>

        <Feed 
            parentId={focusedTweetId} 
            onNoteClick={(id) => { setFocusedTweetId(id); setReplyingToTweetId(null); }}
            replyingToId={replyingToTweetId}
          editingNote={editingTweet}
          onStartReply={setReplyingToTweetId}
          onCancelReply={() => setReplyingToTweetId(null)}
          onSubmitReply={handleInlineReply}
          onStartEdit={setEditingTweet}
          onCancelEdit={() => setEditingTweet(null)}
          onSubmitEdit={handleEditSubmit}
        />

      </main>
    </div>
  );
}

export default App;
