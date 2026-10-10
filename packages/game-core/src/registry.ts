export interface GameManifest {
  id: string;
  name: string;
  version: string;
  minPlayers: number;
  maxPlayers: number;
  description: string;
}

export interface GameRegistry {
  register(manifest: GameManifest): void;
  list(): GameManifest[];
  get(id: string): GameManifest | undefined;
}

export function createGameRegistry(): GameRegistry {
  const games = new Map<string, GameManifest>();

  return {
    register(manifest) {
      if (games.has(manifest.id)) {
        throw new Error(`Game "${manifest.id}" is already registered`);
      }

      games.set(manifest.id, manifest);
    },
    list() {
      return [...games.values()];
    },
    get(id) {
      return games.get(id);
    },
  };
}
