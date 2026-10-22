import {
  IllegalMoveError,
  type GameEngine,
  type GameStatus,
} from "@game-platform/game-core";
import { MATCH_RULES, rpsHands, type RpsHand, type Seat } from "@game-platform/shared";
import { rpsManifest } from "./manifest";

const beats: Record<RpsHand, RpsHand> = {
  Rock: "Scissors",
  Paper: "Rock",
  Scissors: "Paper",
};

export type RpsPhase = "choosing" | "reveal" | "finished";

export type RpsRoundLog = {
  round: number;
  hands: Record<Seat, RpsHand>;
  outcome: Seat | "draw";
};

export type RpsSeatState = {
  playerId: string;
  score: number;
  hand: RpsHand | null;
};

export type RpsState = {
  firstTo: number;
  round: number;
  phase: RpsPhase;
  seats: Record<Seat, RpsSeatState>;
  log: RpsRoundLog[];
  winnerSeat: Seat | null;
};

function otherSeat(seat: Seat): Seat {
  return seat === "a" ? "b" : "a";
}

export function seatOf(state: RpsState, playerId: string): Seat {
  if (state.seats.a.playerId === playerId) return "a";
  if (state.seats.b.playerId === playerId) return "b";
  throw new IllegalMoveError(`Unknown player "${playerId}"`);
}

export function bothReady(state: RpsState) {
  return state.seats.a.hand !== null && state.seats.b.hand !== null;
}

export function randomHand(rng: () => number = Math.random): RpsHand {
  return rpsHands[Math.floor(rng() * rpsHands.length)] ?? "Rock";
}

export function roundDetail(entry: RpsRoundLog) {
  if (entry.outcome === "draw") {
    return `Draw · ${entry.hands.a} vs ${entry.hands.b}`;
  }

  const winner = entry.outcome;
  const loser = otherSeat(winner);
  return `${entry.hands[winner]} beats ${entry.hands[loser]}`;
}

export function viewerRoundDetail(entry: RpsRoundLog, viewerSeat: Seat) {
  if (entry.outcome === "draw") {
    return `Draw · ${entry.hands[viewerSeat]} vs ${entry.hands[otherSeat(viewerSeat)]}`;
  }

  if (entry.outcome === viewerSeat) {
    return `You won · ${roundDetail(entry)}`;
  }

  return `CPU won · ${roundDetail(entry)}`;
}

function judge(a: RpsHand, b: RpsHand): Seat | "draw" {
  if (a === b) return "draw";
  return beats[a] === b ? "a" : "b";
}

export const rpsEngine: GameEngine<RpsState, RpsHand> = {
  manifest: rpsManifest,

  initialState(players) {
    if (players.a === players.b) {
      throw new IllegalMoveError("Players must be distinct");
    }

    return {
      firstTo: MATCH_RULES.winScore,
      round: 1,
      phase: "choosing",
      seats: {
        a: { playerId: players.a, score: 0, hand: null },
        b: { playerId: players.b, score: 0, hand: null },
      },
      log: [],
      winnerSeat: null,
    };
  },

  applyMove(state, playerId, hand) {
    if (state.phase !== "choosing") {
      throw new IllegalMoveError("Moves are locked for this round");
    }

    const seat = seatOf(state, playerId);
    if (state.seats[seat].hand) {
      throw new IllegalMoveError("That player already locked a hand");
    }

    return {
      ...state,
      seats: {
        ...state.seats,
        [seat]: { ...state.seats[seat], hand },
      },
    };
  },

  resolveRound(state) {
    const handA = state.seats.a.hand;
    const handB = state.seats.b.hand;

    if (state.phase !== "choosing" || !handA || !handB) {
      throw new IllegalMoveError("Both players must lock a hand before reveal");
    }

    const outcome = judge(handA, handB);
    const scoreA = state.seats.a.score + (outcome === "a" ? 1 : 0);
    const scoreB = state.seats.b.score + (outcome === "b" ? 1 : 0);
    const winnerSeat =
      scoreA >= state.firstTo ? "a" : scoreB >= state.firstTo ? "b" : null;

    return {
      ...state,
      phase: winnerSeat ? "finished" : "reveal",
      winnerSeat,
      seats: {
        a: { ...state.seats.a, score: scoreA, hand: handA },
        b: { ...state.seats.b, score: scoreB, hand: handB },
      },
      log: [
        ...state.log,
        {
          round: state.round,
          hands: { a: handA, b: handB },
          outcome,
        },
      ],
    };
  },

  status(state): GameStatus {
    if (state.winnerSeat) {
      return { kind: "winner", playerId: state.seats[state.winnerSeat].playerId };
    }

    return { kind: "playing" };
  },
};

export function advanceRound(state: RpsState): RpsState {
  if (state.phase === "finished") {
    return state;
  }

  if (state.phase !== "reveal") {
    throw new IllegalMoveError("The round is not ready to advance");
  }

  return {
    ...state,
    round: state.round + 1,
    phase: "choosing",
    seats: {
      a: { ...state.seats.a, hand: null },
      b: { ...state.seats.b, hand: null },
    },
  };
}
