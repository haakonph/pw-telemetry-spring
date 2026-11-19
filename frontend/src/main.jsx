import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { loadGreeting } from './telemetry.js';
import './style.css';

function App() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function requestGreeting() {
    setLoading(true);
    setResult(null);
    setError('');
    try {
      setResult(await loadGreeting());
    } catch (error) {
      setError(`Kunne ikke hente hilsenen (${error.message}).`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Sporingsdemo</h1>
      <p>Send en forespørsel fra React til Spring Boot og se sporings-ID-en fra begge.</p>
      <button onClick={requestGreeting} disabled={loading}>
        {loading ? 'Henter …' : 'Hent hilsen'}
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <section aria-label="Svar fra API-et">
          <h2>{result.message}</h2>
          <dl>
            <dt>React trace ID</dt>
            <dd><code data-testid="browser-trace-id">{result.browserTraceId}</code></dd>
            <dt>Spring Boot trace ID</dt>
            <dd><code data-testid="server-trace-id">{result.traceId}</code></dd>
          </dl>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
