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
    queue: [],
    playSeq: 0,
  }));
}

function cloneCourt(court: CourtSlot): CourtSlot {
  return {
    ...court,
    playerIds: [...(court.playerIds ?? [])],
    queue: [...(court.queue ?? [])],
    playSeq: court.playSeq ?? 0,
  };
}

/** Drop duplicate IDs from later courts. Does not move anyone across stacks. */
function exclusiveCourts(courts: CourtSlot[]): CourtSlot[] {
  const seen = new Set<string>();
  return courts.map((court) => {
    const next = cloneCourt(court);
    next.playerIds = next.playerIds.filter((pid) => {
      if (!pid || seen.has(pid)) return false;
      seen.add(pid);
      return true;
    });
    next.queue = next.queue.filter((pid) => {
      if (!pid || seen.has(pid)) return false;
      seen.add(pid);
      return true;
    });
    if (next.playerIds.length !== PLAYERS_PER_COURT) {
      next.startedAt = undefined;
      next.result = undefined;
    }
    return next;
  });
}

function courtMembers(court: CourtSlot): string[] {
  return [...(court.playerIds ?? []), ...(court.queue ?? [])].filter(Boolean);
}

function courtLoad(court: CourtSlot): number {
  return court.playerIds.length + (court.queue?.length ?? 0);
}

/** Court 1 is its own stack. Courts 2+ share one rec stack. */
export function stackIdForCourt(courtId: number): number {
  return courtId <= 1 ? 1 : 2;
}

export function stackAnchorCourtId(
  session: Pick<Session, "courts">,
  courtId: number,
): number {
  const sid = stackIdForCourt(courtId);
  const ids = session.courts
    .filter((c) => stackIdForCourt(c.id) === sid)
    .map((c) => c.id);
  return ids.length > 0 ? Math.min(...ids) : courtId;
}

export function stackCourtIds(
  session: Pick<Session, "courts">,
  courtId: number,
): number[] {
  const sid = stackIdForCourt(courtId);
  return session.courts
    .filter((c) => stackIdForCourt(c.id) === sid)
    .map((c) => c.id)
    .sort((a, b) => a - b);
}

function membersOfOtherStacks(
  courts: CourtSlot[],
  stackId: number,
): Set<string> {
  const ids = new Set<string>();
  for (const court of courts) {
    if (stackIdForCourt(court.id) === stackId) continue;
    for (const pid of courtMembers(court)) ids.add(pid);
  }
  return ids;
}

/** Court 1 keeps its people. Rec courts cannot list anyone from Court 1. */
function isolateStacks(courts: CourtSlot[], players: Player[]): CourtSlot[] {
  const next = courts.map(cloneCourt);
  const court1 = next.find((c) => stackIdForCourt(c.id) === 1);
  const stack1 = new Set<string>();
  if (court1) {
    for (const pid of courtMembers(court1)) stack1.add(pid);
  }
  for (const player of players) {
    if (player.homeCourt != null && stackIdForCourt(player.homeCourt) === 1) {
      stack1.add(player.id);
    }
  }
  const returned: string[] = [];
  for (const court of next) {
    if (stackIdForCourt(court.id) === 1) continue;
    court.playerIds = court.playerIds.filter((pid) => {
      if (!stack1.has(pid)) return true;
      returned.push(pid);
      return false;
    });
    court.queue = court.queue.filter((pid) => {
      if (!stack1.has(pid)) return true;
      returned.push(pid);
      return false;
    });
    if (court.playerIds.length !== PLAYERS_PER_COURT) {
      court.startedAt = undefined;
      court.result = undefined;
    }
  }
  if (court1) {
    const have = new Set(courtMembers(court1));
    for (const pid of returned) {
      if (have.has(pid)) continue;
      court1.queue.push(pid);
      have.add(pid);
    }
  }
  return next;
}

