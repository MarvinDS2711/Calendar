import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseDate, toIso, fmtMonth, fmtDateLong } from '../lib/format.js';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function monthGrid(monthIso) {
  const first = parseDate(monthIso.slice(0, 7) + '-01');
  const offset = (first.getUTCDay() + 6) % 7; // lundi = 0
  const start = new Date(first);
  start.setUTCDate(1 - offset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    cells.push(toIso(d));
  }
  // Retire la dernière semaine si elle est entièrement hors du mois
  return cells.slice(35, 42).every((c) => c.slice(0, 7) !== monthIso.slice(0, 7)) ? cells.slice(0, 35) : cells;
}

const shiftMonth = (m, n) => {
  const d = parseDate(m.slice(0, 7) + '-01');
  d.setUTCMonth(d.getUTCMonth() + n);
  return toIso(d).slice(0, 7);
};

export default function Calendar({ month, onMonthChange, days, selected, onSelect, today, maxDate, direction }) {
  const cells = useMemo(() => monthGrid(month), [month]);
  const current = month.slice(0, 7);
  const canPrev = current > today.slice(0, 7);
  const canNext = maxDate && shiftMonth(current, 1) <= maxDate.slice(0, 7);

  return (
    <div className="calendar">
      <div className="calendar__head">
        <button type="button" className="icon-btn" disabled={!canPrev} onClick={() => onMonthChange(shiftMonth(current, -1), -1)} aria-label="Mois précédent">
          <ChevronLeft size={20} />
        </button>
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.h3
            key={current}
            custom={direction}
            initial={{ opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -24 }}
            transition={{ duration: 0.22 }}
            aria-live="polite"
          >
            {fmtMonth(current + '-01')}
          </motion.h3>
        </AnimatePresence>
        <button type="button" className="icon-btn" disabled={!canNext} onClick={() => onMonthChange(shiftMonth(current, 1), 1)} aria-label="Mois suivant">
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="calendar__grid" role="grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar__weekday" role="columnheader">
            {w}
          </div>
        ))}
        {cells.map((iso) => {
          const inMonth = iso.slice(0, 7) === current;
          const count = days[iso]?.length || 0;
          const available = inMonth && count > 0;
          const isSel = iso === selected;
          return (
            <button
              type="button"
              key={iso}
              role="gridcell"
              className={[
                'calendar__day',
                !inMonth && 'is-outside',
                available && 'is-available',
                isSel && 'is-selected',
                iso === today && 'is-today',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!available}
              aria-selected={isSel}
              aria-label={`${fmtDateLong(iso)}${available ? `, ${count} créneau${count > 1 ? 'x' : ''} disponible${count > 1 ? 's' : ''}` : ', indisponible'}`}
              onClick={() => onSelect(iso)}
            >
              {inMonth ? Number(iso.slice(8)) : ''}
              {available && <span className="calendar__dot" aria-hidden />}
              {isSel && <motion.span layoutId="day-selection" className="calendar__selection" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
            </button>
          );
        })}
      </div>
      <div className="calendar__legend">
        <span>
          <i className="legend-dot legend-dot--on" /> Disponible
        </span>
        <span>
          <i className="legend-dot" /> Complet ou fermé
        </span>
      </div>
    </div>
  );
}
