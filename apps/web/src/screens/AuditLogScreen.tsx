import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { AppShell } from '../components/layout/AppShell.js';
import { Card } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Pill, type PillVariant } from '../components/ui/Pill.js';
import { Input } from '../components/ui/Input.js';
import { Field } from '../components/ui/Field.js';
import { EmptyState } from '../components/ui/EmptyState.js';

interface AuditLogEntry {
  id: string;
  actorName: string;
  actorEmployeeId: string | null;
  actorPlatformAdminId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: unknown;
  createdAt: string;
}

interface AuditLogResponse {
  data: AuditLogEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function AuditLogScreen() {
  const [actionFilter, setActionFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (actionFilter.trim()) queryParams.set('action', actionFilter.trim());
  if (fromFilter) queryParams.set('from', fromFilter);
  if (toFilter) queryParams.set('to', toFilter);

  const { data, isLoading } = useQuery<AuditLogResponse>({
    queryKey: ['audit-logs', page, actionFilter, fromFilter, toFilter],
    queryFn: async () => api.get<AuditLogResponse>(`/api/v1/audit-logs?${queryParams.toString()}`),
  });

  const logs = data?.data || [];
  const pagination = data?.pagination;

  const handleResetFilters = () => {
    setActionFilter('');
    setFromFilter('');
    setToFilter('');
    setPage(1);
  };

  const formatBttDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-GB', {
        timeZone: 'Asia/Thimphu',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }) + ' BTT';
    } catch {
      return iso;
    }
  };

  const getActionBadgeVariant = (action: string): PillVariant => {
    const act = action.toLowerCase();
    if (act.includes('delete') || act.includes('void') || act.includes('cancel') || act.includes('reject')) {
      return 'danger';
    }
    if (act.includes('create') || act.includes('sale') || act.includes('verify') || act.includes('login')) {
      return 'success';
    }
    if (act.includes('update') || act.includes('adjust') || act.includes('change')) {
      return 'warning';
    }
    return 'neutral';
  };

  const renderDetail = (detail: unknown) => {
    if (!detail) return <span style={{ color: 'var(--muted)' }}>—</span>;
    if (typeof detail === 'string') return <span>{detail}</span>;
    if (typeof detail === 'object') {
      try {
        const entries = Object.entries(detail as Record<string, unknown>);
        if (entries.length === 0) return <span style={{ color: 'var(--muted)' }}>—</span>;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {entries.slice(0, 4).map(([k, v]) => (
              <span
                key={k}
                style={{
                  fontSize: '11.5px',
                  backgroundColor: 'var(--paper)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid var(--line)',
                }}
              >
                <strong>{k}:</strong> {String(v)}
              </span>
            ))}
          </div>
        );
      } catch {
        return <span>{JSON.stringify(detail)}</span>;
      }
    }
    return <span>{String(detail)}</span>;
  };

  return (
    <AppShell title="Audit Activity Log" subtitle="SCR-22: Immutable audit trail for all business activities">
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Compliance Banner */}
        <div
          style={{
            backgroundColor: '#EFF6FF',
            color: '#1E40AF',
            border: '1px solid #BFDBFE',
            padding: '12px 18px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '16px' }}>🛡️</span>
          <span>
            <strong>Regulatory Compliance:</strong> Audit logs are strictly immutable and cryptographically timestamped in Bhutan Time (BTT). No records can be modified or deleted.
          </span>
        </div>

        {/* Filter Card */}
        <Card>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '14px',
              alignItems: 'flex-end',
            }}
          >
            <Field label="Filter by Action">
              <Input
                placeholder="e.g. sale, auth, inventory..."
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
              />
            </Field>

            <Field label="From Date">
              <Input
                type="date"
                value={fromFilter}
                onChange={(e) => {
                  setFromFilter(e.target.value);
                  setPage(1);
                }}
              />
            </Field>

            <Field label="To Date">
              <Input
                type="date"
                value={toFilter}
                onChange={(e) => {
                  setToFilter(e.target.value);
                  setPage(1);
                }}
              />
            </Field>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="outline" onClick={handleResetFilters} style={{ width: '100%', justifyContent: 'center' }}>
                Reset Filters
              </Button>
            </div>
          </div>
        </Card>

        {/* Logs Table */}
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}
          >
            <div style={{ fontSize: '13.5px', color: 'var(--muted)' }}>
              Showing {logs.length} of {pagination?.total ?? 0} events
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Prev
                </Button>
                <span style={{ fontSize: '12.5px', color: 'var(--ink)' }}>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next →
                </Button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
              Loading audit logs...
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              message="No activity recorded yet."
              description="Actions performed by staff, admins, and system automation will be immutably recorded here."
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontSize: '12px' }}>
                    <th style={{ padding: '10px 12px' }}>When (BTT)</th>
                    <th style={{ padding: '10px 12px' }}>Actor</th>
                    <th style={{ padding: '10px 12px' }}>Action</th>
                    <th style={{ padding: '10px 12px' }}>Entity</th>
                    <th style={{ padding: '10px 12px' }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: '12px' }}>
                        {formatBttDateTime(log.createdAt)}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--ink)' }}>
                        {log.actorName}
                        {log.actorPlatformAdminId && (
                          <span style={{ fontSize: '10.5px', color: 'var(--teal)', display: 'block', fontWeight: 400 }}>
                            Platform Admin
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Pill variant={getActionBadgeVariant(log.action)}>
                          {log.action}
                        </Pill>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--muted)', textTransform: 'capitalize' }}>
                        {log.entityType} {log.entityId ? `#${log.entityId.slice(-6)}` : ''}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {renderDetail(log.detail)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
