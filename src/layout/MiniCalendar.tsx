import React, { useState } from 'react';

const DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

export const MiniCalendar = ({
  activeDays,
  selectedDate,
  onSelectDate,
}: {
  activeDays: Set<string>;
  selectedDate: string | null;
  onSelectDate: (d: string | null) => void;
}) => {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = today.toISOString().slice(0, 10);

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const btnBase: React.CSSProperties = {
    background: 'none', border: 'none', color: 'var(--text-muted)',
    cursor: 'pointer', fontSize: '0.9rem', padding: '2px 6px',
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <button style={btnBase} onClick={prev}>‹</button>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>{MONTHS[month]} {year}</span>
        <button style={btnBase} onClick={next}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '2px' }}>
        {DAYS.map(d => <div key={d} style={{ fontSize: '0.65rem', color: 'var(--text-muted)', padding: '2px 0' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = iso === todayStr;
          const isSelected = iso === selectedDate;
          const hasNotes = activeDays.has(iso);
          return (
            <div
              key={iso}
              onClick={() => onSelectDate(isSelected ? null : iso)}
              style={{
                textAlign: 'center', padding: '4px 2px',
                borderRadius: '6px', cursor: hasNotes ? 'pointer' : 'default',
                fontSize: '0.78rem',
                background: isSelected ? 'var(--accent)' : isToday ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: isSelected ? 'white' : isToday ? 'var(--accent)' : hasNotes ? 'var(--text-main)' : 'var(--text-muted)',
                fontWeight: isToday || isSelected ? 700 : hasNotes ? 500 : 400,
                opacity: hasNotes || isToday ? 1 : 0.4,
                position: 'relative', transition: 'background 0.12s',
              }}
            >
              {day}
              {hasNotes && !isSelected && (
                <div style={{ position: 'absolute', bottom: '1px', left: '50%', transform: 'translateX(-50%)', width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
