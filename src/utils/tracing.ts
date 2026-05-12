import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import type { SpanExporter } from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes, defaultResource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

/**
 * Resolve the active span exporter from env vars:
 *   OTEL_EXPORTER=none    → no exporter (default in dev)
 *   OTEL_EXPORTER=console → ConsoleSpanExporter (only when DEBUG_TELEMETRY=true)
 *   OTEL_EXPORTER=otlp    → OTLPTraceExporter sending to OTEL_EXPORTER_OTLP_ENDPOINT
 *
 * In production NODE_ENV the default switches to "otlp" unless overridden.
 */
function resolveExporter(): SpanExporter | null {
  const isProduction = process.env.NODE_ENV === "production";
  const raw = process.env.OTEL_EXPORTER;

  // Determine effective exporter name
  let exporterName: string;
  if (raw) {
    exporterName = raw.toLowerCase();
  } else if (isProduction) {
    exporterName = "otlp";
  } else {
    exporterName = "none";
  }

  switch (exporterName) {
    case "console":
      // Guarded: only enable if DEBUG_TELEMETRY is set to avoid span spam in dev
      if (process.env.DEBUG_TELEMETRY !== "true") {
        return null;
      }
      return new ConsoleSpanExporter();

    case "otlp": {
      const endpoint =
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
      return new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });
    }

    case "none":
    default:
      return null;
  }
}

/** Whether OTel instrumentation should be enabled at all. */
export function isOtelEnabled(): boolean {
  const raw = process.env.OTEL_ENABLED;
  if (raw !== undefined) return raw === "true";
  // Default: enabled in production, disabled elsewhere
  return process.env.NODE_ENV === "production";
}

let sdk: NodeSDK | null = null;

/**
 * Initialise the OpenTelemetry NodeSDK.
 * Must be called BEFORE any other imports in your entrypoint.
 */
export function initTracing(): void {
  if (!isOtelEnabled()) return;

  const exporter = resolveExporter();

  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.NODE_SERVICE_NAME ?? "api",
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "0.0.0",
    })
  );

  sdk = new NodeSDK({
    resource,
    // Use BatchSpanProcessor for OTLP (production), SimpleSpanProcessor for console (debug)
    spanProcessors: exporter
      ? [
          exporter instanceof ConsoleSpanExporter
            ? new SimpleSpanProcessor(exporter)
            : new BatchSpanProcessor(exporter),
        ]
      : [],
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy fs instrumentation
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();
}

/** Gracefully shut down the SDK (flush spans before exit). */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}
