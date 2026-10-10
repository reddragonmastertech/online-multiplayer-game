import { z } from "zod";

export const gameIdSchema = z.string().min(1);
export type GameId = z.infer<typeof gameIdSchema>;

export const playerIdSchema = z.string().min(1);
export type PlayerId = z.infer<typeof playerIdSchema>;
