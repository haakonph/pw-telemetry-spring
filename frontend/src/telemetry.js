import { ROOT_CONTEXT, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { SimpleSpanProcessor, WebTracerProvider } from '@opentelemetry/sdk-trace-web';

const resource = resourceFromAttributes({ 'service.name': 'vite-react' });
const traces = new WebTracerProvider({
  resource,
  spanProcessors: [new SimpleSpanProcessor(new OTLPTraceExporter({
    url: '/otlp/v1/traces',
  }))],
});
const logs = new LoggerProvider({
  resource,
  processors: [new SimpleLogRecordProcessor(new OTLPLogExporter({
    url: '/otlp/v1/logs',
  }))],
});
const tracer = traces.getTracer('demo');
const logger = logs.getLogger('demo');
const propagator = new W3CTraceContextPropagator();

const fragment = new URLSearchParams(location.hash.slice(1));
const traceparent = fragment.get('traceparent');
const parent = traceparent
  ? propagator.extract(ROOT_CONTEXT, { traceparent }, {
      keys: Object.keys,
      get: (carrier, key) => carrier[key],
    })
  : ROOT_CONTEXT;
if (traceparent) history.replaceState(history.state, '', location.pathname + location.search);

export async function loadGreeting() {
  const span = tracer.startSpan('GET /api/greeting', { kind: SpanKind.CLIENT }, parent);
  const requestContext = trace.setSpan(parent, span);
  const headers = new Headers();
  propagator.inject(requestContext, headers, {
    set: (carrier, key, value) => carrier.set(key, value),
  });

  try {
    const response = await fetch('/api/greeting', { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    logger.emit({
      context: requestContext,
      severityNumber: 9,
      severityText: 'INFO',
      body: 'React mottok hilsenen',
    });
    return { ...data, browserTraceId: span.spanContext().traceId };
  } catch (error) {
    logger.emit({
      context: requestContext,
      severityNumber: 17,
      severityText: 'ERROR',
      body: error.message,
    });
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    throw error;
  } finally {
    span.end();
    // Keep the page open until both exports finish before Playwright tears it down.
    await Promise.allSettled([traces.forceFlush(), logs.forceFlush()]);
  }
}
