import { checkersManifest } from "@game-platform/game-checkers";
import { chessManifest } from "@game-platform/game-chess";
import type { GameRegistry } from "@game-platform/game-core";
import { rpsManifest } from "@game-platform/game-rps";
import { ticTacToeManifest } from "@game-platform/game-tic-tac-toe";

export function registerGames(registry: GameRegistry) {
  registry.register(rpsManifest);
  registry.register(ticTacToeManifest);
  registry.register(chessManifest);
  registry.register(checkersManifest);
}
