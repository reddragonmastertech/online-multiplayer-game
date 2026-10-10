import type { GameManifest } from "@game-platform/game-core";

export const ticTacToeManifest = {
  id: "tic-tac-toe",
  name: "Tic-Tac-Toe",
  version: "0.0.0",
  minPlayers: 2,
  maxPlayers: 2,
  description: "Two players, three in a row.",
} satisfies GameManifest;
