import type { GameManifest } from "@game-platform/game-core";

export const chessManifest = {
  id: "chess",
  name: "Chess",
  version: "0.0.0",
  minPlayers: 2,
  maxPlayers: 2,
  description: "Two-player board game.",
} satisfies GameManifest;
