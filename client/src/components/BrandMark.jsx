import { useBrand } from '../lib/brand.jsx';

/**
 * Marque INOVACOM : logo officiel (déposé dans /branding) ou, à défaut, le nom de l'entreprise
 * en texte. Aucun faux logo n'est dessiné.
 */
export default function BrandMark({ size = 36, showName = true, inverted = false, className = '' }) {
  const { config } = useBrand() || {};
  const name = config?.companyName || 'INOVACOM';
  const logo = config?.logo;
  return (
    <span className={`brandmark ${inverted ? 'brandmark--inverted' : ''} ${className}`}>
      {logo && <img src={logo.url} alt={showName ? '' : name} style={{ height: size, width: 'auto' }} />}
      {(showName || !logo) && <span className="brandmark__name">{name}</span>}
    </span>
  );
}
