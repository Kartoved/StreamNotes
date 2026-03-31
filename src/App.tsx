import React, { useState, useRef } from 'react';
import { useDB } from './db/DBContext';
import { Feed } from './components/Feed';
import { TweetEditor } from './components/TiptapEditor';
import './index.css';

function App() {
  const db = useDB();
  const inputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    (window as any).db = db;
  }, [db]);
  
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
      <header style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.75rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.1rem', background: '-webkit-linear-gradient(45deg, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          StreamNotes
        </h1>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          {focusedTweetId ? 'Ветка обсуждения' : 'Главная лента'}
        </span>
        {focusedTweetId && (
          <button
             onClick={() => { setFocusedTweetId(null); setReplyingToTweetId(null); }}
             style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '2px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            ← В корень
          </button>
        )}
      </header>
      
      <main>
        <div style={{ marginBottom: '0.75rem' }}>
          <TweetEditor 
             placeholder={focusedTweetId ? "Оставить ответ в ветке..." : "Что происходит?"}
             buttonText="Твитнуть"
             onSubmit={insertRootNote}
             autoFocus={true}
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
