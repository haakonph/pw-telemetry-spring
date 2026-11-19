import { execFile } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export function findBackendDiagnostics(output, traceId) {
  const errors = [];
  const exceptions = [];

  for (const resource of output.split(/^\S+\tinfo\tResource(?:Log|Spans) #\d+$/m)) {
    if (!/^\s*-> service\.name: Str\(spring-api\)\s*$/m.test(resource)) continue;

    for (const record of resource.split(/^\s*LogRecord #\d+/m).slice(1)) {
      if (record.match(/^Trace ID:\s+([a-f\d]{32})\s*$/m)?.[1] !== traceId) continue;
      const time = record.match(/^Timestamp: (.+)$/m)?.[1];
      const log = record.match(/^SeverityNumber: .*\((\d+)\)$/m)?.[1];
      const body = record.match(/^Body: Str\((.*)\)$/m)?.[1];
      if (Number(log) >= 17 && body) errors.push({ time, text: body });
      const exception = exceptionText(record);
      if (exception) exceptions.push({ time, text: exception });
    }

    for (const span of resource.split(/^\s*Span #\d+/m).slice(1)) {
      if (span.match(/^\s*Trace ID\s+: ([a-f\d]{32})\s*$/m)?.[1] !== traceId) continue;
      for (const event of span.split(/^\s*SpanEvent #\d+/m).slice(1)) {
        if (!/^[ \t]*-> Name: exception$/m.test(event)) continue;
        const time = event.match(/^[ \t]*-> Timestamp: (.+)$/m)?.[1];
        const exception = exceptionText(event);
        if (exception) exceptions.push({ time, text: exception });
      }
    }
  }

  return { error: latest(errors), exception: latest(exceptions) };
}

function exceptionText(record) {
  const type = record.match(/^[ \t]*-> exception\.type: Str\((.*)\)$/m)?.[1];
  const message = record.match(/^[ \t]*-> exception\.message: Str\((.*)\)$/m)?.[1];
  const stack = record.match(/^[ \t]*-> exception\.stacktrace: Str\(([\s\S]*?)\n\)$/m)?.[1];
  return [type, message, stack].filter(Boolean).join('\n');
}

function latest(records) {
  return records.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')).at(-1)?.text;
}

export async function attachBackendDiagnostics(testInfo, traceId) {
  let report;
  try {
    // Give the Java agent time to export its 200 ms batches after an early failure.
    await setTimeout(600);
    const { stdout, stderr } = await exec('docker', [
      'compose', 'logs', '--no-color', '--no-log-prefix', '--since', '5m', 'collector',
    ], { timeout: 5000, maxBuffer: 16 * 1024 * 1024 });
    const { error, exception } = findBackendDiagnostics(`${stdout}\n${stderr}`, traceId);
    report = [
      `Siste feillogg: ${error ?? 'Ingen matchende backend-feillogg funnet.'}`,
      `Siste unntak: ${exception ?? 'Ingen matchende backend-unntak funnet.'}`,
    ].join('\n\n');
  } catch (error) {
    report = `Kunne ikke hente backend-diagnostikk fra Collectoren: ${error.message}`;
  }

  const body = `Spring Boot · trace ID ${traceId}\n\n${report}`;
  console.error(body);
  await testInfo.attach('spring-backend-diagnostics', { body, contentType: 'text/plain' });
}
