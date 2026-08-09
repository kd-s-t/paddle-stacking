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
    playSeq: 0,
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

function newPlayer(name: string, number: number): Player {
  return {
    id: id(),
    name,
    number,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
  };
}

function nextPlayerNumber(session: Session): number {
  const max = session.players.reduce(
    (m, p) => Math.max(m, typeof p.number === "number" ? p.number : 0),
    0,
  );
  return max + 1;
}

/** Ensure every player has a permanent # (fixes older in-memory sessions). */
export function ensurePlayerNumbers(session: Session): Session {
  let max = session.players.reduce(
    (m, p) => Math.max(m, typeof p.number === "number" ? p.number : 0),
    0,
  );
  let changed = false;
  const players = session.players.map((p) => {
    if (typeof p.number === "number" && p.number > 0) return p;
    changed = true;
    max += 1;
    return { ...p, number: max };
  });
  return changed ? { ...session, players } : session;
}

function playerMap(session: Session): Map<string, Player> {
  return new Map(session.players.map((p) => [p.id, p]));
}

function onCourtIds(session: Session): Set<string> {
  return new Set(session.courts.flatMap((c) => c.playerIds));
}

/**
 * Partner swap for a foursome from the line: (0,2) vs (1,3).
 * Winners vs winners: [W1a, W1b, W2a, W2b] -> W1a+W2a vs W1b+W2b
 * (e.g. P1,P3,P6,P8 -> P1+P6 vs P3+P8).
 */
export function swapPartners(playerIds: string[]): string[] {
  if (playerIds.length !== PLAYERS_PER_COURT) return playerIds;
  const [a, b, c, d] = playerIds;
  return [a, c, b, d];
}

/** @deprecated use swapPartners */
export function seatCourt(playerIds: string[]): string[] {
  return swapPartners(playerIds);
}

/** Loser meeting: (0,3) vs (2,1) -> P2+P7 vs P5+P4 from [P2,P4,P5,P7]. */
export function seatLosers(playerIds: string[]): string[] {
  if (playerIds.length !== PLAYERS_PER_COURT) return playerIds;
  const [a, b, c, d] = playerIds;
  return [a, d, c, b];
}

function allLastOutcome(
  session: Session,
  playerIds: string[],
  outcome: "win" | "loss",
): boolean {
  const byId = playerMap(session);
  return playerIds.every((pid) => byId.get(pid)?.lastOutcome === outcome);
}

function seatForFoursome(session: Session, playerIds: string[]): string[] {
  const byId = playerMap(session);
  if (allLastOutcome(session, playerIds, "loss")) return seatLosers(playerIds);
  if (allLastOutcome(session, playerIds, "win")) return swapPartners(playerIds);
  // First-timers (no outcome yet): normal cross seat.
  if (playerIds.every((pid) => !byId.get(pid)?.lastOutcome)) {
    return swapPartners(playerIds);
  }
  // Mixed win+loss only when the stack is too thin to avoid it: keep pairs as queued.
  return playerIds;
}

/**
 * Pull next 4 from the line:
 * - skip people who just played when others are waiting
 * - prefer 4 winners together, or 4 losers together (never mix when avoidable)
 */
export function takeNextGroup(
  queue: string[],
  players: Player[],
  playSeq: number,
): { chosen: string[]; queue: string[] } {
  const byId = new Map(players.map((p) => [p.id, p]));
  const rested: string[] = [];
  const fresh: string[] = [];
  for (const pid of queue) {
    const last = byId.get(pid)?.lastPlaySeq ?? 0;
    if (playSeq > 0 && last >= playSeq) fresh.push(pid);
    else rested.push(pid);
  }

  const pickSameOutcome = (
    pool: string[],
    outcome: "win" | "loss",
  ): string[] | null => {
    const matched = pool.filter((pid) => byId.get(pid)?.lastOutcome === outcome);
    if (matched.length < PLAYERS_PER_COURT) return null;
    return matched.slice(0, PLAYERS_PER_COURT);
  };

  let chosen: string[] = [];
  const front = rested[0] ? byId.get(rested[0])?.lastOutcome : undefined;
  const winFour = pickSameOutcome(rested, "win");
  const lossFour = pickSameOutcome(rested, "loss");

  if (front === "win" && winFour) chosen = winFour;
  else if (front === "loss" && lossFour) chosen = lossFour;
  else if (winFour) chosen = winFour;
  else if (lossFour) chosen = lossFour;
  else {
    while (chosen.length < PLAYERS_PER_COURT && rested.length > 0) {
      chosen.push(rested.shift()!);
    }
    while (chosen.length < PLAYERS_PER_COURT && fresh.length > 0) {
      chosen.push(fresh.shift()!);
    }
    return { chosen, queue: [...rested, ...fresh] };
  }

  const chosenSet = new Set(chosen);
  const restRested = rested.filter((pid) => !chosenSet.has(pid));
  return { chosen, queue: [...restRested, ...fresh] };
}

/** Pull from queue into any empty courts that can take 4. */
export function fillCourts(session: Session): Session {
  let queue = [...session.queue];
  const courts = session.courts.map((c) => ({
    ...c,
    playerIds: [...c.playerIds],
  }));
  const playSeq = session.playSeq ?? 0;

  for (const court of courts) {
    if (court.playerIds.length >= PLAYERS_PER_COURT) continue;
    if (queue.length < PLAYERS_PER_COURT) break;

    const taken = takeNextGroup(queue, session.players, playSeq);
    if (taken.chosen.length < PLAYERS_PER_COURT) {
      queue = taken.queue;
      break;
    }
    queue = taken.queue;
    court.playerIds = seatForFoursome(session, taken.chosen);
    court.result = undefined;
  }

  return { ...session, queue, courts };
}

