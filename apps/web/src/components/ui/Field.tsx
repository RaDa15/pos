import React from 'react';

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  id?: string;
}

export function Field({ label, hint, error, required, children, id }: FieldProps) {
  return (
    <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column' }}>
      {label && (
        <label
          htmlFor={id}
          style={{
            display: 'block',
            fontSize: '12.5px',
            fontWeight: 600,
            color: '#3B3F4A',
            marginBottom: '4px',
          }}
        >
          {label} {required && <span style={{ color: 'var(--red)' }}>*</span>}
        </label>
      )}
      {children}
      {hint && !error && (
        <small style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '4px' }}>
          {hint}
        </small>
      )}
      {error && (
        <small
          style={{
            fontSize: '12px',
            color: 'var(--red)',
            marginTop: '4px',
            fontWeight: 500,
          }}
          role="alert"
        >
          {error}
        </small>
      )}
    </div>
  );
}
