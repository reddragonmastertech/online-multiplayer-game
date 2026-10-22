import type { GameManifest } from "./registry";

export type GameStatus =
  | { kind: "playing" }
  | { kind: "draw" }
  | { kind: "winner"; playerId: string };

export class IllegalMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalMoveError";
  }
}

export interface GameEngine<TState = unknown, TMove = unknown> {
  readonly manifest: GameManifest;
  initialState(players: { a: string; b: string }): TState;
  applyMove(state: TState, playerId: string, move: TMove): TState;
  resolveRound(state: TState): TState;
  status(state: TState): GameStatus;
}
