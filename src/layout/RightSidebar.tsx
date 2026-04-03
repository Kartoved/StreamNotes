import React from 'react';
import { MiniCalendar } from './MiniCalendar';

interface RightSidebarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedDate: string | null;
  setSelectedDate: (d: string | null) => void;
  activeDays: Set<string>;
  allTags: string[];
  selectedTags: Set<string>;
  toggleTag: (tag: string) => void;
}

export const RightSidebar = ({
  searchQuery,
  setSearchQuery,
  selectedDate,
  setSelectedDate,
  activeDays,
  allTags,
  selectedTags,
  toggleTag,
}: RightSidebarProps) => {
  return (
    <div className="right-sidebar" style={{
      width: '220px', flexShrink: 0,
      display: 'flex', flexDirection: 'column', gap: '8px',
      overflowY: 'auto', paddingTop: '14px',
    }}>
      <div style={{ marginBottom: '8px' }}>
        <input
          type="search"
          className="search-bar"
          placeholder="🔍 Поиск..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          data-lpignore="true"
        />
      </div>

      <div style={{ padding: '0 4px', marginBottom: '8px' }}>
        <MiniCalendar
          activeDays={activeDays}
          selectedDate={selectedDate}
          onSelectDate={(d) => { setSelectedDate(d); }}
        />
        {selectedDate && (
          <button
            onClick={() => setSelectedDate(null)}
            style={{ marginTop: '8px', width: '100%', background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-faint)', borderRadius: 'var(--radius)', padding: '4px', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
          >✕ Сбросить дату</button>
        )}
      </div>

      {allTags.length > 0 && (
        <div style={{ padding: '0 4px', marginTop: '12px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginBottom: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', paddingLeft: '4px' }}>Теги</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {allTags.map(tag => (
              <span
                key={tag}
                className={`tag-pill${selectedTags.has(tag) ? ' active' : ''}`}
                onClick={() => toggleTag(tag)}
              >{tag}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
