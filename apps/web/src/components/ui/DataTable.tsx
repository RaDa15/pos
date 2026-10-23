import React from 'react';
import { Skeleton } from './Skeleton.js';
import { EmptyState } from './EmptyState.js';

export interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  width?: string | number;
  className?: string;
  render?: (row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  compact?: boolean;
  keyExtractor?: (row: T, index: number) => string | number;
  className?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyMessage = 'No records found',
  compact = false,
  keyExtractor,
  className = '',
}: DataTableProps<T>) {
  const rowPadding = compact ? '6px 8px' : '10px 14px';

  return (
    <div className={`table-wrap ${className}`}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: col.align || 'left',
                  width: col.width,
                  padding: rowPadding,
                  fontSize: compact ? '10px' : '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--muted)',
                  borderBottom: '1px solid var(--line)',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 4 }).map((_, rIdx) => (
              <tr key={`skel-row-${rIdx}`}>
                {columns.map((col, cIdx) => (
                  <td
                    key={`skel-col-${cIdx}`}
                    style={{
                      padding: rowPadding,
                      textAlign: col.align || 'left',
                      borderBottom: '1px solid var(--line-soft)',
                    }}
                  >
                    <Skeleton variant="line" width="70%" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: 0,
                  borderBottom: 'none',
                }}
              >
                <EmptyState message={emptyMessage} />
              </td>
            </tr>
          ) : (
            data.map((row, rIdx) => {
              const rowKey = keyExtractor
                ? keyExtractor(row, rIdx)
                : (row['id'] as string | number) ?? rIdx;

              return (
                <tr
                  key={rowKey}
                  style={{
                    backgroundColor: 'transparent',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--paper)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        padding: rowPadding,
                        textAlign: col.align || 'left',
                        fontSize: compact ? '12px' : '13.5px',
                        borderBottom: '1px solid var(--line-soft)',
                        verticalAlign: 'middle',
                      }}
                    >
                      {col.render
                        ? col.render(row, rIdx)
                        : (row[col.key] as React.ReactNode) ?? '—'}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
