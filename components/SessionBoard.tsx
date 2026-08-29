"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Clock3,
  Layers3,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Undo2,
  UserPlus,
  X,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { PaddleStackMark } from "@/components/PaddleStackMark";
import { OnFireBurn } from "@/components/PaddleStackOnFire";
import {
  addPlayers,
  canUndo,
  decideAndRotate,
  donePlayers,
  dropPlayerOnPlayer,
  fillCourts,
  formatDuration,
  lightestCourtId,
  locatePlayer,
  markDonePlaying,
  movePlayerToCourt,
  parseNames,
  pauseCourt,
  playingMatches,
  populateStack,
  rejoinStack,
  removePlayer,
  renamePlayer,
  reorderQueue,
  restartToWaiting,
  resumeSession,
  rotateCourt,
  sessionStats,
  skipThisGame,
  setMatchScore,
  stackAnchorCourtId,
  stackCourtIds,
  stackIdForCourt,
  undoSession,
  unpauseCourt,
  updateSessionDetails,
  waitingPlayersOnCourt,
  withUndo,
} from "@/lib/rotation";
import { cn } from "@/lib/utils";
import {
  HOUR_OPTIONS,
  type Match,
  type PlayedMatch,
  type Player,
  type Session,
} from "@/lib/types";

type Props = {
  session: Session;
  onChange: (session: Session) => void;
  onLeave: () => void;
  onEnd: () => void;
};

function isLocalHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

const PLAYER_DROP = "drop-player:";
const COURT_DROP = "court:";

const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const overPlayer = pointerHits.filter((hit) =>
    String(hit.id).startsWith(PLAYER_DROP),
  );
  if (overPlayer.length > 0) return overPlayer;
  return pointerHits.filter((hit) => String(hit.id).startsWith(COURT_DROP));
};

const DragDisabledContext = createContext(false);

