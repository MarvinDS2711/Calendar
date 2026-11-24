import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const CANDIDATES = ['logo.svg', 'logo.png', 'logo.webp', 'logo.jpg', 'logo.jpeg'];

/** Renvoie l'URL publique du logo s'il a été déposé dans /branding, sinon null. */
export function logoInfo() {
  for (const name of CANDIDATES) {
    const file = path.join(config.brandingDir, name);
    try {
      const st = fs.statSync(file);
      if (st.isFile() && st.size > 0) {
        return { url: `/brand/${name}?v=${Math.round(st.mtimeMs)}`, type: path.extname(name).slice(1) };
      }
    } catch {
      /* absent */
    }
  }
  return null;
}
