# Playwright, React og Spring Boot med OpenTelemetry

Demoen viser hvordan logger fra en nettlesertest, React og Spring Boot kan finnes med samme sporings-ID. Hvert ledd har sitt eget span.

```text
Playwright-test (playwright)
  └── GET /api/greeting i nettleseren (vite-react)
        └── HTTP-forespørsel i Spring Boot (spring-api)
```

Playwright legger W3C `traceparent` i URL-fragmentet ved navigering. React leser og fjerner fragmentet, oppretter et klientspan og sender en ny `traceparent`-header til API-et. OpenTelemetry Java-agenten leser headeren og korrelerer Logback-loggen med serverens span. Alle tre tjenester eksporterer spor og logger med OTLP/HTTP til OpenTelemetry Collector.

## Kjør testen

Du trenger Java 21, Node.js 22.12+ og Docker med Compose. Gradle Wrapper følger med.

```bash
npm ci
npx playwright install chromium
docker compose up -d
npm test
```

Playwright starter Spring Boot på port 8080 og Vite på port 5173. Hvis Chromium allerede er installert, kan du angi stien med `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

Testen sammenligner sporings-ID-en fra React og Spring Boot med ID-en Playwright opprettet. Kopier verdien fra `TRACE_ID=…` i testutskriften. Bruk den til å finne loggposter og span i Collectoren etter at Java-agenten har eksportert sin batch (normalt innen noen sekunder).

```bash
TRACE_ID='<ID fra testutskriften>'
docker compose logs --no-color collector | grep -i -B 6 -A 5 "$TRACE_ID"
```

Se etter disse loggmeldingene med samme `Trace ID`.

| Tjeneste | Loggmelding |
| --- | --- |
| `playwright` | Playwright bekreftet felles trace ID |
| `vite-react` | React mottok hilsenen |
| `spring-api` | Spring Boot svarte på demoforespørselen |

## Prøv i nettleseren

La Collectoren kjøre. Start `./gradlew :backend:bootRun` og `npm run dev` i hver sin terminal. Åpne http://127.0.0.1:5173 og velg **Hent hilsen**. Siden viser sporings-ID-en fra React og Spring Boot. Ved manuell bruk starter React sporet.

Stopp Collectoren med `docker compose down` når du er ferdig. Collectoren skriver telemetrien til containerloggen med debug-eksportøren.

## Backend-diagnostikk ved testfeil

Når Playwright-testen feiler eller går ut på tid, henter den siste feillogg og siste registrerte unntak fra `spring-api` med testens sporings-ID. Diagnostikken vises i terminalen og vedlegges testresultatet som `spring-backend-diagnostics`. Den opprinnelige testfeilen og Playwright-tracen vises fortsatt. Collectoren må kjøre for at testen skal kunne hente backend-diagnostikken.

Kjør demoen med tvungen backend-feil for å se hvordan dette ser ut. Denne kjøringen skal feile.

```bash
DEMO_BACKEND_FAILURE=1 npm test
```
