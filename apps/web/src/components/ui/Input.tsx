import React, { useState } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  hasError?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ type = 'text', error, hasError, style, className = '', ...props }, ref) => {
    const isError = !!(error || hasError);
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type;

    const inputStyles: React.CSSProperties = {
      width: '100%',
      padding: isPassword ? '8px 65px 8px 10px' : '8px 10px',
      border: `1px solid ${isError ? 'var(--red)' : 'var(--line)'}`,
      borderRadius: 'var(--radius-sm)',
      fontSize: '13.5px',
      backgroundColor: 'var(--panel)',
      color: 'var(--ink)',
      minHeight: '36px',
      ...style,
    };

    if (isPassword) {
      return (
        <div style={{ position: 'relative', width: '100%' }}>
          <input
            ref={ref}
            type={effectiveType}
            style={inputStyles}
            className={`input ${error ? 'input-error' : ''} ${className}`}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              border: 0,
              background: 'transparent',
              color: 'var(--muted)',
              fontSize: '12px',
              fontWeight: 700,
              padding: '4px',
            }}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      );
    }

    return (
      <input
        ref={ref}
        type={effectiveType}
        style={inputStyles}
        className={`input ${error ? 'input-error' : ''} ${className}`}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, style, className = '', children, ...props }, ref) => {
    const selectStyles: React.CSSProperties = {
      width: '100%',
      padding: '8px 10px',
      border: `1px solid ${error ? 'var(--red)' : 'var(--line)'}`,
      borderRadius: 'var(--radius-sm)',
      fontSize: '13.5px',
      backgroundColor: 'var(--panel)',
      color: 'var(--ink)',
      minHeight: '36px',
      ...style,
    };

    return (
      <select
        ref={ref}
        style={selectStyles}
        className={`select ${error ? 'select-error' : ''} ${className}`}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = 'Select';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, style, className = '', ...props }, ref) => {
    const textareaStyles: React.CSSProperties = {
      width: '100%',
      padding: '8px 10px',
      border: `1px solid ${error ? 'var(--red)' : 'var(--line)'}`,
      borderRadius: 'var(--radius-sm)',
      fontSize: '13.5px',
      backgroundColor: 'var(--panel)',
      color: 'var(--ink)',
      minHeight: '72px',
      resize: 'vertical',
      ...style,
    };

    return (
      <textarea
        ref={ref}
        style={textareaStyles}
        className={`textarea ${error ? 'textarea-error' : ''} ${className}`}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';