/** Put every shared-stack waiter onto the lowest court id in that stack. */
function mergeStackQueues(courts: CourtSlot[]): CourtSlot[] {
  const next = courts.map(cloneCourt);
  const groups = new Map<number, CourtSlot[]>();
  for (const court of next) {
    const sid = stackIdForCourt(court.id);
    const list = groups.get(sid);
    if (list) list.push(court);
    else groups.set(sid, [court]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.id - b.id);
    const anchor = group[0];
    const onCourt = new Set(group.flatMap((c) => c.playerIds));
    const seen = new Set(anchor.queue.filter((pid) => pid && !onCourt.has(pid)));
    anchor.queue = anchor.queue.filter((pid) => pid && !onCourt.has(pid));
    for (const court of group.slice(1)) {
      for (const pid of court.queue) {
        if (!pid || seen.has(pid) || onCourt.has(pid)) continue;
        seen.add(pid);
        anchor.queue.push(pid);
      }
      court.queue = [];
    }
  }
  return next;
}

export function lightestCourtId(session: Session): number {
  return session.courts.reduce((best, court) =>
    courtLoad(court) < courtLoad(best) ? court : best,
  ).id;
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
    matchHistory: [],
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
  if (allLastOutcome(session, playerIds, "loss")) {
    return seatLosers(playerIds);
  }
  if (allLastOutcome(session, playerIds, "win")) {
    return swapPartners(playerIds);
  }
  if (playerIds.every((pid) => !byId.get(pid)?.lastOutcome)) {
    return swapPartners(playerIds);
  }
  return [...playerIds];
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
    const player = byId.get(pid);
    if (!player || player.done) continue;
    const last = player.lastPlaySeq ?? 0;
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

/** Pull from each stack's waiting line into empty courts on that stack. */
export function fillCourts(session: Session, onlyCourtId?: number): Session {
  const byId = playerMap(session);
  const claimed = new Set<string>();
  let source =
    onlyCourtId == null
      ? exclusiveCourts(session.courts)
      : session.courts.map(cloneCourt);
  source = mergeStackQueues(source);
  source = isolateStacks(source, session.players);
  const byCourtId = new Map(source.map((c) => [c.id, c]));

  if (onlyCourtId != null) {
    const sid = stackIdForCourt(onlyCourtId);
    for (const court of source) {
      if (stackIdForCourt(court.id) === sid) {
        if (court.id !== onlyCourtId) {
          for (const pid of court.playerIds) claimed.add(pid);
        }
      } else {
        for (const pid of courtMembers(court)) claimed.add(pid);
      }
    }
  }

  const fillOrder =
    onlyCourtId != null
      ? source.filter((c) => c.id === onlyCourtId)
      : [...source].sort((a, b) => a.id - b.id);

  for (const court of fillOrder) {
    const current = byCourtId.get(court.id);
    if (!current) continue;
    const sid = stackIdForCourt(current.id);
    const group = source.filter((c) => stackIdForCourt(c.id) === sid);
    const anchorId = Math.min(...group.map((c) => c.id));
    const anchor = byCourtId.get(anchorId);
    if (!anchor) continue;

    const foreign = membersOfOtherStacks(source, sid);
    for (const player of session.players) {
      if (
        player.homeCourt != null &&
        stackIdForCourt(player.homeCourt) !== sid
      ) {
        foreign.add(player.id);
      }
    }

    if (current.pausedAt != null) {
      for (const pid of current.playerIds) claimed.add(pid);
      continue;
    }

    const queue = (anchor.queue ?? []).filter((pid) => {
      const p = byId.get(pid);
      return p != null && !p.done && !claimed.has(pid) && !foreign.has(pid);
    });
    const next: CourtSlot = {
      ...current,
      playerIds: current.playerIds.filter((pid) => {
        if (claimed.has(pid) || foreign.has(pid)) return false;
        const p = byId.get(pid);
        return p != null && !p.done;
      }),
    };

    let remaining = queue;

    if (next.playerIds.length >= PLAYERS_PER_COURT) {
      remaining = queue;
    } else if (
      next.playerIds.length > 0 &&
      next.playerIds.length < PLAYERS_PER_COURT
    ) {
      while (next.playerIds.length < PLAYERS_PER_COURT && remaining.length > 0) {
        const pid = remaining.shift()!;
        if (claimed.has(pid)) continue;
        next.playerIds.push(pid);
      }
      if (next.playerIds.length === PLAYERS_PER_COURT) {
        next.startedAt = Date.now();
        next.result = undefined;
      }
    } else if (remaining.length >= PLAYERS_PER_COURT) {
      const taken = takeNextGroup(remaining, session.players, next.playSeq);
      if (taken.chosen.length === PLAYERS_PER_COURT) {
        remaining = taken.queue;
        next.playerIds = seatForFoursome(session, taken.chosen);
        next.startedAt = Date.now();
        next.result = undefined;
      } else {
        remaining = taken.queue;
      }
    }

    next.queue = [];
    byCourtId.set(next.id, next);
    if (anchorId === next.id) {
      next.queue = remaining;
    } else {
      const liveAnchor = byCourtId.get(anchorId);
      if (liveAnchor) liveAnchor.queue = remaining;
    }
    for (const pid of next.playerIds) claimed.add(pid);
  }

  const courts = source.map((c) => {
    const filled = byCourtId.get(c.id) ?? c;
    const sid = stackIdForCourt(filled.id);
    const group = source.filter((x) => stackIdForCourt(x.id) === sid);
    const anchorId = Math.min(...group.map((x) => x.id));
    if (filled.id === anchorId) return filled;
    return { ...filled, queue: [] };
  });

  const homeById = new Map<string, number>();
  for (const court of courts) {
    for (const pid of [...court.playerIds, ...court.queue]) {
      homeById.set(pid, court.id);
    }
  }

  return {
    ...session,
    courts,
    queue: [],
    players: session.players.map((p) => ({
      ...p,
      homeCourt: homeById.get(p.id) ?? p.homeCourt,
    })),
  };
}

/** Append paddles to a court's stack (or the lightest court), then fill. */
export function addPlayers(
  session: Session,
  names: string[],
  courtId?: number,
): Session {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return session;

  let nextNum = nextPlayerNumber(session);
  const newcomers = cleaned.map((name) => newPlayer(name, nextNum++));
  const courts = session.courts.map((c) => ({
    ...c,
    playerIds: [...c.playerIds],
    queue: [...(c.queue ?? [])],
    playSeq: c.playSeq ?? 0,
  }));

  for (const player of newcomers) {
    const requested = courtId ?? lightestCourtId({ ...session, courts });
    const targetId = stackAnchorCourtId({ courts }, requested);
    const court = courts.find((c) => c.id === targetId) ?? courts[0];
    player.homeCourt = court.id;
    court.queue.push(player.id);
  }

  return fillCourts({
    ...session,
    players: [...session.players, ...newcomers],
    courts,
    queue: [],
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

function pullPlayerOffCourts(session: Session, playerId: string): Session {
  const courts = session.courts.map((c) => {
    const playerIds = c.playerIds.filter((id) => id !== playerId);
    const queue = (c.queue ?? []).filter((id) => id !== playerId);
    const removed = c.playerIds.includes(playerId);
    return {
      ...c,
      playerIds,
      queue,
      result: removed ? undefined : c.result,
      startedAt:
        playerIds.length === PLAYERS_PER_COURT ? c.startedAt : undefined,
    };
  });

  return {
    ...session,
    queue: [],
    courts,
  };
}

/** Leave the stack for the day; keep # and W-L. */
export function markDonePlaying(session: Session, playerId: string): Session {
  const pulled = pullPlayerOffCourts(session, playerId);
  return fillCourts({
    ...pulled,
    players: pulled.players.map((p) =>
      p.id === playerId ? { ...p, done: true } : p,
    ),
    updatedAt: Date.now(),
  });
}

/** Put a done player back at the end of their court's waiting line. */
export function rejoinStack(session: Session, playerId: string): Session {
  const player = session.players.find((p) => p.id === playerId);
  if (!player?.done) return session;

  const alreadyOn = session.courts.some(
    (c) =>
      c.playerIds.includes(playerId) || (c.queue ?? []).includes(playerId),
  );
  if (alreadyOn) {
    return {
      ...session,
      players: session.players.map((p) =>
        p.id === playerId ? { ...p, done: false } : p,
      ),
      updatedAt: Date.now(),
    };
  }

  const targetId = stackAnchorCourtId(
    session,
    player.homeCourt ?? lightestCourtId(session),
  );
  const courts = session.courts.map((c) =>
    c.id === targetId
      ? { ...c, queue: [...(c.queue ?? []), playerId] }
      : c,
  );

  return fillCourts({
    ...session,
    players: session.players.map((p) =>
      p.id === playerId
        ? { ...p, done: false, homeCourt: targetId }
        : p,
    ),
    courts,
    queue: [],
    updatedAt: Date.now(),
  });
}

/** Sit out this round: off the court (if playing) and to the end of the stack. */
export function skipThisGame(session: Session, playerId: string): Session {
  if (session.status !== "active") return session;
  const player = session.players.find((p) => p.id === playerId);
  if (!player || player.done) return session;

  const loc = locatePlayer(session, playerId);
  if (!loc) return session;

  const pulled = pullPlayerOffCourts(session, playerId);
  const targetId = stackAnchorCourtId(pulled, loc.courtId);
  const courts = pulled.courts.map((c) =>
    c.id === targetId
      ? { ...c, queue: [...(c.queue ?? []), playerId] }
      : c,
  );

  return fillCourts({
    ...pulled,
    courts,
    players: pulled.players.map((p) =>
      p.id === playerId ? { ...p, homeCourt: targetId } : p,
    ),
    queue: [],
    updatedAt: Date.now(),
  });
}

export function removePlayer(session: Session, playerId: string): Session {
  const pulled = pullPlayerOffCourts(session, playerId);
  return fillCourts({
    ...pulled,
    players: pulled.players.filter((p) => p.id !== playerId),
  });
}

export function donePlayers(session: Session): Player[] {
  return session.players
    .filter((p) => p.done)
    .sort((a, b) => a.number - b.number);
}

/** End open play: clear courts/queue, keep everyone + stats, mark done. */
export function finishSession(session: Session): Session {
  return {
    ...session,
    status: "ended",
    players: session.players.map((p) => ({ ...p, done: true })),
    queue: [],
    courts: session.courts.map((c) => ({
      ...c,
      playerIds: [],
      queue: [],
      result: undefined,
      startedAt: undefined,
      pausedAt: undefined,
    })),
    updatedAt: Date.now(),
  };
}

/** Freeze this court's clock and play. Other courts keep going. */
export function pauseCourt(session: Session, courtId: number): Session {
  if (session.status !== "active") return session;
  const court = session.courts.find((c) => c.id === courtId);
  if (!court || court.pausedAt != null) return session;
  const now = Date.now();
  return {
    ...session,
    courts: session.courts.map((c) =>
      c.id === courtId ? { ...c, pausedAt: now } : c,
    ),
    updatedAt: now,
  };
}

/** Continue this court. Clock stays where it was when paused. */
export function unpauseCourt(session: Session, courtId: number): Session {
  if (session.status !== "active") return session;
  const court = session.courts.find((c) => c.id === courtId);
  if (!court || court.pausedAt == null) return session;
  const now = Date.now();
  const delta = Math.max(0, now - court.pausedAt);
  const courts = session.courts.map((c) =>
    c.id === courtId
      ? {
          ...c,
          pausedAt: undefined,
          startedAt: c.startedAt != null ? c.startedAt + delta : undefined,
        }
      : c,
  );
  return fillCourts({ ...session, courts, updatedAt: now });
}

/** Resume an ended session: split everyone back across court stacks. */
export function resumeSession(session: Session): Session {
  const courts = emptyCourts(session.courts.length || session.courtCount);
  const players = session.players.map((p, i) => {
    const homeCourt = courts[i % courts.length].id;
    courts[i % courts.length].queue.push(p.id);
    return { ...p, done: false, homeCourt };
  });
  return fillCourts({
    ...session,
    status: "active",
    players,
    queue: [],
    courts,
    updatedAt: Date.now(),
  });
}

/** Clear courts, put everyone in waiting, and hold until a court is played. */
export function restartToWaiting(session: Session): Session {
  const now = Date.now();
  const courtCount = session.courts.length || session.courtCount;
  const courts = emptyCourts(courtCount).map((c) => ({
    ...c,
    pausedAt: now,
  }));
  const merged = mergeStackQueues(session.courts.map(cloneCourt));
  const queues = new Map<number, string[]>();
  const seen = new Set<string>();

  function append(anchorId: number, playerId: string) {
    if (!playerId || seen.has(playerId)) return;
    seen.add(playerId);
    const list = queues.get(anchorId) ?? [];
    list.push(playerId);
    queues.set(anchorId, list);
  }

  for (const court of merged) {
    const anchorId = stackAnchorCourtId({ courts }, court.id);
    if (court.id !== anchorId) continue;
    for (const pid of court.queue ?? []) append(anchorId, pid);
  }

  for (const court of [...session.courts].sort((a, b) => a.id - b.id)) {
    const anchorId = stackAnchorCourtId({ courts }, court.id);
    for (const pid of court.playerIds) append(anchorId, pid);
  }

  for (const player of [...session.players].sort(
    (a, b) => a.number - b.number,
  )) {
    const anchorId = stackAnchorCourtId(
      { courts },
      player.homeCourt ?? 1,
    );
    append(anchorId, player.id);
  }

  for (const court of courts) {
    court.queue = queues.get(court.id) ?? [];
  }

  const homeById = new Map<string, number>();
  for (const court of courts) {
    for (const pid of court.queue) homeById.set(pid, court.id);
  }

  return {
    ...session,
    status: "active",
    players: session.players.map((p) => ({
      ...p,
      done: false,
      homeCourt: homeById.get(p.id) ?? p.homeCourt,
    })),
    courts,
    queue: [],
    updatedAt: now,
  };
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
  return session.courts.flatMap((court) =>
    (court.queue ?? [])
      .map((pid) => byId.get(pid))
      .filter((p): p is Player => p != null && !p.done),
  );
}

type PlayerLoc = {
  courtId: number;
  where: "play" | "wait";
  index: number;
};

export function locatePlayer(
  session: Session,
  playerId: string,
): PlayerLoc | null {
  for (const court of session.courts) {
    const playIndex = court.playerIds.indexOf(playerId);
    if (playIndex >= 0) {
      return { courtId: court.id, where: "play", index: playIndex };
    }
    const waitIndex = (court.queue ?? []).indexOf(playerId);
    if (waitIndex >= 0) {
      return { courtId: court.id, where: "wait", index: waitIndex };
    }
  }
  return null;
}

function withMergedQueues(session: Session): Session {
  return {
    ...session,
    courts: mergeStackQueues(session.courts.map(cloneCourt)),
    queue: [],
  };
}

export type QueueMove = "front" | "back" | "up" | "down";

/** Reorder a waiting player on their stack. Does not restack courts. */
export function reorderQueue(
  session: Session,
  playerId: string,
  to: QueueMove,
): Session {
  const merged = withMergedQueues(session);
  const loc = locatePlayer(merged, playerId);
  if (!loc || loc.where !== "wait") return session;

  const anchorId = stackAnchorCourtId(merged, loc.courtId);
  const courts = merged.courts.map(cloneCourt);
  const anchor = courts.find((c) => c.id === anchorId);
  if (!anchor) return session;

  const queue = [...(anchor.queue ?? [])];
  const from = queue.indexOf(playerId);
  if (from < 0) return session;

  queue.splice(from, 1);
  let dest = from;
  if (to === "front") dest = 0;
  else if (to === "back") dest = queue.length;
  else if (to === "up") dest = Math.max(0, from - 1);
  else dest = Math.min(queue.length, from + 1);

  if (dest === from && to !== "back" && to !== "front") {
    queue.splice(from, 0, playerId);
    return session;
  }

  queue.splice(dest, 0, playerId);
  if (queue.join("|") === (anchor.queue ?? []).join("|")) return session;

  return {
    ...session,
    courts: courts.map((c) => (c.id === anchorId ? { ...c, queue } : c)),
    queue: [],
    updatedAt: Date.now(),
  };
}

/** Drop one player on another: insert in the same wait line, otherwise swap. */
export function dropPlayerOnPlayer(
  session: Session,
  fromId: string,
  toId: string,
): Session {
  if (fromId === toId) return session;
  const merged = withMergedQueues(session);
  const from = locatePlayer(merged, fromId);
  const to = locatePlayer(merged, toId);
  if (!from || !to) return session;
  if (
    from.where === "wait" &&
    to.where === "wait" &&
    stackIdForCourt(from.courtId) === stackIdForCourt(to.courtId)
  ) {
    const anchorId = stackAnchorCourtId(merged, from.courtId);
    const courts = merged.courts.map(cloneCourt);
    const anchor = courts.find((c) => c.id === anchorId);
    if (!anchor) return session;
    const queue = [...(anchor.queue ?? [])];
    const fromIndex = queue.indexOf(fromId);
    const toIndex = queue.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return session;
    queue.splice(fromIndex, 1);
    const insertAt = queue.indexOf(toId);
    if (insertAt < 0) return session;
    queue.splice(insertAt, 0, fromId);
    return {
      ...session,
      courts: courts.map((c) => (c.id === anchorId ? { ...c, queue } : c)),
      queue: [],
      updatedAt: Date.now(),
    };
  }
  return swapPlayers(session, fromId, toId);
}

/** Move a player onto another court's stack, then fill empty courts. */
export function movePlayerToCourt(
  session: Session,
  playerId: string,
  toCourtId: number,
): Session {
  const toId = stackAnchorCourtId(session, toCourtId);
  const target = session.courts.find((c) => c.id === toId);
  if (!target) return session;

  const loc = locatePlayer(session, playerId);
  if (!loc) return session;
  if (loc.where === "play") {
    const from = session.courts.find((c) => c.id === loc.courtId);
    if (from?.pausedAt != null) return session;
  }
  if (
    stackIdForCourt(loc.courtId) === stackIdForCourt(toId) &&
    loc.where === "wait"
  ) {
    return session;
  }

  const pulled = pullPlayerOffCourts(session, playerId);
  const courts = pulled.courts.map((c) =>
    c.id === toId
      ? { ...c, queue: [...(c.queue ?? []), playerId] }
      : { ...c, playerIds: [...c.playerIds], queue: [...(c.queue ?? [])] },
  );
  const players = pulled.players.map((p) =>
    p.id === playerId ? { ...p, homeCourt: toId } : p,
  );

  return fillCourts({
    ...pulled,
    courts,
    players,
    queue: [],
  });
}

/** Swap two players (on court or waiting), including across courts. */
export function swapPlayers(
  session: Session,
  aId: string,
  bId: string,
): Session {
  if (aId === bId) return session;
  const a = locatePlayer(session, aId);
  const b = locatePlayer(session, bId);
  if (!a || !b) return session;
  if (a.courtId === b.courtId && a.where === b.where && a.index === b.index) {
    return session;
  }
  const pausedPlay = session.courts.some(
    (c) =>
      c.pausedAt != null &&
      ((a.where === "play" && a.courtId === c.id) ||
        (b.where === "play" && b.courtId === c.id)),
  );
  if (pausedPlay) return session;

  const courts = session.courts.map((c) => ({
    ...c,
    playerIds: [...c.playerIds],
    queue: [...(c.queue ?? [])],
  }));

  function write(loc: PlayerLoc, playerId: string) {
    const court = courts.find((c) => c.id === loc.courtId);
    if (!court) return;
    if (loc.where === "play") {
      court.playerIds[loc.index] = playerId;
      court.result = undefined;
    } else {
      court.queue[loc.index] = playerId;
    }
  }

  write(a, bId);
  write(b, aId);

  const players = session.players.map((p) => {
    if (p.id === aId) return { ...p, homeCourt: b.courtId };
    if (p.id === bId) return { ...p, homeCourt: a.courtId };
    return p;
  });

  return { ...session, courts, players, queue: [] };
}

export function waitingPlayersOnCourt(
  session: Session,
  courtId: number,
): Player[] {
  const byId = playerMap(session);
  const merged = mergeStackQueues(session.courts.map(cloneCourt));
  const anchorId = stackAnchorCourtId({ courts: merged }, courtId);
  const court = merged.find((c) => c.id === anchorId);
  if (!court) return [];
  return (court.queue ?? [])
    .map((pid) => byId.get(pid))
    .filter((p): p is Player => p != null && !p.done);
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
    const ready = players.length === PLAYERS_PER_COURT;
    return {
      court: court.id,
      teamA: players.slice(0, 2),
      teamB: players.slice(2, 4),
      result: court.result,
      startedAt: ready ? court.startedAt : undefined,
      pausedAt: court.pausedAt,
      ready,
    };
  });
}

export function setMatchWinner(
  session: Session,
  courtId: number,
  winner: "A" | "B",
): Session {
  const court = session.courts.find((c) => c.id === courtId);
  if (!court || court.pausedAt != null) return session;
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
  const court = session.courts.find((c) => c.id === courtId);
  if (!court || court.pausedAt != null) return session;
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
  const active = players.filter((p) => !p.done);
  const maxGames = active.reduce((m, p) => Math.max(m, p.gamesPlayed), 0);
  const hasUnplayed = active.some((p) => p.gamesPlayed === 0);
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
  const hasUnplayed = players.some((p) => !p.done && p.gamesPlayed === 0);

  const returning =
    winnerSide !== "A" && winnerSide !== "B"
      ? [...finishedIds]
      : hasUnplayed
        ? [...losers, ...winners]
        : [...winners, ...losers];

  return [...ready, ...returning];
}

/**
 * Rotate one court: apply win/loss, restack THAT court's line, then fill
 * from the front of the same court. Other courts are untouched.
 */
export function rotateCourt(session: Session, courtId: number): Session {
  session = ensurePlayerNumbers(session);
  const court = session.courts.find((c) => c.id === courtId);
  if (!court || court.playerIds.length === 0 || court.pausedAt != null) {
    return session;
  }

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

  const courtPlaySeq = (court.playSeq ?? 0) + 1;
  const playSeq = (session.playSeq ?? 0) + 1;
  const finishedIds = [...court.playerIds];
  const byId = playerMap(session);
  const teamAIds = finishedIds.slice(0, 2);
  const teamBIds = finishedIds.slice(2, 4);
  const toSide = (ids: string[]) =>
    ids
      .map((pid) => byId.get(pid))
      .filter((p): p is Player => Boolean(p))
      .map((p) => ({ id: p.id, name: p.name, number: p.number }));

  const finishedAt = Date.now();
  const priorOnCourt = [...(session.matchHistory ?? [])]
    .reverse()
    .find((m) => m.court === court.id);
  const startedAt =
    typeof court.startedAt === "number"
      ? court.startedAt
      : typeof priorOnCourt?.finishedAt === "number"
        ? priorOnCourt.finishedAt
        : finishedAt;

  const historyEntry =
    winnerSide === "A" || winnerSide === "B"
      ? {
          id: id(),
          court: court.id,
          playSeq,
          startedAt,
          finishedAt,
          winner: winnerSide,
          scoreA: court.result?.scoreA,
          scoreB: court.result?.scoreB,
          teamA: toSide(teamAIds),
          teamB: toSide(teamBIds),
        }
      : null;

  const players = session.players.map((p) => {
    if (!finishedIds.includes(p.id)) return p;
    const won = winnerIds.has(p.id);
    const lost = loserIds.has(p.id);
    return {
      ...p,
      gamesPlayed: p.gamesPlayed + 1,
      wins: p.wins + (won ? 1 : 0),
      losses: p.losses + (lost ? 1 : 0),
      lastOutcome: won
        ? ("win" as const)
        : lost
          ? ("loss" as const)
          : p.lastOutcome,
      lastPlaySeq: courtPlaySeq,
      homeCourt: courtId,
    };
  });

  const sid = stackIdForCourt(courtId);
  const stacked = mergeStackQueues(session.courts.map(cloneCourt));
  const group = stacked.filter((c) => stackIdForCourt(c.id) === sid);
  const anchorId = Math.min(...group.map((c) => c.id));
  const sharedQueue = [
    ...(stacked.find((c) => c.id === anchorId)?.queue ?? []),
  ];
  const stackPlayerIds = new Set([
    ...finishedIds,
    ...sharedQueue,
    ...group.flatMap((c) => c.playerIds),
  ]);
  const courtPlayers = players.filter((p) => stackPlayerIds.has(p.id));
  const restacked = restackQueue(
    sharedQueue,
    finishedIds,
    courtPlayers,
    winnerSide,
  );

  const courts = stacked.map((c) => {
    if (stackIdForCourt(c.id) !== sid) return c;
    if (c.id === courtId) {
      return {
        ...c,
        playSeq: courtPlaySeq,
        playerIds: [],
        result: undefined,
        startedAt: undefined,
        queue: c.id === anchorId ? restacked : [],
      };
    }
    return {
      ...c,
      playSeq: Math.max(c.playSeq ?? 0, courtPlaySeq),
      queue: c.id === anchorId ? restacked : [],
    };
  });

  return fillCourts(
    {
      ...session,
      playSeq,
      players,
      courts,
      queue: [],
      matchHistory: historyEntry
        ? [...(session.matchHistory ?? []), historyEntry]
        : (session.matchHistory ?? []),
    },
    courtId,
  );
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
  const active = session.players.filter((p) => !p.done);
  const games = active.map((p) => p.gamesPlayed);
  const minGames = games.length ? Math.min(...games) : 0;
  const maxGames = games.length ? Math.max(...games) : 0;
  const playing = onCourtIds(session).size;
  const waiting = waitingPlayers(session).length

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

function splitGlobalQueueOntoCourts(session: Session): Session {
  const courts = session.courts.map((c) => ({
    ...c,
    playerIds: Array.isArray(c.playerIds) ? [...c.playerIds] : [],
    queue: Array.isArray(c.queue) ? [...c.queue] : [],
    playSeq: typeof c.playSeq === "number" ? c.playSeq : 0,
  }));
  const assigned = new Set(
    courts.flatMap((c) => [...c.playerIds, ...c.queue]),
  );
  const leftover = (session.queue ?? []).filter((pid) => !assigned.has(pid));
  leftover.forEach((pid) => {
    const player = session.players.find((p) => p.id === pid);
    const destId =
      player?.homeCourt != null && stackIdForCourt(player.homeCourt) !== 1
        ? stackAnchorCourtId({ courts }, player.homeCourt)
        : 1;
    const court = courts.find((c) => c.id === destId) ?? courts[0];
    court.queue.push(pid);
  });

  const unique = mergeStackQueues(exclusiveCourts(courts));
  const next: Session = {
    ...session,
    courts: unique,
    queue: [],
    players: session.players.map((p) => {
      const home = unique.find((c) =>
        c.playerIds.includes(p.id) || c.queue.includes(p.id),
      );
      return { ...p, homeCourt: home?.id ?? p.homeCourt };
    }),
  };
  return session.status === "ended" ? next : fillCourts(next);
}

/** Upgrade older flat-stack / shared-queue sessions into per-court stacks. */
export function migrateSessionShape(session: Session): Session {
  if (Array.isArray(session.courts) && Array.isArray(session.queue)) {
    return splitGlobalQueueOntoCourts(session);
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
      courts[i] = { ...courts[i], playerIds: slice };
    }
  }

  return splitGlobalQueueOntoCourts({
    ...legacy,
    players,
    queue,
    courts,
    playSeq: typeof legacy.playSeq === "number" ? legacy.playSeq : 0,
    undoStack: Array.isArray(legacy.undoStack) ? legacy.undoStack : [],
  });
}
