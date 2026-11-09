import { isAbsolute } from "node:path";
import { describe, expect, it } from "vitest";
import { isServerPath, resolveWebDist } from "./web";

describe("single-page fallback", () => {
  it("leaves server paths alone", () => {
    for (const url of [
      "/api",
      "/api/me",
      "/api/auth/login",
      "/api/live?x=1",
      "/socket.io/?EIO=4&transport=polling",
      "/health",
    ]) {
      expect(isServerPath(url), url).toBe(true);
    }
  });

  it("claims client routes so a deep link opens the app", () => {
    for (const url of [
      "/",
      "/lobby",
      "/games/rps",
      "/room/9f0c",
      "/matches/9f0c",
      "/account",
      "/watch",
      "/legal/terms",
    ]) {
      expect(isServerPath(url), url).toBe(false);
    }
  });

  it("does not treat a lookalike route as a server path", () => {
    // These are client routes that merely start with the same letters.
    expect(isServerPath("/apiary")).toBe(false);
    expect(isServerPath("/healthcheck-page")).toBe(false);
  });
});

describe("web bundle location", () => {
  it("defaults to the built web app regardless of the working directory", () => {
    const root = resolveWebDist();
    expect(isAbsolute(root)).toBe(true);
    expect(root.replace(/\\/g, "/")).toMatch(/apps\/web\/dist$/);
  });

  it("honours an absolute override", () => {
    const override = process.platform === "win32" ? "C:\\srv\\site" : "/srv/site";
    expect(resolveWebDist(override)).toBe(override);
  });

  it("resolves a relative override against the working directory", () => {
    expect(isAbsolute(resolveWebDist("build/site"))).toBe(true);
  });
});
