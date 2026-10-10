import { describe, expect, it } from "vitest";
import { createGameRegistry, type GameManifest } from "./registry";

const rps: GameManifest = {
  id: "rps",
  name: "Rock Paper Scissors",
  version: "0.0.0",
  minPlayers: 2,
  maxPlayers: 2,
  description: "Two-player hand game.",
};

describe("createGameRegistry", () => {
  it("stores a game manifest by id", () => {
    const registry = createGameRegistry();

    registry.register(rps);

    expect(registry.get("rps")).toEqual(rps);
    expect(registry.list()).toEqual([rps]);
  });

  it("rejects a duplicate game id", () => {
    const registry = createGameRegistry();

    registry.register(rps);

    expect(() => registry.register(rps)).toThrow(/already registered/);
  });
});
