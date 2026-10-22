import type { CatalogGameId, RpsHand, ViewerRole } from "@game-platform/shared";
import { ComingSoonBoard } from "./coming-soon-board";
import type { MatchMoveView } from "./match-types";
import { RpsBoard } from "./rps-board";

export function GameSurface({
  gameId,
  role,
  leftMove,
  rightMove,
  selected,
  disabled,
  onPick,
}: {
  gameId: CatalogGameId;
  role: ViewerRole;
  leftMove: MatchMoveView;
  rightMove: MatchMoveView;
  selected?: RpsHand;
  disabled?: boolean;
  onPick?: (hand: RpsHand) => void;
}) {
  if (gameId !== "rps") {
    return <ComingSoonBoard gameId={gameId} />;
  }

  return (
    <RpsBoard
      role={role}
      leftMove={leftMove}
      rightMove={rightMove}
      selected={selected}
      disabled={disabled}
      onPick={onPick}
    />
  );
}
