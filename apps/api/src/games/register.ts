import { checkersManifest } from "@game-platform/game-checkers";
import { chessManifest } from "@game-platform/game-chess";
import type { GameRegistry } from "@game-platform/game-core";
import { rpsEngine } from "@game-platform/game-rps";
import { ticTacToeManifest } from "@game-platform/game-tic-tac-toe";

export function registerGames(registry: GameRegistry) {
  registry.registerEngine(rpsEngine);
  registry.register(ticTacToeManifest);
  registry.register(chessManifest);
  registry.register(checkersManifest);
}
