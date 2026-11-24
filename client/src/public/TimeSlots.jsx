import { motion } from 'framer-motion';
import { Sun, Sunset, Moon, CalendarSearch } from 'lucide-react';
import { fmtDateMedium, fmtTime } from '../lib/format.js';

const GROUPS = [
  { key: 'morning', label: 'Matin', icon: Sun, test: (t) => t < '12:00' },
  { key: 'afternoon', label: 'Après-midi', icon: Sunset, test: (t) => t >= '12:00' && t < '18:00' },
  { key: 'evening', label: 'Soir', icon: Moon, test: (t) => t >= '18:00' },
];

export default function TimeSlots({ date, slots, selected, onSelect }) {
  if (!date) {
    return (
      <div className="slots slots--empty">
        <CalendarSearch size={28} strokeWidth={1.5} />
        <p>Sélectionnez une date pour afficher les horaires disponibles.</p>
      </div>
    );
  }
  return (
    <div className="slots">
      <h3 className="slots__title">{fmtDateMedium(date)}</h3>
      <p className="slots__subtitle">{slots.length} horaire{slots.length > 1 ? 's' : ''} disponible{slots.length > 1 ? 's' : ''}</p>
      <motion.div key={date} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.018 } } }}>
        {GROUPS.map(({ key, label, icon: Icon, test }) => {
          const list = slots.filter(test);
          if (!list.length) return null;
          return (
            <div className="slots__group" key={key}>
              <div className="slots__group-label">
                <Icon size={15} /> {label}
              </div>
              <div className="slots__grid">
                {list.map((t) => (
                  <motion.button
                    type="button"
                    key={t}
                    variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                    className={`slot ${selected === t ? 'is-selected' : ''}`}
                    aria-pressed={selected === t}
                    onClick={() => onSelect(t)}
                  >
                    {fmtTime(t)}
                  </motion.button>
                ))}
              </div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
