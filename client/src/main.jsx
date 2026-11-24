import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import './styles/base.css';
import './styles/public.css';
import './styles/admin.css';
import { BrandProvider } from './lib/brand.jsx';
import { ToastProvider } from './components/Toast.jsx';
import BookingPage from './public/BookingPage.jsx';
import { Spinner } from './components/ui.jsx';

const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <BrandProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<BookingPage />} />
              <Route
                path="/admin/*"
                element={
                  <Suspense fallback={<div className="page-loader"><Spinner /></div>}>
                    <AdminApp />
                  </Suspense>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </BrandProvider>
    </MotionConfig>
  </StrictMode>,
);
