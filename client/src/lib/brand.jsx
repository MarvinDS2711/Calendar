import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const BrandContext = createContext(null);

export function BrandProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setConfig(await api.get('/api/public/config'));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Favicon = logo officiel lorsqu'il est disponible
  useEffect(() => {
    if (!config?.logo) return;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = config.logo.url;
  }, [config?.logo]);

  return <BrandContext.Provider value={{ config, error, reload: load }}>{children}</BrandContext.Provider>;
}

export const useBrand = () => useContext(BrandContext);
