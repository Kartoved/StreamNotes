import React, { useState, useRef, useEffect } from 'react';

// ── Status Select ────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  none: 'var(--text-faint)',
  todo: '#e06c75',
  doing: '#6095ed',
  done: '#5c9e6e',
  archived: 'var(--text-faint)',
};

export function CustomStatusSelect({ value, options, onChange, style }: { value: string, options: string[], onChange: (v: string) => void, style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const color = STATUS_COLOR[value] || 'var(--text-sub)';

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onMouseDown={e => { e.preventDefault(); setOpen(!open); }}
        style={{
          ...style,
          background: 'var(--bg-hover)',
          color: color,
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          padding: '2px 8px',
          fontSize: '0.8rem',
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.1s',
          outline: 'none',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-active)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      >
        {value}
      </button>
      
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '6px',
          background: 'var(--bg)',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 4000,
          display: 'flex',
          flexDirection: 'column',
          padding: '4px',
          minWidth: '100px',
        }}>
          {options.map(opt => (
            <div
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              style={{
                padding: '6px 10px',
                fontSize: '0.82rem',
                fontFamily: 'var(--font-mono)',
                color: STATUS_COLOR[opt] || 'var(--text)',
                cursor: 'pointer',
                borderRadius: 'var(--radius)',
                background: value === opt ? 'var(--bg-active)' : 'transparent',
              }}
              onMouseEnter={e => { if (value !== opt) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { if (value !== opt) e.currentTarget.style.background = 'transparent'; }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DatePicker ────────────────────────────────────────────────────────

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // 0 is Monday
}

export function CustomDateSelect({ value, onChange, style }: { value: string, onChange: (v: string) => void, style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  const initialDate = value ? new Date(value) : new Date();
  const [currentMonth, setCurrentMonth] = useState(initialDate.getMonth());
  const [currentYear, setCurrentYear] = useState(initialDate.getFullYear());

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  
  const handleDayClick = (day: number) => {
    const d = new Date(currentYear, currentMonth, day);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setOpen(false);
  };
  
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };
  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const offset = getFirstDayOfMonth(currentYear, currentMonth);
  
  const renderGrid = () => {
    const cells = [];
    for (let i = 0; i < offset; i++) {
        cells.push(<div key={`empty-${i}`} style={{ width: '30px', height: '30px' }} />);
    }
    
    // Find currently selected day
    let selectedYear = -1, selectedMonth = -1, selectedDay = -1;
    if (value) {
        const parts = value.split('-');
        selectedYear = parseInt(parts[0], 10);
        selectedMonth = parseInt(parts[1], 10) - 1;
        selectedDay = parseInt(parts[2], 10);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const isSelected = selectedYear === currentYear && selectedMonth === currentMonth && selectedDay === day;
        cells.push(
            <div
              key={`day-${day}`}
              onClick={(e) => { e.stopPropagation(); handleDayClick(day); }}
              style={{
                  width: '30px', height: '30px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  borderRadius: isSelected ? '4px' : '4px',
                  background: isSelected ? '#1d4ed8' : 'transparent',
                  color: isSelected ? '#fff' : 'var(--text)',
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: isSelected ? 700 : 400,
                  transition: 'background 0.1s',
                  boxShadow: isSelected ? '0 0 0 2px var(--bg), 0 0 0 4px #1d4ed8' : 'none'
              }}
              onMouseEnter={e => { if (!isSelected) (e.currentTarget.style.background = 'var(--bg-hover)'); }}
              onMouseLeave={e => { if (!isSelected) (e.currentTarget.style.background = 'transparent'); }}
            >
              {day}
            </div>
        );
    }
    return cells;
  }

  // Format value for display
  let displayValue = 'дд.мм.гггг';
  if (value) {
      const p = value.split('-');
      if (p.length === 3) displayValue = `${p[2]}.${p[1]}.${p[0]}`;
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onMouseDown={e => { e.preventDefault(); setOpen(!open); }}
        style={{
          ...style,
          background: 'var(--bg-hover)',
          color: value ? 'var(--text)' : 'var(--text-faint)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          padding: '2px 8px',
          fontSize: '0.8rem',
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'all 0.1s',
          outline: 'none',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-active)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      >
        <span>{displayValue}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '6px',
          background: 'var(--bg)',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          zIndex: 4000,
          padding: '16px',
          width: 'max-content',
          minWidth: '266px',
        }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text)' }}>
                    {MONTHS[currentMonth]} {currentYear}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={prevMonth} type="button" style={{ background:'none', border:'none', color:'var(--text)', cursor:'pointer' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <button onClick={nextMonth} type="button" style={{ background:'none', border:'none', color:'var(--text)', cursor:'pointer' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
                {DAYS.map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-sub)' }}>{d}</div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {renderGrid()}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
                <button type="button" onClick={() => { onChange(''); setOpen(false); }} style={{ background:'none', border:'none', color:'#e06c75', fontSize:'0.8rem', cursor:'pointer' }}>Удалить</button>
                <button type="button" onClick={() => { 
                    const d = new Date();
                    onChange(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
                    setOpen(false);
                 }} style={{ background:'none', border:'none', color:'#1d4ed8', fontSize:'0.8rem', cursor:'pointer' }}>Сегодня</button>
            </div>
        </div>
      )}
    </div>
  );
}
