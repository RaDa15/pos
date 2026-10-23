import React from 'react';
import { OfflineBar } from '../ui/OfflineBar.js';
import { LanguageToggle } from '../ui/LanguageToggle.js';

export interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  logoText?: string;
  logoUrl?: string | null;
  progressStep?: number; // e.g. 1, 2, 3
  totalSteps?: number;
  maxWidth?: number | string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  showLanguageToggle?: boolean;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  title,
  subtitle,
  logoText = 'POS',
  logoUrl,
  progressStep,
  totalSteps = 3,
  maxWidth = 460,
  children,
  footer,
  showLanguageToggle = true,
}) => {
  const progressPercent = progressStep ? (progressStep / totalSteps) * 100 : 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: 'var(--auth-gradient)',
        overflow: 'hidden',
      }}
    >
      <OfflineBar />

      {/* Decorative blurred glow circles from prototype */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: '280px',
          height: '280px',
          borderRadius: '50%',
          background: 'rgba(31,138,112,0.18)',
          top: '-100px',
          right: '-80px',
          filter: 'blur(2px)',
          opacity: 0.45,
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: '220px',
          height: '220px',
          borderRadius: '50%',
          background: 'rgba(217,142,34,0.12)',
          bottom: '-90px',
          left: '-70px',
          filter: 'blur(2px)',
          opacity: 0.45,
          pointerEvents: 'none',
        }}
      />

      {/* Top right language toggle */}
      {showLanguageToggle && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            right: '24px',
            zIndex: 10,
          }}
        >
          <LanguageToggle variant="light" />
        </div>
      )}

      {/* Main card container */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 16px',
        }}
      >
        <div
          className="auth-card"
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth,
            backgroundColor: 'var(--panel)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid rgba(255, 255, 255, 0.55)',
            boxShadow: 'var(--shadow-auth)',
            padding: '32px 28px',
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                backgroundColor: 'var(--navy)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '18px',
                boxShadow: 'var(--shadow-logo)',
                overflow: 'hidden',
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={logoText}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span>{logoText}</span>
              )}
            </div>
          </div>

          {/* Heading */}
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h1
              style={{
                margin: 0,
                fontSize: '22px',
                lineHeight: '28px',
                fontWeight: 800,
                color: 'var(--ink)',
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                style={{
                  margin: '6px 0 0 0',
                  fontSize: '13px',
                  color: 'var(--muted)',
                }}
              >
                {subtitle}
              </p>
            )}
          </div>

          {/* Progress bar if multi-step */}
          {progressStep !== undefined && (
            <div
              role="progressbar"
              aria-valuenow={progressStep}
              aria-valuemin={1}
              aria-valuemax={totalSteps}
              aria-label={`Step ${progressStep} of ${totalSteps}`}
              style={{
                height: '4px',
                backgroundColor: '#ECEFF3',
                borderRadius: '99px',
                overflow: 'hidden',
                margin: '12px 0 20px',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  backgroundColor: 'var(--teal)',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          )}

          {/* Form / Content */}
          {children}

          {/* Card footer */}
          {footer && (
            <div
              style={{
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '1px solid var(--line-soft)',
                textAlign: 'center',
                fontSize: '12.5px',
                color: 'var(--muted)',
              }}
            >
              {footer}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
