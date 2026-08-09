import {
  DEFAULT_GAME_LENGTH_HOURS,
  DEFAULT_SESSION_TITLE,
  PLAYERS_PER_COURT,
  type CourtSlot,
  type Match,
  type MatchResult,
  type Player,
  type Session,
  type SessionSnapshot,
  type SetupInput,
} from "./types";

const MAX_UNDO = 15;

function id(): string {
  return crypto.randomUUID();
}

export function parseNames(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((n) => n.trim())
    .filter(Boolean);
}

export function estimatedRounds(
  hours: number,
  gameLengthHours = DEFAULT_GAME_LENGTH_HOURS,
): number {
  if (hours <= 0 || gameLengthHours <= 0) return 0;
  return Math.max(1, Math.floor(hours / gameLengthHours));
}

export function capacityPerRound(courtCount: number): number {
  return courtCount * PLAYERS_PER_COURT;
}

export function createSessionId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

function emptyCourts(courtCount: number): CourtSlot[] {
  return Array.from({ length: courtCount }, (_, i) => ({
    id: i + 1,
    playerIds: [],
  }));
}

export function createSession(input: SetupInput): Session {
  const now = Date.now();
  return {
    id: createSessionId(),
    title: input.title.trim() || DEFAULT_SESSION_TITLE,
    players: [],
    queue: [],
    courts: emptyCourts(input.courtCount),
    undoStack: [],
    courtCount: input.courtCount,
    hours: input.hours,
    gameLengthHours: input.gameLengthHours,
    startedAt: now,
    updatedAt: now,
    status: "active",
  };
}

export function snapshotSession(session: Session): SessionSnapshot {
  const { undoStack: _undo, ...rest } = session;
  return structuredClone(rest);
}

/** Attach a pre-change snapshot so the next state can be undone. */
export function withUndo(before: Session, after: Session): Session {
  const stack = [...(before.undoStack ?? []), snapshotSession(before)].slice(
    -MAX_UNDO,
  );
  return { ...after, undoStack: stack };
}

export function undoSession(session: Session): Session | null {
  const stack = session.undoStack ?? [];
  if (stack.length === 0) return null;
  const previous = stack[stack.length - 1];
  return {
    ...structuredClone(previous),
    undoStack: stack.slice(0, -1),
  };
}

export function canUndo(session: Session): boolean {
  return (session.undoStack?.length ?? 0) > 0;
}

export function updateSessionDetails(
  session: Session,
  details: { title: string; hours: number },
): Session {
  const title = details.title.trim() || DEFAULT_SESSION_TITLE;
  const hours = details.hours > 0 ? details.hours : session.hours;
  return {
    ...session,
    title,
    hours,
    updatedAt: Date.now(),
  };
}

const DEMO_NAMES = [
  "Alex",
  "Jordan",
  "Sam",
  "Riley",
  "Casey",
  "Morgan",
  "Quinn",
  "Avery",
  "Jamie",
  "Taylor",
  "Drew",
  "Cameron",
  "Reese",
  "Skyler",
  "Parker",
  "Hayden",
  "Rowan",
  "Finley",
  "Blake",
  "Charlie",
  "Emerson",
  "Harper",
  "Logan",
  "Micah",
  "Noah",
  "Peyton",
  "River",
  "Sage",
  "Tatum",
  "Dakota",
  "Ellis",
  "Frankie",
  "Gray",
  "Hunter",
  "Indigo",
  "Jules",
  "Kai",
  "Lane",
  "Marley",
  "Nico",
  "Oakley",
  "Phoenix",
  "Remy",
  "Shawn",
  "Teagan",
  "Val",
  "Wren",
  "Yael",
  "Zion",
  "Ari",
];

function newPlayer(name: string): Player {
  return {
    id: id(),
    name,
    gamesPlayed: 0,
    wins: 0,
  };
}

function playerMap(session: Session): Map<string, Player> {
  return new Map(session.players.map((p) => [p.id, p]));
}

function onCourtIds(session: Session): Set<string> {
  return new Set(session.courts.flatMap((c) => c.playerIds));
}

/** Pull from queue into any empty courts that can take 4. */
export function fillCourts(session: Session): Session {
  let queue = [...session.queue];
  const courts = session.courts.map((c) => ({
    ...c,
    playerIds: [...c.playerIds],
  }));

  for (const court of courts) {
    if (court.playerIds.length >= PLAYERS_PER_COURT) continue;
    if (queue.length < PLAYERS_PER_COURT) break;
    court.playerIds = queue.splice(0, PLAYERS_PER_COURT);
    court.result = undefined;
  }

  return { ...session, queue, courts };
}

/** Append paddles to the end of the waiting stack, then fill free courts. */
export function addPlayers(session: Session, names: string[]): Session {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return session;

  const newcomers = cleaned.map(newPlayer);
  return fillCourts({
    ...session,
    players: [...session.players, ...newcomers],
    queue: [...session.queue, ...newcomers.map((p) => p.id)],
  });
}

/** Fill the stack with demo names (skips names already on the stack). */
export function populateStack(session: Session, count = 50): Session {
  const taken = new Set(session.players.map((p) => p.name.toLowerCase()));
  const names = DEMO_NAMES.filter((n) => !taken.has(n.toLowerCase())).slice(
    0,
    count,
  );
  return addPlayers(session, names);
}

