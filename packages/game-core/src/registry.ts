import type { GameEngine } from "./engine";

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
  registerEngine(engine: GameEngine): void;
  list(): GameManifest[];
  get(id: string): GameManifest | undefined;
  getEngine(id: string): GameEngine | undefined;
}

export function createGameRegistry(): GameRegistry {
  const games = new Map<string, GameManifest>();
  const engines = new Map<string, GameEngine>();

  return {
    register(manifest) {
      if (games.has(manifest.id)) {
        throw new Error(`Game "${manifest.id}" is already registered`);
      }

      games.set(manifest.id, manifest);
    },
    registerEngine(engine) {
      if (games.has(engine.manifest.id)) {
        throw new Error(`Game "${engine.manifest.id}" is already registered`);
      }

      games.set(engine.manifest.id, engine.manifest);
      engines.set(engine.manifest.id, engine);
    },
    list() {
      return [...games.values()];
    },
    get(id) {
      return games.get(id);
    },
    getEngine(id) {
      return engines.get(id);
    },
  };
}
