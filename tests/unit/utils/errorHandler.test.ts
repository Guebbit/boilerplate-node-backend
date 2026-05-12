import { describe, it, expect } from "vitest";
import { HttpError } from "../../../src/middlewares/errorHandler";

describe("HttpError", () => {
  it("stores statusCode, message, and details", () => {
    const err = new HttpError(404, "Not found", { id: "abc" });
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.details).toEqual({ id: "abc" });
    expect(err.name).toBe("HttpError");
    expect(err instanceof Error).toBe(true);
  });

  it("401 is a 4xx (not a 5xx)", () => {
    const err = new HttpError(401, "Unauthorized");
    expect(err.statusCode).toBeLessThan(500);
  });

  it("403 is a 4xx (not a 5xx)", () => {
    const err = new HttpError(403, "Forbidden");
    expect(err.statusCode).toBeLessThan(500);
  });
});
