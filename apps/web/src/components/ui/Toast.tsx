import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastMessage {
  id: string;
  text: string;
  tone?: ToastTone;
}

export interface ToastContextType {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentToast, setCurrentToast] = useState<ToastMessage | null>(null);
  const timerRef = useRef<number | null>(null);

  const toast = useCallback((text: string, tone: ToastTone = 'info') => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    const id = Math.random().toString(36).substring(2);
    setCurrentToast({ id, text, tone });

    // 2.6s auto dismiss per 09-DESIGN.md
    timerRef.current = window.setTimeout(() => {
      setCurrentToast((prev) => (prev?.id === id ? null : prev));
    }, 2600);
  }, []);

  const getToneStyle = (tone: ToastTone = 'info') => {
    switch (tone) {
      case 'error':
        return {
          backgroundColor: 'var(--red)',
          color: '#FFFFFF',
        };
      case 'success':
        return {
          backgroundColor: 'var(--teal)',
          color: '#FFFFFF',
        };
      case 'info':
      default:
        return {
          backgroundColor: 'var(--navy)',
          color: '#FFFFFF',
        };
    }
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {currentToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 10000,
            maxWidth: '380px',
            padding: '12px 18px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13.5px',
            fontWeight: 500,
            lineHeight: 1.4,
            boxShadow: 'var(--shadow-toast)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            animation: 'fadeInUp 0.2s ease-out',
            ...getToneStyle(currentToast.tone),
          }}
        >
          <span>{currentToast.text}</span>
          <button
            type="button"
            aria-label="Close notification"
            onClick={() => setCurrentToast(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              marginLeft: 'auto',
              padding: '0 0 0 8px',
              fontSize: '16px',
              lineHeight: 1,
              opacity: 0.8,
            }}
          >
            ✕
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
