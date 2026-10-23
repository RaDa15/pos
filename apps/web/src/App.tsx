import { useQuery } from '@tanstack/react-query';
import { APP_NAME } from '@pos/shared';

interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
}

export function App() {
  const { data, isLoading, error } = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/v1/health');
      if (!res.ok) {
        throw new Error('Health check failed');
      }
      return res.json();
    },
    retry: 1,
  });

  return (
    <div style={{ padding: '2rem', fontFamily: 'Manrope, sans-serif' }}>
      <h1>{APP_NAME}</h1>
      <p>Multi-tenant POS and GST SaaS for Bhutanese businesses.</p>
      <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f5f5f5', borderRadius: '8px', maxWidth: '400px' }}>
        <h3>API Health Status</h3>
        {isLoading && <p>Checking backend health...</p>}
        {error && <p style={{ color: '#d32f2f' }}>API not connected (start backend to connect)</p>}
        {data && (
          <div>
            <p><strong>Status:</strong> {data.status}</p>
            <p><strong>Version:</strong> {data.version}</p>
            <p><strong>Time:</strong> {data.timestamp}</p>
          </div>
        )}
      </div>
    </div>
  );
}
