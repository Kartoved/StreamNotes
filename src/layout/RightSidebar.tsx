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
  clearTags: () => void;
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
  clearTags,
}: RightSidebarProps) => {
  return (
    <div className="right-sidebar" style={{
      width: '220px', flexShrink: 0,
      display: 'flex', flexDirection: 'column', gap: '8px',
      overflowY: 'auto', paddingTop: '14px',
      borderLeft: '1px solid var(--line)',
      padding: '14px 12px',
      background: 'var(--bg)',
    }}>
      <div className="sidebar-search-wrapper" style={{ marginBottom: '8px', position: 'relative' }}>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="var(--text-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        >
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          className="search-bar"
          placeholder="Поиск..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          data-lpignore="true"
          style={{ paddingLeft: '28px', paddingRight: '28px' }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            title="Очистить поиск"
            style={{
              position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px',
              transition: 'color 0.1s'
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
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
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', paddingLeft: '4px' }}>Теги</div>
            {selectedTags.size > 0 && (
              <button
                onClick={clearTags}
                style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-faint)', borderRadius: 'var(--radius)', padding: '2px 7px', fontSize: '0.68rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >✕ Сбросить</button>
            )}
          </div>
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
