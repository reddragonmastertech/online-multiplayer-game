import type { GameManifest } from "@game-platform/game-core";

export const rpsManifest = {
  id: "rps",
  name: "Rock Paper Scissors",
  version: "0.0.0",
  minPlayers: 2,
  maxPlayers: 2,
  description: "Two players, one move per round.",
} satisfies GameManifest;
