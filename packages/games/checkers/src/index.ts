import type { GameManifest } from "@game-platform/game-core";

export const checkersManifest = {
  id: "checkers",
  name: "Checkers",
  version: "0.0.0",
  minPlayers: 2,
  maxPlayers: 2,
  description: "Two-player draughts.",
} satisfies GameManifest;