function PlayerDnd({
  disabled,
  players,
  onMoveToCourt,
  onSwap,
  children,
}: {
  disabled: boolean;
  players: Player[];
  onMoveToCourt: (playerId: string, courtId: number) => void;
  onSwap: (aId: string, bId: string) => void;
  children: ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const byId = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );
  const activePlayer = activeId ? byId.get(activeId) : undefined;

  function handleDragEnd(event: DragEndEvent) {
    const fromId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    setActiveId(null);
    if (disabled || !overId) return;
    if (overId.startsWith(PLAYER_DROP)) {
      const toId = overId.slice(PLAYER_DROP.length);
      if (toId && toId !== fromId) onSwap(fromId, toId);
      return;
    }
    if (overId.startsWith(COURT_DROP)) {
      const courtId = Number(overId.slice(COURT_DROP.length));
      if (Number.isInteger(courtId)) onMoveToCourt(fromId, courtId);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={(event) => setActiveId(String(event.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <DragDisabledContext.Provider value={disabled}>
        <div className={cn(activeId && "select-none")}>{children}</div>
        <DragOverlay
          dropAnimation={null}
          modifiers={[snapCenterToCursor]}
          zIndex={80}
        >
          {activePlayer ? <PlayerDragChip player={activePlayer} /> : null}
        </DragOverlay>
      </DragDisabledContext.Provider>
    </DndContext>
  );
}

function isOnFire(player: Player) {
  return player.gamesPlayed >= 4 && player.losses === 0;
}

function hasEightWins(player: Player) {
  return player.wins >= 8 && player.losses === 0;
}

function formatRecord(player: Pick<Player, "wins" | "losses">) {
  return `W${player.wins}-L${player.losses}`;
}

function PlayerDragChip({ player }: { player: Player }) {
  return (
    <div className="flex min-h-12 min-w-[10rem] items-center gap-2 rounded-xl border border-[#e8f5a0]/50 bg-[#163828] px-3 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.45)] ring-2 ring-[#f5d76e]">
      <PlayerAvatar player={player} highlight />
      <span className="truncate text-sm font-semibold text-[#f5d76e]">
        {player.name}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-[#f4f7f0]/55">
        {formatRecord(player)}
      </span>
    </div>
  );
}

export function SessionBoard({ session, onChange, onLeave, onEnd }: Props) {
  const [, setTick] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [addCourtId, setAddCourtId] = useState(1);
  const [name, setName] = useState("");
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<Player | null>(null);
  const [pendingRename, setPendingRename] = useState<Player | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [editHours, setEditHours] = useState(session.hours);
  const [showPopulate, setShowPopulate] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [tab, setTab] = useState<"board" | "history">("board");
  const ended = session.status === "ended";
  const stats = sessionStats(session);
  const matches = playingMatches(session);
  const done = donePlayers(session);
  const history = [...(session.matchHistory ?? [])].reverse();
  const renameLoc = pendingRename
    ? locatePlayer(session, pendingRename.id)
    : null;
  const renameWaiting =
    pendingRename != null && renameLoc?.where === "wait";
  const renameIsFront =
    renameWaiting &&
    renameLoc != null &&
    waitingPlayersOnCourt(session, renameLoc.courtId)[0]?.id ===
      pendingRename.id;

  useEffect(() => {
    setShowPopulate(isLocalHost());
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (session.status !== "active") return;
    const next = fillCourts(session);
    const before = session.courts
      .map((c) => `${c.id}:${c.playerIds.join(",")}:${(c.queue ?? []).join(",")}`)
      .join("|");
    const after = next.courts
      .map((c) => `${c.id}:${c.playerIds.join(",")}:${(c.queue ?? []).join(",")}`)
      .join("|");
    if (before !== after) onChange(next);
  }, [session.id]);

  function formatStartedAt(ts: number): string {
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(ts));
    } catch {
      return new Date(ts).toLocaleTimeString();
    }
  }

  function historyStartedAt(
    match: PlayedMatch,
    index: number,
  ): number | undefined {
    if (typeof match.startedAt === "number") return match.startedAt;
    for (let i = index + 1; i < history.length; i++) {
      const older = history[i];
      if (older && older.court === match.court) return older.finishedAt;
    }
    return session.startedAt;
  }

  function commit(next: Session, recordUndo = false) {
    onChange(recordUndo ? withUndo(session, next) : next);
  }

  function handleUndo() {
    const previous = undoSession(session);
    if (previous) onChange(previous);
  }

  function handleAddOne(e: FormEvent) {
    e.preventDefault();
    const names = parseNames(name);
    if (names.length === 0) return;
    commit(addPlayers(session, names, addCourtId), true);
    setName("");
    setAddOpen(false);
  }

  function handleAddBulk(e: FormEvent) {
    e.preventDefault();
    const names = parseNames(bulk);
    if (names.length === 0) return;
    commit(addPlayers(session, names, addCourtId), true);
    setBulk("");
    setShowBulk(false);
    setAddOpen(false);
  }

  function handlePopulate() {
    commit(populateStack(session), true);
    setAddOpen(false);
  }

  function confirmDonePlaying() {
    if (!pendingRemove) return;
    commit(markDonePlaying(session, pendingRemove.id), true);
    setPendingRemove(null);
  }

  function confirmRemoveForever() {
    if (!pendingRemove) return;
    commit(removePlayer(session, pendingRemove.id), true);
    setPendingRemove(null);
  }

  function openRename(player: Player) {
    setPendingRename(player);
    setRenameValue(player.name);
  }

  function saveRename(e: FormEvent) {
    e.preventDefault();
    if (!pendingRename) return;
    const next = renameValue.trim();
    if (!next || next === pendingRename.name) {
      setPendingRename(null);
      return;
    }
    commit(renamePlayer(session, pendingRename.id, next), true);
    setPendingRename(null);
  }

  function openEdit() {
    setEditTitle(session.title);
    setEditHours(session.hours);
    setEditOpen(true);
  }

  function saveEdit(e: FormEvent) {
    e.preventDefault();
    commit(
      updateSessionDetails(session, { title: editTitle, hours: editHours }),
      true,
    );
    setEditOpen(false);
  }

  return (
    <motion.div
      className="relative z-10 grid gap-4 pb-8"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <header className="grid gap-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 sm:gap-2">
          <button
            type="button"
            className="inline-flex min-h-10 min-w-0 -ml-1 w-fit max-w-full items-center gap-1 rounded-lg px-1.5 text-sm text-[#f4f7f0]/60 hover:text-[#f4f7f0] sm:-ml-2 sm:px-2"
            onClick={onLeave}
          >
            Home
          </button>
          <PaddleStackMark className="h-8 w-8 sm:h-10 sm:w-10" />
          <button
            type="button"
            disabled={ended || !canUndo(session)}
            onClick={handleUndo}
            className="inline-flex min-h-10 w-fit items-center justify-self-end gap-1 rounded-lg px-1.5 text-sm text-[#f4f7f0]/60 hover:text-[#f4f7f0] disabled:opacity-40 sm:px-2"
          >
            <Undo2 className="size-4" />
            <span className="hidden sm:inline">Undo</span>
          </button>
        </div>
        <div className="min-w-0">
          <p className="font-display truncate text-[1.65rem] leading-none tracking-wide text-[#e8f5a0] sm:text-3xl">
            {session.title}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-sm text-[#f4f7f0]/65 sm:gap-x-3">
            <button
              type="button"
              disabled={ended}
              onClick={openEdit}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#e8f5a0]/25 px-2.5 text-sm font-semibold text-[#e8f5a0] hover:border-[#e8f5a0]/50 disabled:opacity-40"
            >
              Courts
              <span className="font-display tabular-nums">
                {session.courtCount}
              </span>
            </button>
            <span>
              · {session.players.length} stacked
              {ended ? " · ended" : ""}
            </span>
            {!ended ? (
              <span className="inline-flex items-center gap-1 text-[#e8f5a0]/80">
                <Clock3 className="size-3.5" />
                {formatDuration(stats.remainingMs)} left
              </span>
            ) : (
              <button
                type="button"
                className="text-sm font-semibold text-[#f5d76e]"
                onClick={() => commit(resumeSession(session), true)}
              >
                Resume
              </button>
            )}
            <button
              type="button"
              disabled={ended}
              onClick={() => {
                setAddCourtId(lightestCourtId(session));
                setAddOpen(true);
              }}
              className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-xl bg-[#f5d76e] px-3 text-sm font-semibold text-[#122418] disabled:opacity-50"
            >
              <UserPlus className="size-4" />
              Add
            </button>
          </div>
        </div>
      </header>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl tracking-wide text-[var(--line)] uppercase">
              Edit session
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Change the title or session length. ID stays {session.id}.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={saveEdit}>
            <div className="grid gap-2">
              <Label htmlFor="edit-title" className="text-[var(--line)]">
                Title
              </Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="h-12 border-[var(--border)] bg-[var(--panel-raised)] text-base"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-hours" className="text-[var(--line)]">
                Hours
              </Label>
              <Select
                value={editHours}
                onValueChange={(value) => {
                  if (value != null) setEditHours(Number(value));
                }}
              >
                <SelectTrigger
                  id="edit-hours"
                  className="h-12 w-full border-[var(--border)] bg-[var(--panel-raised)] text-base"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  className="max-h-72 border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)]"
                >
                  {HOUR_OPTIONS.map((n) => (
                    <SelectItem
                      key={n}
                      value={n}
                      className="focus:bg-[var(--accent)] focus:text-[var(--accent-foreground)]"
                    >
                      {n === 1 ? "1 hour" : `${n} hours`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              className="font-display h-12 tracking-wide uppercase"
            >
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setName("");
            setBulk("");
            setShowBulk(false);
          }
        }}
      >
        <DialogContent className="border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl tracking-wide text-[var(--line)] uppercase">
              Add player
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {showPopulate
                ? "Add to Court 1, or to the Courts 2–3 stack."
                : "Add a paddle to Court 1 or the Courts 2–3 stack."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            {session.courts.length > 1 ? (
              <div className="grid gap-2">
                <Label htmlFor="add-court" className="text-[var(--line)]">
                  Court
                </Label>
                <Select
                  value={addCourtId}
                  onValueChange={(value) => {
                    if (value != null) setAddCourtId(Number(value));
                  }}
                >
                  <SelectTrigger
                    id="add-court"
                    className="h-12 w-full border-[var(--border)] bg-[var(--panel-raised)] text-base"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    className="max-h-72 border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)]"
                  >
                    {session.courts
                      .filter(
                        (court) =>
                          stackAnchorCourtId(session, court.id) === court.id,
                      )
                      .map((court) => {
                        const ids = stackCourtIds(session, court.id);
                        return (
                          <SelectItem
                            key={court.id}
                            value={court.id}
                            className="focus:bg-[var(--accent)] focus:text-[var(--accent-foreground)]"
                          >
                            {ids.length > 1
                              ? `Courts ${ids.join("–")}`
                              : `Court ${court.id}`}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <form
              onSubmit={handleAddOne}
              className="grid grid-cols-[1fr_auto] gap-2"
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Player name"
                enterKeyHint="done"
                autoComplete="off"
                autoCorrect="off"
                autoFocus
                className="h-12 border-[var(--border)] bg-[var(--panel-raised)] text-base"
              />
              <Button
                type="submit"
                disabled={!name.trim()}
                className="font-display h-12 min-w-20 tracking-wide uppercase"
              >
                Add
              </Button>
            </form>

            {showPopulate ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="font-display h-11 tracking-wide uppercase border-[var(--border)] bg-transparent text-foreground hover:bg-muted"
                  onClick={handlePopulate}
                >
                  <Sparkles data-icon="inline-start" />
                  Populate
                </Button>
                <button
                  type="button"
                  className="min-h-11 text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                  onClick={() => setShowBulk((v) => !v)}
                >
                  {showBulk ? "Hide list" : "Paste a list"}
                </button>
              </div>
            ) : null}

            <AnimatePresence>
              {showPopulate && showBulk && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid gap-2 overflow-hidden"
                  onSubmit={handleAddBulk}
                >
                  <Textarea
                    value={bulk}
                    onChange={(e) => setBulk(e.target.value)}
                    placeholder={"Alex\nJordan\nSam\nRiley"}
                    rows={4}
                    spellCheck={false}
                    className="border-[var(--border)] bg-[var(--panel-raised)] text-base"
                  />
                  <Button
                    type="submit"
                    disabled={parseNames(bulk).length === 0}
                    className="font-display h-12 tracking-wide uppercase"
                  >
                    Add {parseNames(bulk).length || ""} to court {addCourtId}
                  </Button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>

      <div
        role="tablist"
        aria-label="Session views"
        className="grid grid-cols-2 gap-1 rounded-xl border border-[#e8f5a0]/20 bg-[#122418] p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "board"}
          onClick={() => setTab("board")}
          className={cn(
            "min-h-10 rounded-lg text-sm font-semibold transition",
            tab === "board"
              ? "bg-[#f5d76e] text-[#122418]"
              : "text-[#f4f7f0]/60 hover:text-[#f4f7f0]",
          )}
        >
          Board
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          onClick={() => setTab("history")}
          className={cn(
            "min-h-10 rounded-lg text-sm font-semibold transition",
            tab === "history"
              ? "bg-[#f5d76e] text-[#122418]"
              : "text-[#f4f7f0]/60 hover:text-[#f4f7f0]",
          )}
        >
          Matches{history.length > 0 ? ` · ${history.length}` : ""}
        </button>
      </div>

      {tab === "board" ? (
        <>
      {!ended && session.courts.length > 1 ? (
        <p className="text-[11px] text-[#f4f7f0]/45">
          Court 1 has its own stack. Courts 2 and 3 share one line — the next
          four go to whichever of those courts is open.
        </p>
      ) : null}

      <PlayerDnd
        disabled={ended}
        players={session.players}
        onMoveToCourt={(playerId, courtId) =>
          commit(movePlayerToCourt(session, playerId, courtId), true)
        }
        onSwap={(aId, bId) => commit(dropPlayerOnPlayer(session, aId, bId), true)}
      >
        <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
          {matches
            .filter((match) => stackIdForCourt(match.court) === 1)
            .map((match) => {
              const courtWaiting = waitingPlayersOnCourt(session, match.court);
              return (
                <DropCourtCard key={match.court} courtId={match.court}>
                  <CardHeader className="gap-1 px-4 pt-4 pb-2">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[#e8f5a0]/70 uppercase">
                      Court {match.court}
                    </CardTitle>
                    <CardDescription className="text-[#f4f7f0]/55">
                      {match.ready ? "Playing" : "Need 4 to start"} ·{" "}
                      {courtWaiting.length} waiting on this stack
                    </CardDescription>
                  </CardHeader>
                  <Separator className="bg-[#e8f5a0]/15" />
                  <CardContent className="grid gap-3 px-3 pt-3 pb-3">
                    <MatchCard
                      match={match}
                      waitingCount={courtWaiting.length}
                      disabled={ended || match.pausedAt != null}
                      frozenNow={match.pausedAt}
                      startedAtLabel={
                        match.startedAt
                          ? formatStartedAt(match.startedAt)
                          : undefined
                      }
                      onPause={
                        ended
                          ? undefined
                          : () =>
                              commit(
                                match.pausedAt != null
                                  ? unpauseCourt(session, match.court)
                                  : pauseCourt(session, match.court),
                                true,
                              )
                      }
                      onRemove={setPendingRemove}
                      onRename={openRename}
                      onWinner={(winner) =>
                        commit(
                          decideAndRotate(session, match.court, winner),
                          true,
                        )
                      }
                      onScore={(side, raw) =>
                        commit(setMatchScore(session, match.court, side, raw))
                      }
                      onRotate={() =>
                        commit(rotateCourt(session, match.court), true)
                      }
                    />
                    <div className="grid gap-2">
                      <p className="flex items-center gap-1.5 px-1 text-[11px] font-semibold tracking-wide text-[#e8f5a0]/70 uppercase">
                        <Layers3 className="size-3.5" />
                        This court · {courtWaiting.length}
                      </p>
                      {!ended && courtWaiting.length > 1 ? (
                        <p className="px-1 text-[11px] text-[#f4f7f0]/45">
                          Drag to reorder, or use the arrows.
                        </p>
                      ) : null}
                      <PlayerList
                        players={courtWaiting}
                        empty="No one waiting on this court."
                        compact
                        canReorder={!ended}
                        onMove={(player, to) =>
                          commit(reorderQueue(session, player.id, to), true)
                        }
                        onRemove={setPendingRemove}
                        onRename={openRename}
                      />
                    </div>
                    {!ended ? (
                      <CourtAddForm
                        courtId={match.court}
                        onAdd={(names, courtId) =>
                          commit(addPlayers(session, names, courtId), true)
                        }
                      />
                    ) : null}
                  </CardContent>
                </DropCourtCard>
              );
            })}
          {(() => {
            const rec = matches.filter((m) => stackIdForCourt(m.court) === 2);
            if (rec.length === 0) return null;
            const anchorId = stackAnchorCourtId(session, rec[0].court);
            const courtWaiting = waitingPlayersOnCourt(session, anchorId);
            const ids = stackCourtIds(session, rec[0].court);
            const title =
              ids.length > 1 ? `Courts ${ids.join("–")}` : `Court ${ids[0]}`;
            const onCourt = rec.reduce(
              (n, m) => n + m.teamA.length + m.teamB.length,
              0,
            );
            return (
              <DropCourtCard key={`stack-${anchorId}`} courtId={anchorId}>
                <CardHeader className="gap-1 px-4 pt-4 pb-2">
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[#e8f5a0]/70 uppercase">
                    {title}
                  </CardTitle>
                  <CardDescription className="text-[#f4f7f0]/55">
                    {onCourt > 0 ? `${onCourt} on court` : "Need 4 to start"} ·{" "}
                    {courtWaiting.length} waiting
                  </CardDescription>
                </CardHeader>
                <Separator className="bg-[#e8f5a0]/15" />
                <CardContent className="grid gap-3 px-3 pt-3 pb-3">
                  <div
                    className={cn(
                      "grid gap-3",
                      rec.length > 1 && "sm:grid-cols-2",
                    )}
                  >
                    {rec.map((match) => (
                      <MatchCard
                        key={match.court}
                        match={match}
                        waitingCount={courtWaiting.length}
                        disabled={ended || match.pausedAt != null}
                        frozenNow={match.pausedAt}
                        startedAtLabel={
                          match.startedAt
                            ? formatStartedAt(match.startedAt)
                            : undefined
                        }
                        onPause={
                          ended
                            ? undefined
                            : () =>
                                commit(
                                  match.pausedAt != null
                                    ? unpauseCourt(session, match.court)
                                    : pauseCourt(session, match.court),
                                  true,
                                )
                        }
                        onRemove={setPendingRemove}
                        onRename={openRename}
                        onWinner={(winner) =>
                          commit(
                            decideAndRotate(session, match.court, winner),
                            true,
                          )
                        }
                        onScore={(side, raw) =>
                          commit(setMatchScore(session, match.court, side, raw))
                        }
                        onRotate={() =>
                          commit(rotateCourt(session, match.court), true)
                        }
                      />
                    ))}
                  </div>
                  <div className="grid gap-2">
                    <p className="flex items-center gap-1.5 px-1 text-[11px] font-semibold tracking-wide text-[#e8f5a0]/70 uppercase">
                      <Layers3 className="size-3.5" />
                      This stack · {courtWaiting.length}
                    </p>
                    {!ended && courtWaiting.length > 1 ? (
                      <p className="px-1 text-[11px] text-[#f4f7f0]/45">
                        Drag to reorder, or use the arrows.
                      </p>
                    ) : null}
                    <PlayerList
                      players={courtWaiting}
                      empty="No one waiting on this stack."
                      compact
                      canReorder={!ended}
                      onMove={(player, to) =>
                        commit(reorderQueue(session, player.id, to), true)
                      }
                      onRemove={setPendingRemove}
                      onRename={openRename}
                    />
                  </div>
                  {!ended ? (
                    <CourtAddForm
                      courtId={anchorId}
                      placeholder={`Add to courts ${ids.join("–")}`}
                      onAdd={(names, courtId) =>
                        commit(addPlayers(session, names, courtId), true)
                      }
                    />
                  ) : null}
                </CardContent>
              </DropCourtCard>
            );
          })()}
        </div>
      </PlayerDnd>

      {done.length > 0 ? (
        <Card className="rounded-xl border border-[#e8f5a0]/25 bg-[#163828] text-[#f4f7f0] shadow-none ring-0">
          <CardHeader className="gap-1 px-4 pt-4 pb-2">
            <CardTitle className="text-xs font-semibold tracking-wide text-[#e8f5a0]/70 uppercase">
              Done · {done.length}
            </CardTitle>
          </CardHeader>
          <Separator className="bg-[#e8f5a0]/15" />
          <CardContent className="px-3 pt-3 pb-3">
            <ol className="grid max-h-[min(35vh,280px)] gap-1.5 overflow-auto overscroll-contain">
              {done.map((p) => (
                <li
                  key={p.id}
                  className="flex min-h-11 items-center gap-2 overflow-visible rounded-xl bg-[#1c4532] px-2.5 py-2 opacity-80 sm:min-h-12 sm:px-3"
                >
                  <PlayerAvatar player={p} size="sm" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[#f4f7f0]"
                    onClick={() => openRename(p)}
                  >
                    {p.name}
                  </button>
                  <span
                    className="shrink-0 text-xs tabular-nums text-[#f4f7f0]/55"
                    title={`${p.wins} wins · ${p.losses} losses · ${p.gamesPlayed} games`}
                  >
                    {formatRecord(p)}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-[#e8f5a0]/30 px-2.5 py-1.5 text-xs font-semibold text-[#f4f7f0]"
                    onClick={() => commit(rejoinStack(session, p.id), true)}
                  >
                    Rejoin
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name} forever`}
                    className="flex size-9 shrink-0 items-center justify-center text-[#f4f7f0]/45 hover:text-[#ff6b4a]"
                    onClick={() => setPendingRemove(p)}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {!ended ? (
        <div className="grid gap-2">
          <button
            type="button"
            className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-[#e8f5a0]/30 text-sm font-semibold text-[#e8f5a0]"
            onClick={() => setRestartOpen(true)}
          >
            <RotateCcw className="size-4" />
            Restart · all waiting
          </button>
          <button
            type="button"
            className="min-h-12 w-full rounded-xl border border-[#f4f7f0]/20 text-sm font-semibold text-[#f4f7f0]/65"
            onClick={() => setEndOpen(true)}
          >
            End session
          </button>
        </div>
      ) : null}
        </>
      ) : (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#e8f5a0]/70">
            Matches · {history.length}
          </h2>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-[#f4f7f0]/60">
              Finished games show up here after you tap A wins or B wins.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {history.map((m, i) => {
                const score =
                  m.scoreA != null || m.scoreB != null
                    ? `${m.scoreA ?? "-"}-${m.scoreB ?? "-"}`
                    : null;
                const startedAt = historyStartedAt(m, i);
                const finishedLabel = formatStartedAt(m.finishedAt);
                const startedLabel =
                  startedAt != null ? formatStartedAt(startedAt) : null;
                const durationMs =
                  startedAt != null && m.finishedAt >= startedAt
                    ? m.finishedAt - startedAt
                    : null;
                return (
                  <li
                    key={m.id}
                    className="rounded-xl border border-[#e8f5a0]/20 bg-[#163828] px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#e8f5a0]/70">
                        Court {m.court} · Game {m.playSeq}
                      </p>
                      {score ? (
                        <p className="font-display text-sm tabular-nums text-[#f5d76e]">
                          {score}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#f4f7f0]/50">
                      {startedLabel ? (
                        <span>
                          {startedLabel} to {finishedLabel}
                        </span>
                      ) : (
                        <span>Ended {finishedLabel}</span>
                      )}
                      {durationMs != null ? (
                        <span className="inline-flex items-center gap-1 tabular-nums text-[#e8f5a0]/75">
                          <Clock3 className="size-3" />
                          {formatPlayClock(durationMs)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                      <div
                        className={cn(
                          "min-w-0 text-right",
                          m.winner === "A"
                            ? "text-[#f5d76e]"
                            : "text-[#f4f7f0]/75",
                        )}
                      >
                        {m.teamA.map((p) => (
                          <p key={p.id} className="break-words">
                            #{p.number} {p.name}
                          </p>
                        ))}
                      </div>
                      <span className="font-display text-xs font-bold text-[#ff8a3d]">
                        VS
                      </span>
                      <div
                        className={cn(
                          "min-w-0 text-left",
                          m.winner === "B"
                            ? "text-[#f5d76e]"
                            : "text-[#f4f7f0]/75",
                        )}
                      >
                        {m.teamB.map((p) => (
                          <p key={p.id} className="break-words">
                            #{p.number} {p.name}
                          </p>
                        ))}
                      </div>
                    </div>
                    <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[#e8f5a0]/55">
                      {m.winner === "A" ? "A wins" : "B wins"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <AlertDialog open={restartOpen} onOpenChange={setRestartOpen}>
        <AlertDialogContent className="border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-wide uppercase">
              Restart?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Pull everyone off court and put them in the waiting line. W-L
              stays. Hit Play on a court to send the next four out.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-[var(--border)] bg-transparent">
            <AlertDialogCancel className="border-[var(--border)] bg-transparent text-foreground">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="font-display tracking-wide uppercase"
              onClick={() => {
                commit(restartToWaiting(session), true);
                setRestartOpen(false);
              }}
            >
              Restart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={endOpen} onOpenChange={setEndOpen}>
        <AlertDialogContent className="border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-wide uppercase">
              End session?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Clear courts and mark everyone done. Stats stay on this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-[var(--border)] bg-transparent">
            <AlertDialogCancel className="border-[var(--border)] bg-transparent text-foreground">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="font-display tracking-wide uppercase"
              onClick={onEnd}
            >
              End session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingRemove != null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
      >
        <AlertDialogContent className="border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-wide uppercase">
              {pendingRemove?.done ? "Remove forever?" : "Done playing?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {pendingRemove?.done ? (
                <>
                  Delete {pendingRemove?.name} from this session entirely,
                  including their W-L.
                </>
              ) : (
                <>
                  Mark {pendingRemove?.name} done for today? They leave this
                  court's stack, but keep their paddle # and W-L.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 border-[var(--border)] bg-transparent sm:flex-col">
            <AlertDialogCancel className="border-[var(--border)] bg-transparent text-foreground sm:w-full">
              Cancel
            </AlertDialogCancel>
            {pendingRemove?.done ? (
              <AlertDialogAction
                variant="destructive"
                className="font-display tracking-wide uppercase sm:w-full"
                onClick={confirmRemoveForever}
              >
                Remove forever
              </AlertDialogAction>
            ) : (
              <>
                <AlertDialogAction
                  className="font-display tracking-wide uppercase sm:w-full"
                  onClick={confirmDonePlaying}
                >
                  Done playing
                </AlertDialogAction>
                <AlertDialogAction
                  variant="destructive"
                  className="font-display tracking-wide uppercase sm:w-full"
                  onClick={confirmRemoveForever}
                >
                  Remove forever
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={pendingRename != null}
        onOpenChange={(open) => {
          if (!open) setPendingRename(null);
        }}
      >
        <DialogContent className="border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wide uppercase">
              Rename player
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Update the name on this court's stack.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={saveRename}>
            <div className="grid gap-2">
              <Label htmlFor="rename-player">Name</Label>
              <Input
                id="rename-player"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="h-12 border-[var(--border)] bg-[var(--panel-raised)]"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="font-display h-12 tracking-wide uppercase"
              disabled={!renameValue.trim()}
            >
              Save name
            </Button>
            {pendingRename && !pendingRename.done && !ended ? (
              <>
                {renameWaiting ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="font-display h-12 tracking-wide uppercase"
                      disabled={renameIsFront}
                      onClick={() => {
                        if (!pendingRename) return;
                        commit(
                          reorderQueue(session, pendingRename.id, "front"),
                          true,
                        );
                        setPendingRename(null);
                      }}
                    >
                      <ChevronsUp className="size-4" />
                      Play next
                    </Button>
                    <p className="-mt-1 text-center text-xs text-muted-foreground">
                      Move to the front of this stack’s waiting line.
                    </p>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="font-display h-12 tracking-wide uppercase"
                  onClick={() => {
                    commit(skipThisGame(session, pendingRename.id), true);
                    setPendingRename(null);
                  }}
                >
                  Skip this game
                </Button>
                <p className="-mt-1 text-center text-xs text-muted-foreground">
                  Sit out this round. They go to the end of the waiting line.
                </p>
              </>
            ) : null}
          </form>
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}

function DropCourtCard({
  courtId,
  children,
}: {
  courtId: number;
  children: ReactNode;
}) {
  const dragDisabled = useContext(DragDisabledContext);
  const { setNodeRef, isOver } = useDroppable({
    id: `${COURT_DROP}${courtId}`,
    disabled: dragDisabled,
    data: { type: "court", courtId },
  });

  return (
    <div ref={setNodeRef} className="flex h-full min-w-0 flex-col">
      <Card
        className={cn(
          "flex h-full flex-col overflow-visible rounded-xl border border-[#e8f5a0]/25 bg-[#163828] text-[#f4f7f0] shadow-none ring-0 transition",
          isOver && "border-[#e8f5a0]/60 ring-2 ring-[#e8f5a0]/70 bg-[#1c4532]",
        )}
      >
        {children}
      </Card>
    </div>
  );
}

function CourtAddForm({
  courtId,
  placeholder,
  onAdd,
}: {
  courtId: number;
  placeholder?: string;
  onAdd: (names: string[], courtId: number) => void;
}) {
  const [name, setName] = useState("");

  return (
    <form
      className="grid grid-cols-[1fr_auto] gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const names = parseNames(name);
        if (names.length === 0) return;
        onAdd(names, courtId);
        setName("");
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder ?? `Add to court ${courtId}`}
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        className="min-h-12 min-w-0 rounded-xl border border-[#e8f5a0]/30 bg-[#1c4532] px-3 text-sm text-[#f4f7f0] outline-none placeholder:text-[#f4f7f0]/40 focus:border-[#f5d76e]"
      />
      <Button
        type="submit"
        disabled={!name.trim()}
        className="inline-flex min-h-12 shrink-0 items-center rounded-xl bg-[#f5d76e] px-3 text-sm font-semibold text-[#122418] disabled:opacity-50"
      >
        Add
      </Button>
    </form>
  );
}

function formatPlayClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function MatchCard({
  match,
  waitingCount = 0,
  startedAtLabel,
  disabled = false,
  frozenNow,
  onPause,
  onRemove,
  onRename,
  onWinner,
  onScore,
  onRotate,
}: {
  match: Match;
  waitingCount?: number;
  startedAtLabel?: string;
  disabled?: boolean;
  frozenNow?: number;
  onPause?: () => void;
  onRemove: (player: Player) => void;
  onRename: (player: Player) => void;
  onWinner: (winner: "A" | "B") => void;
  onScore: (side: "A" | "B", raw: string) => void;
  onRotate: () => void;
}) {
  const scoreA = match.result?.scoreA;
  const scoreB = match.result?.scoreB;
  const hasScore = scoreA !== undefined || scoreB !== undefined;
  const [showScore, setShowScore] = useState(hasScore);
  const [now, setNow] = useState(() => Date.now());
  const [resolving, setResolving] = useState<"A" | "B" | null>(null);
  const resolveTimer = useRef<number | null>(null);
  const lineupKey = [...match.teamA, ...match.teamB].map((p) => p.id).join("|");

  useEffect(() => {
    if (!match.startedAt || !match.ready || frozenNow != null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [match.startedAt, match.ready, frozenNow]);

  useEffect(() => {
    setResolving(null);
  }, [lineupKey]);

  useEffect(() => {
    return () => {
      if (resolveTimer.current != null) {
        window.clearTimeout(resolveTimer.current);
      }
    };
  }, []);

  const clockNow = frozenNow ?? now;
  const playMs =
    match.startedAt && match.ready ? Math.max(0, clockNow - match.startedAt) : 0;
  const winner = resolving ?? match.result?.winner;
  const { active } = useDndContext();
  const busy = disabled || resolving != null || active != null;
  const canDecide = match.ready && !busy;

  function handleWinner(side: "A" | "B") {
    if (!canDecide) return;
    setResolving(side);
    if (resolveTimer.current != null) {
      window.clearTimeout(resolveTimer.current);
    }
    resolveTimer.current = window.setTimeout(() => {
      resolveTimer.current = null;
      onWinner(side);
    }, 520);
  }

  return (
    <motion.div
      layout
      className={cn(
        "relative min-w-0 overflow-visible rounded-xl border bg-[#163828] px-2.5 py-3 sm:px-4 sm:py-4",
        match.pausedAt != null
          ? "border-[#f5d76e]/55"
          : "border-[#e8f5a0]/25",
      )}
      animate={
        resolving
          ? {
              scale: [1, 1.015, 1],
              outlineColor: [
                "color-mix(in oklab, var(--primary) 25%, transparent)",
                "color-mix(in oklab, var(--primary) 70%, transparent)",
                "color-mix(in oklab, var(--primary) 25%, transparent)",
              ],
            }
          : { scale: 1 }
      }
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#f5d76e]">
            Court {match.court}
            {match.pausedAt != null ? " · paused" : ""}
          </p>
          {startedAtLabel ? (
            <p className="mt-0.5 text-[11px] text-[#f4f7f0]/50">
              Started at {startedAtLabel}
            </p>
          ) : !match.ready ? (
            <p className="mt-0.5 text-[11px] text-[#f4f7f0]/50">
              Drop players here · need {Math.max(0, 4 - match.teamA.length - match.teamB.length)} more
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {match.startedAt ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#f5d76e]/35 bg-[#f5d76e]/15 px-1.5 py-1 font-display text-xs tabular-nums text-[#f5d76e] sm:px-2 sm:text-sm">
              <Clock3 className="size-3.5" />
              {formatPlayClock(playMs)}
            </span>
          ) : null}
          {onPause ? (
            <button
              type="button"
              onClick={onPause}
              className={cn(
                "inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold",
                match.pausedAt != null
                  ? "bg-[#f5d76e] text-[#122418]"
                  : "border border-[#e8f5a0]/40 text-[#e8f5a0] hover:border-[#e8f5a0]/70",
              )}
            >
              {match.pausedAt != null ? (
                <>
                  <Play className="size-3.5" />
                  Play
                </>
              ) : (
                <>
                  <Pause className="size-3.5" />
                  Pause
                </>
              )}
            </button>
          ) : null}
          {hasScore && (
            <Badge className="border-primary/40 bg-primary/20 text-primary">
              {scoreA ?? "-"}-{scoreB ?? "-"}
            </Badge>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={lineupKey || `court-${match.court}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24, scale: 0.97 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 sm:gap-2"
        >
          <TeamSide
            players={match.teamA}
            onRemove={onRemove}
            onRename={onRename}
            align="end"
            outcome={
              winner === "A" ? "win" : winner === "B" ? "lose" : undefined
            }
            celebrate={resolving === "A"}
          />
          <motion.span
            className="font-display text-base font-bold text-[#ff8a3d]"
            animate={
              resolving
                ? { scale: [1, 1.2, 1], rotate: [0, -6, 6, 0] }
                : { scale: 1, rotate: 0 }
            }
            transition={{ duration: 0.4 }}
          >
            VS
          </motion.span>
          <TeamSide
            players={match.teamB}
            onRemove={onRemove}
            onRename={onRename}
            align="start"
            outcome={
              winner === "B" ? "win" : winner === "A" ? "lose" : undefined
            }
            celebrate={resolving === "B"}
          />
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {resolving ? (
          <motion.p
            key="resolving"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="mt-2 text-center text-xs font-semibold uppercase tracking-wide text-[#f5d76e]"
          >
            {resolving === "A" ? "A wins" : "B wins"}
            {waitingCount > 0 ? ". Next group up." : "."}
          </motion.p>
        ) : null}
      </AnimatePresence>

      {!showScore ? (
        <button
          type="button"
          className="mt-3 w-full py-1.5 text-center text-xs text-[#f4f7f0]/55 underline-offset-2 hover:text-[#f5d76e] hover:underline disabled:opacity-40"
          onClick={() => setShowScore(true)}
          disabled={busy || !match.ready}
        >
          Add score (optional)
        </button>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-[#e8f5a0]/30 px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Score · optional</p>
            {!hasScore && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowScore(false)}
              >
                Hide
              </button>
            )}
          </div>
          <div className="flex items-center justify-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              placeholder="0"
              value={scoreA ?? ""}
              onChange={(e) => onScore("A", e.target.value)}
              className="h-11 w-16 border-[var(--border)] bg-[var(--panel-raised)] text-center text-base tabular-nums"
              aria-label="Left team score"
              disabled={busy}
            />
            <span className="font-display text-sm font-bold text-muted-foreground">
              -
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              placeholder="0"
              value={scoreB ?? ""}
              onChange={(e) => onScore("B", e.target.value)}
              className="h-11 w-16 border-[var(--border)] bg-[var(--panel-raised)] text-center text-base tabular-nums"
              aria-label="Right team score"
              disabled={busy}
            />
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <motion.button
          type="button"
          disabled={!canDecide || match.teamA.length === 0}
          whileTap={!canDecide ? undefined : { scale: 0.96 }}
          onClick={() => handleWinner("A")}
          className={cn(
            "min-h-12 rounded-xl bg-[#f5d76e] px-3 text-sm font-semibold text-[#122418] touch-manipulation disabled:opacity-50",
            resolving === "A" && "ring-2 ring-[#e8f5a0]",
          )}
        >
          A wins
        </motion.button>
        <motion.button
          type="button"
          disabled={!canDecide || match.teamB.length === 0}
          whileTap={!canDecide ? undefined : { scale: 0.96 }}
          onClick={() => handleWinner("B")}
          className={cn(
            "min-h-12 rounded-xl bg-[#f5d76e] px-3 text-sm font-semibold text-[#122418] touch-manipulation disabled:opacity-50",
            resolving === "B" && "ring-2 ring-[#e8f5a0]",
          )}
        >
          B wins
        </motion.button>
      </div>

      <button
        type="button"
        className="mt-2 min-h-11 w-full rounded-xl border border-[#e8f5a0]/30 text-sm font-semibold text-[#f4f7f0] disabled:opacity-50"
        disabled={!canDecide}
        onClick={onRotate}
      >
        Rotate court (no winner)
      </button>
    </motion.div>
  );
}

function PlayerAvatar({
  player,
  number,
  size = "md",
  highlight = false,
  className,
}: {
  player?: Player;
  number?: number;
  size?: "sm" | "md";
  highlight?: boolean;
  className?: string;
}) {
  const paddle = number ?? player?.number ?? 0;
  const onFire = player ? isOnFire(player) : false;
  const eightWins = player ? hasEightWins(player) : false;
  const burning = onFire || eightWins;
  const dim =
    size === "sm"
      ? "size-7 text-[11px] sm:size-8 sm:text-xs"
      : "size-8 text-xs sm:size-10 sm:text-sm";

  return (
    <span
      className={cn("relative inline-flex shrink-0 overflow-visible", className)}
      title={
        eightWins
          ? "On fire — 8+ wins"
          : onFire
            ? "On fire — undefeated after 4+ games"
            : undefined
      }
    >
      {burning ? (
        <OnFireBurn size={size} tone={eightWins ? "blue" : "orange"} />
      ) : null}
      <span
        aria-hidden
        className={cn(
          "relative z-[1] inline-flex items-center justify-center rounded-full font-display font-bold tabular-nums ring-2",
          dim,
          eightWins
            ? "bg-gradient-to-b from-[#7ec8ff] to-[#2f6fed] text-[#071428] ring-[#5aa8ff]/95"
            : onFire
              ? "bg-gradient-to-b from-[#ffb347] to-[#ff6a1a] text-[#1a0c04] ring-[#ff8a3d]/90"
              : highlight
                ? "bg-[#f5d76e] text-[#122418] ring-[#e8f5a0]/80"
                : "bg-[#1c4532] text-[#f5d76e] ring-[#e8f5a0]/35",
        )}
      >
        {paddle}
      </span>
    </span>
  );
}

function TeamSide({
  players,
  onRemove,
  onRename,
  align,
  outcome,
  celebrate,
}: {
  players: Player[];
  onRemove: (player: Player) => void;
  onRename: (player: Player) => void;
  align: "start" | "end";
  outcome?: "win" | "lose";
  celebrate?: boolean;
}) {
  const slots: (Player | null)[] = [players[0] ?? null, players[1] ?? null];

  return (
    <div className={cn("grid min-w-0 w-full gap-1.5", align === "end" && "justify-items-stretch")}>
      <AnimatePresence>
        {outcome ? (
          <motion.div
            key={outcome}
            initial={{ opacity: 0, scale: 0.85, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
          >
            <Badge
              className={cn(
                "font-display tracking-wide uppercase",
                outcome === "win"
                  ? "border-primary/40 bg-primary/25 text-primary"
                  : "border-destructive/40 bg-destructive/15 text-destructive",
              )}
            >
              {outcome === "win" ? "Win" : "Lose"}
            </Badge>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ul className="grid w-full min-w-0 gap-1.5">
        {slots.map((p, i) =>
          p ? (
            <DraggablePlayer
              key={p.id}
              player={p}
              align={align}
              outcome={outcome}
              celebrate={celebrate}
              delay={celebrate ? i * 0.05 : 0}
              onRemove={onRemove}
              onRename={onRename}
            />
          ) : (
            <li
              key={`open-${align}-${i}`}
              className={cn(
                "flex min-h-10 min-w-[6.5rem] items-center gap-1 rounded-xl border border-dashed border-[#e8f5a0]/30 px-0.5 py-1 sm:min-h-11 sm:gap-2 sm:px-1.5",
                align === "end" && "flex-row-reverse",
              )}
            >
              <span
                aria-hidden
                className="inline-flex size-8 shrink-0 rounded-full border border-dashed border-[#e8f5a0]/35 sm:size-10"
              />
              <span className="text-xs text-[#f4f7f0]/40">Open</span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function DraggablePlayer({
  player,
  align,
  outcome,
  celebrate,
  delay,
  compact,
  queueIndex,
  queueLength,
  onMove,
  onRemove,
  onRename,
}: {
  player: Player;
  align?: "start" | "end";
  outcome?: "win" | "lose";
  celebrate?: boolean;
  delay?: number;
  compact?: boolean;
  queueIndex?: number;
  queueLength?: number;
  onMove?: (player: Player, to: "up" | "down") => void;
  onRemove: (player: Player) => void;
  onRename: (player: Player) => void;
}) {
  const dragDisabled = useContext(DragDisabledContext);
  const { active } = useDndContext();
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: player.id,
    disabled: dragDisabled,
    data: { type: "player", playerId: player.id },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${PLAYER_DROP}${player.id}`,
    disabled: dragDisabled || isDragging,
    data: { type: "player", playerId: player.id },
  });

  function setNodeRef(node: HTMLElement | null) {
    setDragRef(node);
    setDropRef(node);
  }

  return (
    <li
      ref={setNodeRef}
      className={cn(
        "w-full min-w-0 touch-none list-none",
        dragDisabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
      )}
      {...listeners}
      {...attributes}
    >
      <motion.div
        layout={!isDragging}
        initial={false}
        animate={
          isDragging
            ? { opacity: 0.35, scale: 0.98 }
            : celebrate
              ? { scale: [1, 1.06, 1], y: [0, -3, 0], opacity: 1 }
              : outcome === "lose"
                ? { opacity: 0.65, scale: 0.98 }
                : { opacity: 1, scale: 1 }
        }
        transition={{
          duration: 0.35,
          delay: delay ?? 0,
          ease: "easeOut",
        }}
        className={cn(
          "flex w-full min-w-0 items-center overflow-visible rounded-xl",
          compact
            ? "min-h-11 gap-2 bg-[#1c4532] px-2.5 py-2 sm:min-h-12 sm:gap-2.5 sm:px-3 sm:py-2.5"
            : "min-h-10 items-start gap-1 px-0 py-1 sm:min-h-11 sm:gap-1.5 sm:px-1",
          align === "end" && "flex-row-reverse",
          outcome === "win" && "ring-2 ring-[#e8f5a0]/60",
          outcome === "lose" && "opacity-45",
          isOver && !isDragging && "bg-[#e8f5a0]/15 ring-2 ring-[#e8f5a0]/60",
        )}
      >
        <PlayerAvatar
          player={player}
          size={compact ? "sm" : "md"}
          highlight={Boolean(celebrate || isDragging)}
        />
        {compact ? (
          <>
            <button
              type="button"
              className={cn(
                "min-w-0 flex-1 text-left text-sm font-medium break-words",
                celebrate || isDragging
                  ? "text-[#f5d76e]"
                  : hasEightWins(player)
                    ? "text-[#7ec8ff]"
                    : isOnFire(player)
                      ? "text-[#ffb347]"
                      : "text-[#f4f7f0]",
              )}
              onClick={() => {
                if (active) return;
                onRename(player);
              }}
            >
              {player.name}
            </button>
            <span
              className={cn(
                "shrink-0 text-[10px] tabular-nums sm:text-xs",
                hasEightWins(player) ? "text-[#7ec8ff]" : "text-[#f4f7f0]/55",
              )}
            >
              {formatRecord(player)}
            </span>
            {onMove && queueLength != null && queueLength > 1 ? (
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  aria-label={`Move ${player.name} up the line`}
                  disabled={queueIndex === 0}
                  className="flex size-6 items-center justify-center text-[#e8f5a0]/80 hover:text-[#f5d76e] disabled:opacity-25"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onMove(player, "up")}
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${player.name} down the line`}
                  disabled={queueIndex === queueLength - 1}
                  className="flex size-6 items-center justify-center text-[#e8f5a0]/80 hover:text-[#f5d76e] disabled:opacity-25"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onMove(player, "down")}
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </div>
            ) : null}
            <button
              type="button"
              aria-label={`Done playing: ${player.name}`}
              className="flex size-8 shrink-0 items-center justify-center text-[#f4f7f0]/45 hover:text-[#ff6b4a] sm:size-9"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onRemove(player)}
            >
              <X className="size-4" />
            </button>
          </>
        ) : (
          <div
            className={cn(
              "min-w-0 flex-1",
              align === "end" ? "text-right" : "text-left",
            )}
          >
            <button
              type="button"
              className={cn(
                "w-full text-xs font-medium leading-tight break-words sm:text-sm",
                celebrate || isDragging
                  ? "text-[#f5d76e]"
                  : hasEightWins(player)
                    ? "text-[#7ec8ff]"
                    : isOnFire(player)
                      ? "text-[#ffb347]"
                      : "text-[#f4f7f0]",
                align === "end" ? "text-right" : "text-left",
              )}
              onClick={() => {
                if (active) return;
                onRename(player);
              }}
            >
              {player.name}
            </button>
            <div
              className={cn(
                "mt-0.5 flex items-center gap-1",
                align === "end" && "flex-row-reverse",
              )}
            >
              <span
                className={cn(
                  "shrink-0 text-[10px] tabular-nums sm:text-xs",
                  hasEightWins(player) ? "text-[#7ec8ff]" : "text-[#f4f7f0]/55",
                )}
              >
                {formatRecord(player)}
              </span>
              <button
                type="button"
                aria-label={`Done playing: ${player.name}`}
                className="flex size-6 shrink-0 items-center justify-center text-[#f4f7f0]/45 hover:text-[#ff6b4a] sm:size-7"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onRemove(player)}
              >
                <X className="size-3 sm:size-3.5" />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </li>
  );
}

function PlayerList({
  players,
  empty,
  compact,
  canReorder,
  onMove,
  onRemove,
  onRename,
}: {
  players: Player[];
  empty: string;
  compact?: boolean;
  canReorder?: boolean;
  onMove?: (player: Player, to: "up" | "down") => void;
  onRemove: (player: Player) => void;
  onRename: (player: Player) => void;
}) {
  return (
    <ol
      className={cn(
        "grid gap-1.5 overflow-auto overscroll-contain",
        compact
          ? "max-h-[min(28vh,220px)]"
          : "max-h-[min(45vh,420px)]",
      )}
    >
      <AnimatePresence initial={false}>
        {players.map((p, index) => (
          <DraggablePlayer
            key={p.id}
            player={p}
            compact={compact}
            queueIndex={index}
            queueLength={players.length}
            onMove={canReorder ? onMove : undefined}
            onRemove={onRemove}
            onRename={onRename}
          />
        ))}
      </AnimatePresence>
      {players.length === 0 && (
        <li className="px-1 py-2 text-sm text-[#f4f7f0]/55">{empty}</li>
      )}
    </ol>
  );
}
