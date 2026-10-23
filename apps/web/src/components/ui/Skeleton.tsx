import React from 'react';

export interface SkeletonProps {
  variant?: 'line' | 'block';
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'line',
  width = '100%',
  height,
  borderRadius,
  className = '',
}) => {
  const defaultHeight = variant === 'line' ? '14px' : '40px';
  const defaultRadius = variant === 'line' ? 'var(--radius-sm)' : 'var(--radius-md)';

  return (
    <div
      className={`skeleton-shimmer ${className}`}
      aria-hidden="true"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height || defaultHeight,
        borderRadius: borderRadius || defaultRadius,
        display: 'inline-block',
      }}
    />
  );
};
