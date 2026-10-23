import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'outline' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loading?: boolean;
}

export function Button({
  children,
  variant = 'default',
  size = 'md',
  isLoading = false,
  loading = false,
  disabled,
  style,
  className = '',
  ...props
}: ButtonProps) {
  const isButtonLoading = isLoading || loading;
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: 'var(--teal)',
          color: '#FFFFFF',
          borderColor: 'transparent',
        };
      case 'outline':
        return {
          backgroundColor: 'var(--panel)',
          color: 'var(--ink)',
          borderColor: 'var(--line)',
        };
      case 'danger':
        return {
          backgroundColor: 'var(--panel)',
          color: 'var(--red)',
          borderColor: 'var(--red-border)',
        };
      case 'link':
        return {
          backgroundColor: 'transparent',
          color: 'var(--teal-dark)',
          borderColor: 'transparent',
          padding: 0,
          minHeight: 'auto',
          fontWeight: 700,
        };
      case 'default':
      default:
        return {
          backgroundColor: 'var(--navy)',
          color: '#FFFFFF',
          borderColor: 'transparent',
        };
    }
  };

  const getSizeStyles = (): React.CSSProperties => {
    if (variant === 'link') return {};
    switch (size) {
      case 'sm':
        return {
          padding: '5px 10px',
          fontSize: '12px',
          minHeight: '28px',
        };
      case 'lg':
        return {
          padding: '10px 20px',
          fontSize: '14px',
          minHeight: '44px',
        };
      case 'md':
      default:
        return {
          padding: '8px 16px',
          fontSize: '13.5px',
          minHeight: '36px',
        };
    }
  };

  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    borderRadius: 'var(--radius-sm)',
    borderWidth: '1px',
    borderStyle: 'solid',
    fontWeight: 700,
    cursor: disabled || isButtonLoading ? 'not-allowed' : 'pointer',
    opacity: disabled || isButtonLoading ? 0.45 : 1,
    transition: 'background-color 0.15s ease, opacity 0.15s ease',
    ...getVariantStyles(),
    ...getSizeStyles(),
    ...style,
  };

  return (
    <button
      disabled={disabled || isButtonLoading}
      style={baseStyles}
      className={`btn btn-${variant} btn-${size} ${className}`}
      {...props}
    >
      {isButtonLoading && (
        <span
          style={{
            display: 'inline-block',
            width: '12px',
            height: '12px',
            border: '2px solid currentColor',
            borderRightColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      )}
      {children}
    </button>
  );
}
