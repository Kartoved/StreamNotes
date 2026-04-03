import React, { useState } from 'react';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
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

  const rawDay = new Date(year, month, 1).getDay(); // 0=Sun
  const firstDay = (rawDay + 6) % 7; // convert to Mon=0 … Sun=6
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = today.toISOString().slice(0, 10);

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // All sizes ×1.3 vs original
  const btnBase: React.CSSProperties = {
    background: 'none', border: 'none', color: 'var(--text-sub)',
    cursor: 'pointer', fontSize: '1.17rem', padding: '2px 8px',
    lineHeight: 1,
  };

  return (
    <div>
      {/* Month header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <button style={btnBase} onClick={prev}>‹</button>
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.01em' }}>{MONTHS[month]} {year}</span>
        <button style={btnBase} onClick={next}>›</button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '4px' }}>
        {DAYS.map(d => <div key={d} style={{ fontSize: '0.72rem', color: 'var(--text-faint)', padding: '3px 0', fontWeight: 600 }}>{d}</div>)}
      </div>

      {/* Day cells */}
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
                textAlign: 'center',
                padding: '6px 2px',          /* was 4px — ×1.3 */
                borderRadius: '5px',
                cursor: hasNotes ? 'pointer' : 'default',
                fontSize: '0.85rem',          /* was 0.78rem — ×1.3 */
                background: isSelected
                  ? 'var(--text)'
                  : isToday
                    ? 'var(--bg-hover)'
                    : 'transparent',
                color: isSelected
                  ? 'var(--bg)'
                  : isToday
                    ? 'var(--text)'
                    : hasNotes
                      ? 'var(--text)'
                      : 'var(--text-faint)',
                fontWeight: isToday || isSelected ? 700 : hasNotes ? 500 : 400,
                opacity: hasNotes || isToday || isSelected ? 1 : 0.55,
                position: 'relative',
                transition: 'background 0.1s',
              }}
            >
              {day}
              {hasNotes && !isSelected && (
                <div style={{
                  position: 'absolute', bottom: '2px', left: '50%',
                  transform: 'translateX(-50%)',
                  width: '4px', height: '4px',
                  borderRadius: '50%', background: 'var(--text-sub)',
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
