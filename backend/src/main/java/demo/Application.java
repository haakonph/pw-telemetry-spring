package demo;

import io.opentelemetry.api.trace.Span;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
@RestController
public class Application {
    private static final Logger log = LoggerFactory.getLogger(Application.class);

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }

    @GetMapping("/api/greeting")
    public Map<String, String> greeting(@RequestParam(defaultValue = "false") boolean fail) {
        if (fail) {
            throw new IllegalStateException("Fremprovosert backend-feil i sporingsdemoen");
        }
        log.info("Spring Boot svarte på demoforespørselen");
        return Map.of(
            "message", "Hei fra Spring Boot!",
            "traceId", Span.current().getSpanContext().getTraceId()
        );
    }
}
