export type Player = {
  id: string;
  name: string;
  gamesPlayed: number;
  wins: number;
};

export type MatchResult = {
  winner?: "A" | "B";
  /** Optional points for team A */
  scoreA?: number;
  /** Optional points for team B */
  scoreB?: number;
};

/** One independent court; rotates on its own when done. */
export type CourtSlot = {
  id: number;
  /** 0 or 4 player ids */
  playerIds: string[];
  result?: MatchResult;
};

export type Match = {
  court: number;
  teamA: Player[];
  teamB: Player[];
  result?: MatchResult;
  /** True when this court has enough players for doubles */
  ready: boolean;
};

export type SessionConfig = {
  title: string;
  courtCount: number;
  /** Session length in hours */
  hours: number;
  /** Average game length in hours (e.g. 0.25 = 15 min) */
  gameLengthHours: number;
};

export type SessionStatus = "active" | "ended";

/** Session fields without undo history (used for snapshots). */
export type SessionSnapshot = SessionConfig & {
  id: string;
  players: Player[];
  queue: string[];
  courts: CourtSlot[];
  startedAt: number;
  updatedAt: number;
  status: SessionStatus;
};

/** One big JSON blob per session in localStorage. */
export type Session = SessionSnapshot & {
  /** Prior states for Undo (same JSON; max ~15) */
  undoStack: SessionSnapshot[];
};

export type SessionSummary = {
  id: string;
  title: string;
  courtCount: number;
  hours: number;
  playerCount: number;
  startedAt: number;
  updatedAt: number;
  status: SessionStatus;
};

export type SetupInput = SessionConfig;

export const DB_INDEX_KEY = "paddle-stacking-db-index-v3";
export const DB_SESSION_PREFIX = "paddle-stacking-db-session-v3:";
/** Legacy single-session key (migrated once) */
export const LEGACY_SESSION_KEY = "paddle-stacking-session-v2";

/** Default ~15 minute games */
export const DEFAULT_GAME_LENGTH_HOURS = 0.25;
export const PLAYERS_PER_COURT = 4;
export const HOUR_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8] as const;
export const DEFAULT_SESSION_TITLE = "Open Play";