/** Append paddles to the end of the waiting stack, then fill free courts. */
export function addPlayers(session: Session, names: string[]): Session {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return session;

  let nextNum = nextPlayerNumber(session);
  const newcomers = cleaned.map((name) => newPlayer(name, nextNum++));
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

export function renamePlayer(
  session: Session,
  playerId: string,
  rawName: string,
): Session {
  const name = rawName.trim();
  if (!name) return session;

  return {
    ...session,
    players: session.players.map((p) =>
      p.id === playerId ? { ...p, name } : p,
    ),
    updatedAt: Date.now(),
  };
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

function fairnessRank(
  players: Player[],
  gamesPlayed: number,
  outcome?: "win" | "loss",
): number {
  const maxGames = players.reduce((m, p) => Math.max(m, p.gamesPlayed), 0);
  const hasUnplayed = players.some((p) => p.gamesPlayed === 0);
  // While some still unplayed: losers ahead of winners in line.
  // Once everyone has played: winners ahead (so winners meet winners next).
  // When some are a game up: losers ahead among those still behind.
  const preferLosersFirst =
    gamesPlayed < maxGames || (hasUnplayed && gamesPlayed > 0);
  if (preferLosersFirst) {
    if (outcome === "loss") return 0;
    if (outcome === "win") return 1;
    return 2;
  }
  if (outcome === "win") return 0;
  if (outcome === "loss") return 1;
  return 2;
}

function sortByFairness(
  ids: string[],
  players: Player[],
): string[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  return [...ids].sort((a, b) => {
    const pa = byId.get(a);
    const pb = byId.get(b);
    if (!pa || !pb) return 0;
    if (pa.gamesPlayed !== pb.gamesPlayed) {
      return pa.gamesPlayed - pb.gamesPlayed;
    }
    const ra = fairnessRank(players, pa.gamesPlayed, pa.lastOutcome);
    const rb = fairnessRank(players, pb.gamesPlayed, pb.lastOutcome);
    if (ra !== rb) return ra - rb;
    return ids.indexOf(a) - ids.indexOf(b);
  });
}

/**
 * After a game, the 4 who just played go to the starting line (end of the
 * wait list) so they are not next. Everyone already waiting is re-ordered
 * by fairness; top of that list is who goes on next.
 */
export function restackQueue(
  waiting: string[],
  finishedIds: string[],
  players: Player[],
  winnerSide?: "A" | "B",
): string[] {
  const teamA = finishedIds.slice(0, 2);
  const teamB = finishedIds.slice(2, 4);
  const winners =
    winnerSide === "A" ? teamA : winnerSide === "B" ? teamB : [];
  const losers =
    winnerSide === "A" ? teamB : winnerSide === "B" ? teamA : [];

  // People who were already waiting = next up (fairness sort).
  const ready = sortByFairness(waiting, players);

  // Just-finished always to the back (starting line again). Losers ahead of
  // winners in that returning block while others still haven't played.
  const hasUnplayed = players.some((p) => p.gamesPlayed === 0);
  const returning =
    winnerSide !== "A" && winnerSide !== "B"
      ? [...finishedIds]
      : hasUnplayed
        ? [...losers, ...winners]
        : [...winners, ...losers];

  return [...ready, ...returning];
}

/**
 * Rotate one court: apply win/loss, restack, then fill from the front.
 * Finishers are marked with playSeq so they are not pulled back on while
 * rested players are still waiting.
 */
export function rotateCourt(session: Session, courtId: number): Session {
  session = ensurePlayerNumbers(session);
  const court = session.courts.find((c) => c.id === courtId);
  if (!court || court.playerIds.length === 0) return session;

  const winnerSide = court.result?.winner;
  const winnerIds = new Set<string>();
  const loserIds = new Set<string>();
  if (winnerSide === "A") {
    court.playerIds.slice(0, 2).forEach((pid) => winnerIds.add(pid));
    court.playerIds.slice(2, 4).forEach((pid) => loserIds.add(pid));
  } else if (winnerSide === "B") {
    court.playerIds.slice(2, 4).forEach((pid) => winnerIds.add(pid));
    court.playerIds.slice(0, 2).forEach((pid) => loserIds.add(pid));
  }

  const playSeq = (session.playSeq ?? 0) + 1;
  const finishedIds = [...court.playerIds];
  const players = session.players.map((p) => {
    if (!finishedIds.includes(p.id)) return p;
    const won = winnerIds.has(p.id);
    const lost = loserIds.has(p.id);
    return {
      ...p,
      gamesPlayed: p.gamesPlayed + 1,
      wins: p.wins + (won ? 1 : 0),
      losses: p.losses + (lost ? 1 : 0),
      lastOutcome: won ? ("win" as const) : lost ? ("loss" as const) : p.lastOutcome,
      lastPlaySeq: playSeq,
    };
  });

  const courts = session.courts.map((c) =>
    c.id === courtId ? { ...c, playerIds: [], result: undefined } : c,
  );

  return fillCourts({
    ...session,
    playSeq,
    players,
    courts,
    queue: restackQueue(session.queue, finishedIds, players, winnerSide),
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
    playSeq: typeof legacy.playSeq === "number" ? legacy.playSeq : 0,
    undoStack: Array.isArray(legacy.undoStack) ? legacy.undoStack : [],
  };
}
