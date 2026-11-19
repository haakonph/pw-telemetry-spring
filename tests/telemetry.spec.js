import { expect, test } from '@playwright/test';
import { attachBackendDiagnostics } from './backend-diagnostics.js';
import { ROOT_CONTEXT, SpanStatusCode, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';

test.afterEach(async ({}, testInfo) => {
  const traceId = testInfo.annotations.find(({ type }) => type === 'trace-id')?.description;
  if (traceId && testInfo.status === 'timedOut' &&
      !testInfo.attachments.some(({ name }) => name === 'spring-backend-diagnostics')) {
    await attachBackendDiagnostics(testInfo, traceId);
  }
});

test('Playwright, React og Spring Boot deler trace ID', async ({ page }, testInfo) => {
  const endpoint = new URL('http://127.0.0.1:4318');
  const resource = resourceFromAttributes({ 'service.name': 'playwright' });
  const traces = new NodeTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(new OTLPTraceExporter({
      url: new URL('v1/traces', endpoint).href,
    }))],
  });
  const logs = new LoggerProvider({
    resource,
    processors: [new SimpleLogRecordProcessor(new OTLPLogExporter({
      url: new URL('v1/logs', endpoint).href,
    }))],
  });
  const span = traces.getTracer('demo').startSpan(testInfo.title);
  const context = trace.setSpan(ROOT_CONTEXT, span);
  const { traceId } = span.spanContext();
  testInfo.annotations.push({ type: 'trace-id', description: traceId });
  const carrier = {};
  new W3CTraceContextPropagator().inject(context, carrier, {
    set: (target, key, value) => { target[key] = value; },
  });

  try {
    if (process.env.DEMO_BACKEND_FAILURE === '1') {
      await page.route('**/api/greeting', (route) => {
        const url = new URL(route.request().url());
        url.searchParams.set('fail', 'true');
        return route.continue({ url: url.href });
      });
    }
    await page.goto(`/#${new URLSearchParams(carrier)}`);
    const [apiResponse, browserLog, browserSpan] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/greeting'),
      page.waitForResponse('**/otlp/v1/logs'),
      page.waitForResponse('**/otlp/v1/traces'),
      page.getByRole('button', { name: 'Hent hilsen' }).click(),
    ]);
    expect(apiResponse.ok(), `Spring Boot GET /api/greeting svarte HTTP ${apiResponse.status()}`).toBe(true);
    for (const response of [browserLog, browserSpan]) {
      expect(response.ok(), response.url()).toBe(true);
    }
    await expect(page.getByRole('heading', { name: 'Hei fra Spring Boot!' })).toBeVisible();
    await expect(page.getByTestId('browser-trace-id')).toHaveText(traceId);
    await expect(page.getByTestId('server-trace-id')).toHaveText(traceId);
    logs.getLogger('demo').emit({
      context,
      severityNumber: 9,
      severityText: 'INFO',
      body: 'Playwright bekreftet felles trace ID',
    });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    logs.getLogger('demo').emit({
      context,
      severityNumber: 17,
      severityText: 'ERROR',
      body: 'Playwright-testen feilet',
    });
    const diagnostics = await attachBackendDiagnostics(testInfo, traceId);
    throw new Error(`${error.message}\n\n${diagnostics}`, { cause: error });
  } finally {
    console.log(`TRACE_ID=${traceId}`);
    span.end();
    await Promise.all([traces.shutdown(), logs.shutdown()]);
  }
});