export function removePlayer(session: Session, playerId: string): Session {
  const courts = session.courts.map((c) => ({
    ...c,
    playerIds: c.playerIds.filter((id) => id !== playerId),
    result: c.playerIds.includes(playerId) ? undefined : c.result,
  }));

  return fillCourts({
    ...session,
    players: session.players.filter((p) => p.id !== playerId),
    queue: session.queue.filter((id) => id !== playerId),
    courts,
  });
}

export function waitingPlayers(session: Session): Player[] {
  const byId = playerMap(session);
  return session.queue
    .map((pid) => byId.get(pid))
    .filter((p): p is Player => Boolean(p));
}

export function playingPlayers(session: Session): Player[] {
  const byId = playerMap(session);
  return session.courts
    .flatMap((c) => c.playerIds)
    .map((pid) => byId.get(pid))
    .filter((p): p is Player => Boolean(p));
}

export function playingMatches(session: Session): Match[] {
  const byId = playerMap(session);

  return session.courts.map((court) => {
    const players = court.playerIds
      .map((pid) => byId.get(pid))
      .filter((p): p is Player => Boolean(p));
    return {
      court: court.id,
      teamA: players.slice(0, 2),
      teamB: players.slice(2, 4),
      result: court.result,
      ready: players.length === PLAYERS_PER_COURT,
    };
  });
}

export function setMatchWinner(
  session: Session,
  courtId: number,
  winner: "A" | "B",
): Session {
  const courts = session.courts.map((c) => {
    if (c.id !== courtId) return c;
    return {
      ...c,
      result: {
        ...c.result,
        winner,
      },
    };
  });
  return { ...session, courts };
}

export function setMatchScore(
  session: Session,
  courtId: number,
  side: "A" | "B",
  raw: string,
): Session {
  const parsed = raw.trim() === "" ? undefined : Number(raw);
  const score =
    parsed !== undefined && Number.isFinite(parsed) && parsed >= 0
      ? Math.floor(parsed)
      : undefined;

  const courts = session.courts.map((c) => {
    if (c.id !== courtId) return c;
    const prev = c.result ?? {};
    const next: MatchResult = {
      ...prev,
      scoreA: side === "A" ? score : prev.scoreA,
      scoreB: side === "B" ? score : prev.scoreB,
    };
    return { ...c, result: next };
  });

  return { ...session, courts };
}

/**
 * Rotate one court: apply win, bump games, send those paddles to the
 * back of the queue, then fill that court from the waiting stack.
 */
export function rotateCourt(session: Session, courtId: number): Session {
  const court = session.courts.find((c) => c.id === courtId);
  if (!court || court.playerIds.length === 0) return session;

  const winnerSide = court.result?.winner;
  const winnerIds = new Set<string>();
  if (winnerSide === "A") {
    court.playerIds.slice(0, 2).forEach((pid) => winnerIds.add(pid));
  } else if (winnerSide === "B") {
    court.playerIds.slice(2, 4).forEach((pid) => winnerIds.add(pid));
  }

  const finishedIds = [...court.playerIds];
  const players = session.players.map((p) =>
    finishedIds.includes(p.id)
      ? {
          ...p,
          gamesPlayed: p.gamesPlayed + 1,
          wins: p.wins + (winnerIds.has(p.id) ? 1 : 0),
        }
      : p,
  );

  const courts = session.courts.map((c) =>
    c.id === courtId ? { ...c, playerIds: [], result: undefined } : c,
  );

  return fillCourts({
    ...session,
    players,
    courts,
    queue: [...session.queue, ...finishedIds],
  });
}

/** Decide a winner and immediately rotate that court. */
export function decideAndRotate(
  session: Session,
  courtId: number,
  winner: "A" | "B",
): Session {
  return rotateCourt(setMatchWinner(session, courtId, winner), courtId);
}

export function sessionStats(session: Session) {
  const roundsPlanned = estimatedRounds(session.hours, session.gameLengthHours);
  const elapsedMs = Date.now() - session.startedAt;
  const totalMs = session.hours * 60 * 60 * 1000;
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  const games = session.players.map((p) => p.gamesPlayed);
  const minGames = games.length ? Math.min(...games) : 0;
  const maxGames = games.length ? Math.max(...games) : 0;
  const playing = onCourtIds(session).size;
  const waiting = session.queue.length;

  return {
    roundsPlanned,
    elapsedMs,
    remainingMs,
    minGames,
    maxGames,
    upNext: playing,
    waiting,
    balanceSpread: maxGames - minGames,
  };
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Upgrade older flat-stack sessions into courts + queue. */
export function migrateSessionShape(session: Session): Session {
  if (Array.isArray(session.courts) && Array.isArray(session.queue)) {
    return session;
  }

  const legacy = session as Session & {
    matchResults?: Record<string, MatchResult>;
    players: Player[];
  };

  const players = legacy.players ?? [];
  const courtCount = legacy.courtCount || 1;
  const capacity = capacityPerRound(courtCount);
  const playingIds = players.slice(0, capacity).map((p) => p.id);
  const queue = players.slice(capacity).map((p) => p.id);
  const courts = emptyCourts(courtCount);

  for (let i = 0; i < courtCount; i++) {
    const slice = playingIds.slice(
      i * PLAYERS_PER_COURT,
      (i + 1) * PLAYERS_PER_COURT,
    );
    if (slice.length === PLAYERS_PER_COURT) {
      courts[i] = { id: i + 1, playerIds: slice };
    }
  }

  return {
    ...legacy,
    players,
    queue,
    courts,
    undoStack: Array.isArray(legacy.undoStack) ? legacy.undoStack : [],
  };
}
