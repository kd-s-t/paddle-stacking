import {
  ensurePlayerNumbers,
  finishSession,
  migrateSessionShape,
} from "./rotation";
import {
  DB_INDEX_KEY,
  DB_SESSION_PREFIX,
  DEFAULT_SESSION_TITLE,
  LEGACY_SESSION_KEY,
  type Session,
  type SessionSummary,
} from "./types";

function sessionKey(id: string): string {
  return `${DB_SESSION_PREFIX}${id}`;
}

function readIndex(): SessionSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DB_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SessionSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(index: SessionSummary[]): void {
  localStorage.setItem(DB_INDEX_KEY, JSON.stringify(index));
}

function toSummary(session: Session): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    courtCount: session.courtCount,
    hours: session.hours,
    playerCount: session.players.length,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    status: session.status,
  };
}

function normalizeSession(parsed: Session): Session | null {
  if (!parsed?.id || !Array.isArray(parsed.players)) return null;
  const base = {
    ...parsed,
    title: parsed.title?.trim() || DEFAULT_SESSION_TITLE,
    status: parsed.status === "ended" ? "ended" : "active",
    updatedAt: parsed.updatedAt ?? parsed.startedAt ?? Date.now(),
    playSeq: typeof parsed.playSeq === "number" ? parsed.playSeq : 0,
    undoStack: Array.isArray(parsed.undoStack) ? parsed.undoStack : [],
    courts: Array.isArray(parsed.courts)
      ? parsed.courts.map((c) => ({
          ...c,
          startedAt:
            Array.isArray(c.playerIds) &&
            c.playerIds.length === 4 &&
            typeof c.startedAt === "number"
              ? c.startedAt
              : Array.isArray(c.playerIds) && c.playerIds.length === 4
                ? Date.now()
                : undefined,
        }))
      : parsed.courts,
    players: parsed.players.map((p, index) => {
      const wins = typeof p.wins === "number" ? p.wins : 0;
      const gamesPlayed =
        typeof p.gamesPlayed === "number" ? p.gamesPlayed : 0;
      const losses =
        typeof p.losses === "number"
          ? p.losses
          : Math.max(0, gamesPlayed - wins);
      return {
        ...p,
        number: typeof p.number === "number" && p.number > 0 ? p.number : index + 1,
        wins,
        losses,
        gamesPlayed,
        done: p.done === true,
        lastPlaySeq: typeof p.lastPlaySeq === "number" ? p.lastPlaySeq : 0,
      };
    }),
  } as Session;
  return ensurePlayerNumbers(migrateSessionShape(base));
}

/** One-time migrate legacy single-session localStorage into the local DB. */
export function migrateLegacySession(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LEGACY_SESSION_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw) as Omit<Session, "id" | "updatedAt"> & {
      id?: string;
    };
    if (!Array.isArray(legacy.players)) {
      localStorage.removeItem(LEGACY_SESSION_KEY);
      return;
    }
    const id =
      legacy.id ??
      crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    const session = normalizeSession({
      ...legacy,
      id,
      updatedAt: Date.now(),
      status: legacy.status === "ended" ? "ended" : "active",
    } as Session);
    if (session) {
      putSession(session);
    }
    localStorage.removeItem(LEGACY_SESSION_KEY);
    localStorage.removeItem("paddle-stacking-session-v1");
  } catch {
    localStorage.removeItem(LEGACY_SESSION_KEY);
  }
}

export function listSessions(): SessionSummary[] {
  migrateLegacySession();
  return readIndex()
    .map((s) => ({
      ...s,
      title: s.title?.trim() || DEFAULT_SESSION_TITLE,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): Session | null {
  if (typeof window === "undefined") return null;
  migrateLegacySession();
  try {
    const raw = localStorage.getItem(sessionKey(id));
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw) as Session);
  } catch {
    return null;
  }
}

export function putSession(session: Session): void {
  if (typeof window === "undefined") return;
  const next = {
    ...session,
    updatedAt: Date.now(),
  };
  localStorage.setItem(sessionKey(next.id), JSON.stringify(next));
  const index = readIndex().filter((s) => s.id !== next.id);
  index.unshift(toSummary(next));
  writeIndex(index);
}

export function deleteSession(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(sessionKey(id));
  writeIndex(readIndex().filter((s) => s.id !== id));
}

export function endSession(id: string): Session | null {
  const session = getSession(id);
  if (!session) return null;
  const ended = finishSession(session);
  putSession(ended);
  return ended;
}
