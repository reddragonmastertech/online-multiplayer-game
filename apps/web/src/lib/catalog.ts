import type { CatalogGameId } from "@game-platform/shared";

export type GameAvailability = "available" | "coming-soon";

export type CatalogGame = {
  id: CatalogGameId;
  name: string;
  blurb: string;
  matchType: string;
  availability: GameAvailability;
  href?: string;
};

export const catalogGames: CatalogGame[] = [
  {
    id: "rps",
    name: "Rock Paper Scissors",
    blurb: "Quick head-to-head rounds. First to 2 wins the match.",
    matchType: "1v1 · a few minutes",
    availability: "available",
    href: "/games/rps",
  },
  {
    id: "chess",
    name: "Chess",
    blurb: "Turn-based strategy for longer sessions.",
    matchType: "1v1 · coming later",
    availability: "coming-soon",
  },
  {
    id: "four-by-four",
    name: "4 × 4",
    blurb: "A compact grid game with simple rules.",
    matchType: "1v1 · coming later",
    availability: "coming-soon",
  },
];

export function findCatalogGame(id: string) {
  return catalogGames.find((game) => game.id === id);
}
