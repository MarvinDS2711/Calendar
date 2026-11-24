import { forwardRef, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, AlertTriangle } from 'lucide-react';
import { STATUS } from '../lib/format.js';

export const Spinner = ({ size = 22, className = '' }) => (
  <span className={`spinner ${className}`} style={{ width: size, height: size }} role="status" aria-label="Chargement" />
);

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, icon: Icon, iconRight: IconRight, children, className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`btn btn--${variant} btn--${size} ${loading ? 'is-loading' : ''} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Spinner size={18} /> : Icon && <Icon size={size === 'sm' ? 16 : 18} strokeWidth={2} aria-hidden />}
      {children && <span>{children}</span>}
      {!loading && IconRight && <IconRight size={18} strokeWidth={2} aria-hidden />}
    </button>
  );
});

export function Field({ label, hint, error, required, children, className = '', id: idProp }) {
  const auto = useId();
  const id = idProp || auto;
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
      {label && (
        <label htmlFor={id} className="field__label">
          {label} {required && <span className="field__req" aria-hidden>*</span>}
        </label>
      )}
      {typeof children === 'function' ? children({ id, 'aria-invalid': !!error, 'aria-describedby': error || hint ? `${id}-msg` : undefined }) : children}
      <AnimatePresence initial={false}>
        {(error || hint) && (
          <motion.p
            key={error ? 'e' : 'h'}
            id={`${id}-msg`}
            className={error ? 'field__error' : 'field__hint'}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {error || hint}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export const StatusBadge = ({ status, past }) => {
  const s = STATUS[status];
  if (status === 'confirmed' && past) return <span className="badge badge--warning">À clôturer</span>;
  return <span className={`badge badge--${s.tone}`}>{s.label}</span>;
};

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector('input, select, textarea, button:not(.modal__close)')?.focus(), 60);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`modal modal--${size}`}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <header className="modal__header">
              <div>
                <h2>{title}</h2>
                {subtitle && <p>{subtitle}</p>}
              </div>
              <button className="icon-btn modal__close" onClick={onClose} aria-label="Fermer">
                <X size={20} />
              </button>
            </header>
            <div className="modal__body">{children}</div>
            {footer && <footer className="modal__footer">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmer', danger, loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Retour
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm">
        {danger && (
          <span className="confirm__icon">
            <AlertTriangle size={22} />
          </span>
        )}
        <p>{message}</p>
      </div>
    </Modal>
  );
}

export const EmptyState = ({ icon: Icon, title, children, action }) => (
  <div className="empty">
    {Icon && (
      <span className="empty__icon">
        <Icon size={26} strokeWidth={1.6} />
      </span>
    )}
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {action}
  </div>
);

export const Toggle = ({ checked, onChange, label, id }) => (
  <button type="button" role="switch" id={id} aria-checked={checked} aria-label={label} className={`toggle ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)}>
    <span className="toggle__thumb" />
  </button>
);
