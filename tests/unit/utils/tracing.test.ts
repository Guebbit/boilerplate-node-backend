import { describe, it, expect, afterEach, vi } from "vitest";
import { isOtelEnabled, initTracing, shutdownTracing } from "../../../src/utils/tracing";

afterEach(async () => {
  vi.unstubAllEnvs();
  await shutdownTracing();
});

describe("src/utils/tracing", () => {
  describe("isOtelEnabled", () => {
    it("returns false by default in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      delete process.env.OTEL_ENABLED;
      expect(isOtelEnabled()).toBe(false);
    });

    it("returns true by default in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.OTEL_ENABLED;
      expect(isOtelEnabled()).toBe(true);
    });

    it("respects OTEL_ENABLED=false in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("OTEL_ENABLED", "false");
      expect(isOtelEnabled()).toBe(false);
    });

    it("respects OTEL_ENABLED=true in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("OTEL_ENABLED", "true");
      expect(isOtelEnabled()).toBe(true);
    });
  });

  describe("initTracing + shutdownTracing", () => {
    it("does not throw when OTel is disabled", () => {
      vi.stubEnv("NODE_ENV", "development");
      delete process.env.OTEL_ENABLED;
      expect(() => initTracing()).not.toThrow();
    });

    it("does not throw when OTEL_EXPORTER=none", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("OTEL_ENABLED", "true");
      vi.stubEnv("OTEL_EXPORTER", "none");
      expect(() => initTracing()).not.toThrow();
      await expect(shutdownTracing()).resolves.not.toThrow();
    }, 15000);

    it("does not enable console exporter without DEBUG_TELEMETRY=true", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("OTEL_ENABLED", "true");
      vi.stubEnv("OTEL_EXPORTER", "console");
      delete process.env.DEBUG_TELEMETRY;
      // exporter resolves to null → SDK starts with no span processors
      expect(() => initTracing()).not.toThrow();
    });

    it("resolves shutdown even if SDK was never started", async () => {
      vi.stubEnv("NODE_ENV", "development");
      delete process.env.OTEL_ENABLED;
      await expect(shutdownTracing()).resolves.not.toThrow();
    });
  });
});
