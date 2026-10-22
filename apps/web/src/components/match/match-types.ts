import type { CatalogGameId, RpsHand, ViewerRole } from "@game-platform/shared";

export type MatchMoveView = "choosing" | "locked" | RpsHand;

export type MatchSeatView = {
  id: string;
  name: string;
  avatar: number;
  score: number;
  move: MatchMoveView;
  you?: boolean;
  bot?: boolean;
};

export type MatchLogEntry = {
  round: number;
  detail: string;
};

export type MatchView = {
  gameId: CatalogGameId;
  gameName: string;
  title: string;
  modeLabel: string;
  potLabel?: string;
  round: number;
  firstTo: number;
  secondsLeft?: number;
  showCountdown?: boolean;
  status: string;
  role: ViewerRole;
  badge?: string;
  left: MatchSeatView;
  right: MatchSeatView;
  log: MatchLogEntry[];
  backTo: string;
  backLabel?: string;
};
