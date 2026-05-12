import { describe, it, expect, afterEach, vi } from "vitest";
import { logger, auditLogger, redactSensitiveFields, serializeError, isLokiEnabled } from "../../../src/utils/winston";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("src/utils/winston", () => {
  it("exports logger", () => {
    expect(logger).toBeDefined();
  });

  it("exports auditLogger", () => {
    expect(auditLogger).toBeDefined();
  });

  describe("redactSensitiveFields", () => {
    it("redacts known sensitive keys", () => {
      const result = redactSensitiveFields({
        username: "alice",
        password: "s3cret",
        token: "abc123",
        age: 30,
      });
      expect(result.username).toBe("alice");
      expect(result.password).toBe("[REDACTED]");
      expect(result.token).toBe("[REDACTED]");
      expect(result.age).toBe(30);
    });

    it("is case-insensitive for key matching", () => {
      const result = redactSensitiveFields({ Password: "hunter2" });
      expect(result.Password).toBe("[REDACTED]");
    });
  });

  describe("serializeError", () => {
    it("serialises Error instances", () => {
      const err = new Error("boom");
      const result = serializeError(err);
      expect(result.message).toBe("boom");
      expect(result.name).toBe("Error");
      expect(typeof result.stack).toBe("string");
    });

    it("serialises non-Error values as string", () => {
      expect(serializeError("plain string")).toEqual({ message: "plain string" });
      expect(serializeError(42)).toEqual({ message: "42" });
    });
  });

  describe("isLokiEnabled", () => {
    it("returns false when NODE_LOKI_HOST is unset", () => {
      delete process.env.NODE_LOKI_HOST;
      expect(isLokiEnabled()).toBe(false);
    });

    it("returns true when NODE_LOKI_HOST is set", () => {
      vi.stubEnv("NODE_LOKI_HOST", "http://loki:3100");
      expect(isLokiEnabled()).toBe(true);
    });
  });
});
