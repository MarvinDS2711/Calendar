// Les dates "YYYY-MM-DD" sont des dates de calendrier à Paris : on les manipule en UTC
// pour éviter tout décalage lié au fuseau du navigateur.
export const TZ = 'Europe/Paris';

export const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const toIso = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
};

const fmt = (opts) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...opts });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const fmtDateLong = (s) => cap(fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parseDate(s)));
export const fmtDateMedium = (s) => cap(fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(parseDate(s)));
export const fmtDateShort = (s) => fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseDate(s));
export const fmtDayShort = (s) => cap(fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(parseDate(s)));
export const fmtMonth = (s) => cap(fmt({ month: 'long', year: 'numeric' }).format(parseDate(s)));
export const weekdayShort = (s) => cap(fmt({ weekday: 'short' }).format(parseDate(s)).replace('.', ''));
export const fmtTime = (t) => t.replace(':', 'h');

export const addMinutes = (time, minutes) => {
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** Date du jour à Paris, "YYYY-MM-DD" */
export const todayParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

/** "+33612345678" -> "06 12 34 56 78" */
export function fmtPhone(p) {
  if (!p) return '';
  if (/^\+33\d{9}$/.test(p)) return ('0' + p.slice(3)).replace(/(\d{2})(?=\d)/g, '$1 ');
  return p.replace(/^(\+\d{2,3})(\d+)$/, (_, cc, rest) => `${cc} ${rest.replace(/(\d{2,3})(?=\d)/g, '$1 ')}`);
}

/** Côté client : même règle que le serveur */
export function normalizePhone(raw) {
  let s = String(raw || '').replace(/[\s.\-()/]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^0[1-9]\d{8}$/.test(s)) return '+33' + s.slice(1);
  if (/^\+33[1-9]\d{8}$/.test(s)) return s;
  if (/^\+(?!33)[1-9]\d{6,14}$/.test(s)) return s;
  return null;
}

/** Formatage pendant la saisie : 0612345678 -> 06 12 34 56 78 */
export function formatPhoneInput(v) {
  const s = v.replace(/[^\d+]/g, '');
  if (/^0\d*$/.test(s)) return s.slice(0, 10).replace(/(\d{2})(?=\d)/g, '$1 ');
  return v.replace(/[^\d+ ]/g, '').slice(0, 20);
}

export const telHref = (p) => `tel:${p}`;
export const mailHref = (e) => `mailto:${e}`;

export const initials = (a) => `${a.firstName?.[0] || ''}${a.lastName?.[0] || ''}`.toUpperCase();

export const STATUS = {
  confirmed: { label: 'Planifié', tone: 'info' },
  completed: { label: 'Effectué', tone: 'success' },
  cancelled: { label: 'Annulé', tone: 'muted' },
};

/** Un RDV "confirmé" dont l'heure est passée est à clôturer. */
export const isPast = (a) => new Date(a.startUtc).getTime() + a.duration * 60000 < Date.now();

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const DOMAINS = ['gmail.com', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'yahoo.fr', 'yahoo.com', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'laposte.net', 'icloud.com', 'live.fr', 'bbox.fr'];

function distance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Suggestion en cas de faute de frappe probable : "gmial.com" -> "gmail.com" */
export function suggestEmail(email) {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || DOMAINS.includes(domain)) return null;
  let best = null;
  for (const d of DOMAINS) {
    const dist = distance(domain, d);
    if (dist > 0 && dist <= 2 && (!best || dist < best.dist)) best = { d, dist };
  }
  return best ? email.slice(0, at + 1) + best.d : null;
}

/** Fichier .ics pour ajouter le RDV à son agenda */
export function buildIcs({ date, time, duration, reference, company }) {
  const [y, mo, d] = date.split('-');
  const start = `${y}${mo}${d}T${time.replace(':', '')}00`;
  const end = `${y}${mo}${d}T${addMinutes(time, duration).replace(':', '')}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${company}//Rendez-vous//FR`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${reference}@inovacom`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Paris:${start}`,
    `DTEND;TZID=Europe/Paris:${end}`,
    `SUMMARY:${company} — Migration de votre messagerie`,
    `DESCRIPTION:Un technicien ${company} vous appellera à l'heure du rendez-vous. Référence : ${reference}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Rendez-vous migration messagerie',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
