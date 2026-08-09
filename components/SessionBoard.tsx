"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Clock3,
  Layers3,
  Pencil,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Undo2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
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
import {
  addPlayers,
  canUndo,
  capacityPerRound,
  decideAndRotate,
  formatDuration,
  parseNames,
  playingMatches,
  playingPlayers,
  populateStack,
  removePlayer,
  renamePlayer,
  rotateCourt,
  sessionStats,
  setMatchScore,
  undoSession,
  updateSessionDetails,
  waitingPlayers,
  withUndo,
} from "@/lib/rotation";
import { cn } from "@/lib/utils";
import {
  HOUR_OPTIONS,
  type Match,
  type Player,
  type Session,
} from "@/lib/types";

type Props = {
  session: Session;
  onChange: (session: Session) => void;
  onEnd: () => void;
};

export function SessionBoard({ session, onChange, onEnd }: Props) {
  const [, setTick] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<Player | null>(null);
  const [pendingRename, setPendingRename] = useState<Player | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [editHours, setEditHours] = useState(session.hours);
  const stats = sessionStats(session);
  const groupSize = capacityPerRound(session.courtCount);
  const playing = playingPlayers(session);
  const matches = playingMatches(session);
  const waiting = waitingPlayers(session);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

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
    commit(addPlayers(session, names), true);
    setName("");
    setAddOpen(false);
  }

  function handleAddBulk(e: FormEvent) {
    e.preventDefault();
    const names = parseNames(bulk);
    if (names.length === 0) return;
    commit(addPlayers(session, names), true);
    setBulk("");
    setShowBulk(false);
    setAddOpen(false);
  }

  function handlePopulate() {
    commit(populateStack(session), true);
    setAddOpen(false);
  }

  function confirmRemove() {
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
      <header className="grid gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display truncate text-3xl leading-none font-extrabold tracking-wide text-[var(--line)] sm:text-4xl">
              {session.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {session.id} · {session.courtCount} courts · {session.hours}h
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 text-muted-foreground"
              disabled={!canUndo(session)}
              onClick={handleUndo}
            >
              <Undo2 className="size-4" />
              Undo
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 text-muted-foreground"
              onClick={openEdit}
            >
              <Pencil className="size-4" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 text-muted-foreground"
              onClick={onEnd}
            >
              Home
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="gap-1 bg-muted text-foreground">
            <Users className="size-3.5" />
            {session.players.length} stacked
          </Badge>
          <Badge variant="secondary" className="gap-1 bg-muted text-foreground">
            <Clock3 className="size-3.5" />
            {formatDuration(stats.remainingMs)} left
          </Badge>
          {session.players.length > 0 && (
            <Badge
              variant="secondary"
              className="gap-1 border-primary/30 bg-primary/15 text-primary"
            >
              <Trophy className="size-3.5" />
              {stats.minGames}-{stats.maxGames}g
            </Badge>
          )}
          <Button
            size="sm"
            className="font-display ml-auto h-10 tracking-wide uppercase"
            onClick={() => setAddOpen(true)}
          >
            <UserPlus data-icon="inline-start" />
            Add
          </Button>
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
              Drop a name on the stack, paste a list, or populate demos.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
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

            <AnimatePresence>
              {showBulk && (
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
                    Add {parseNames(bulk).length || ""} to stack
                  </Button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-[var(--border)] border-l-4 border-l-[var(--accent-hot)] bg-[var(--panel)] text-foreground shadow-none ring-0">
        <CardHeader className="gap-1 px-4 pt-4 pb-2">
          <CardTitle className="font-display flex items-center gap-2 text-xl tracking-wide text-[var(--line)] uppercase">
            <Play className="size-5 fill-primary text-primary" />
            Playing · {playing.length}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Win: back to the starting line. Winners meet winners (swap partners).
          </CardDescription>
        </CardHeader>
        <Separator className="bg-[var(--border)]" />
        <CardContent className="grid gap-3 px-3 pt-3 pb-3">
          {matches.every((m) => !m.ready) ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">
              Nobody playing. Add paddles to the stack.
            </p>
          ) : (
            matches.map((match) => (
              <MatchCard
                key={match.court}
                match={match}
                onRemove={setPendingRemove}
                onRename={openRename}
                onWinner={(winner) =>
                  commit(decideAndRotate(session, match.court, winner), true)
                }
                onScore={(side, raw) =>
                  commit(setMatchScore(session, match.court, side, raw))
                }
                onRotate={() =>
                  commit(rotateCourt(session, match.court), true)
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-[var(--border)] bg-[var(--panel)] text-foreground shadow-none ring-0">
        <CardHeader className="gap-1 px-4 pt-4 pb-2">
          <CardTitle className="font-display flex items-center gap-2 text-xl tracking-wide text-[var(--line)] uppercase">
            <Layers3 className="size-5 text-primary" />
            Waiting · {waiting.length}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            # is permanent. Line order is who is next. Tap a name to rename.
          </CardDescription>
        </CardHeader>
        <Separator className="bg-[var(--border)]" />
        <CardContent className="px-3 pt-3 pb-3">
          <PlayerList
            players={waiting}
            empty="No one waiting."
            onRemove={setPendingRemove}
            onRename={openRename}
          />
        </CardContent>
      </Card>

      <AlertDialog
        open={pendingRemove != null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
      >
        <AlertDialogContent className="border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-wide uppercase">
              Are you sure?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Remove {pendingRemove?.name} from the stack? The next waiting
              player will slide up if they were playing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-[var(--border)] bg-transparent">
            <AlertDialogCancel className="border-[var(--border)] bg-transparent text-foreground">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="font-display tracking-wide uppercase"
              onClick={confirmRemove}
            >
              Remove
            </AlertDialogAction>
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
              Update the name on the stack and courts.
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
          </form>
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}

function MatchCard({
  match,
  onRemove,
  onRename,
  onWinner,
  onScore,
  onRotate,
}: {
  match: Match;
  onRemove: (player: Player) => void;
  onRename: (player: Player) => void;
  onWinner: (winner: "A" | "B") => void;
  onScore: (side: "A" | "B", raw: string) => void;
  onRotate: () => void;
}) {
  const winner = match.result?.winner;
  const scoreA = match.result?.scoreA;
  const scoreB = match.result?.scoreB;
  const hasScore = scoreA !== undefined || scoreB !== undefined;
  const [showScore, setShowScore] = useState(hasScore);

  if (!match.ready) {
    return (
      <div className="rounded-sm border border-dashed border-[var(--border)] px-3 py-4">
        <p className="font-display text-sm tracking-wide text-primary uppercase">
          Court {match.court}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Waiting for 4 players…
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-sm bg-[var(--panel-raised)] outline outline-primary/25 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-display text-sm tracking-wide text-primary uppercase">
          Court {match.court}
        </p>
        {hasScore && (
          <Badge className="border-primary/40 bg-primary/20 text-primary">
            {scoreA ?? "-"}-{scoreB ?? "-"}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamSide
          players={match.teamA}
          onRemove={onRemove}
          onRename={onRename}
          align="end"
          outcome={
            winner === "A" ? "win" : winner === "B" ? "lose" : undefined
          }
        />
        <span className="font-display text-lg font-extrabold tracking-wide text-[var(--accent-hot)]">
          VS
        </span>
        <TeamSide
          players={match.teamB}
          onRemove={onRemove}
          onRename={onRename}
          align="start"
          outcome={
            winner === "B" ? "win" : winner === "A" ? "lose" : undefined
          }
        />
      </div>

      {!showScore ? (
        <button
          type="button"
          className="mt-2 w-full py-1.5 text-center text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
          onClick={() => setShowScore(true)}
        >
          Add score (optional)
        </button>
      ) : (
        <div className="mt-3 rounded-sm border border-dashed border-[var(--border)] px-3 py-2.5">
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
            />
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          className="font-display h-11 tracking-wide uppercase"
          disabled={match.teamA.length === 0}
          onClick={() => onWinner("A")}
        >
          Left wins
        </Button>
        <Button
          type="button"
          size="sm"
          className="font-display h-11 tracking-wide uppercase"
          disabled={match.teamB.length === 0}
          onClick={() => onWinner("B")}
        >
          Right wins
        </Button>
      </div>

      <Button
        type="button"
        variant="outline"
        className="font-display mt-2 h-11 w-full tracking-wide uppercase border-[var(--border)] bg-transparent text-foreground hover:bg-muted"
        onClick={onRotate}
      >
        <RotateCcw data-icon="inline-start" />
        Rotate court (no winner)
      </Button>
    </div>
  );
}

function TeamSide({
  players,
  onRemove,
  onRename,
  align,
  outcome,
}: {
  players: Player[];
  onRemove: (player: Player) => void;
  onRename: (player: Player) => void;
  align: "start" | "end";
  outcome?: "win" | "lose";
}) {
  if (players.length === 0) {
    return (
      <p
        className={cn(
          "text-sm text-muted-foreground",
          align === "end" ? "text-right" : "text-left",
        )}
      >
        Waiting…
      </p>
    );
  }

  return (
    <div className={cn("grid gap-1.5", align === "end" && "justify-items-end")}>
      {outcome && (
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
      )}
      <ul className={cn("grid gap-1.5", align === "end" && "justify-items-end")}>
        {players.map((p) => (
          <li
            key={p.id}
            className={cn(
              "flex min-h-10 items-center gap-1 rounded-sm bg-[var(--panel-raised)] px-2 py-1.5",
              align === "end" && "flex-row-reverse",
              outcome === "win" && "outline outline-primary/50",
              outcome === "lose" && "opacity-70",
            )}
          >
            <span className="font-display shrink-0 text-xs font-bold text-primary tabular-nums">
              #{p.number ?? "?"}
            </span>
            <button
              type="button"
              className="truncate text-left font-semibold"
              onClick={() => onRename(p)}
            >
              {p.name}
            </button>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {p.wins}-{p.losses}
            </span>
            <button
              type="button"
              aria-label={`Remove ${p.name}`}
              className="flex size-8 shrink-0 items-center justify-center text-muted-foreground active:text-destructive"
              onClick={() => onRemove(p)}
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlayerList({
  players,
  empty,
  onRemove,
  onRename,
}: {
  players: Player[];
  empty: string;
  onRemove: (player: Player) => void;
  onRename: (player: Player) => void;
}) {
  return (
    <ol className="grid max-h-[min(45vh,420px)] gap-1.5 overflow-auto overscroll-contain">
      <AnimatePresence initial={false}>
        {players.map((p) => (
          <motion.li
            key={p.id}
            layout
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            className="grid min-h-12 grid-cols-[2.25rem_1fr_auto_auto] items-center gap-2 rounded-sm bg-[var(--panel-raised)] px-2 py-2"
          >
            <span
              className="font-display font-bold text-primary tabular-nums"
              title="Paddle number (permanent for this session)"
            >
              #{p.number ?? "?"}
            </span>
            <button
              type="button"
              className="truncate text-left font-semibold"
              onClick={() => onRename(p)}
            >
              {p.name}
            </button>
            <span
              className="font-variant-numeric text-sm text-muted-foreground tabular-nums"
              title={`${p.wins} wins · ${p.losses} losses · ${p.gamesPlayed} games`}
            >
              {p.wins}-{p.losses}
            </span>
            <button
              type="button"
              aria-label={`Remove ${p.name}`}
              className="flex size-10 items-center justify-center text-muted-foreground active:text-destructive"
              onClick={() => onRemove(p)}
            >
              <X className="size-4" />
            </button>
          </motion.li>
        ))}
      </AnimatePresence>
      {players.length === 0 && (
        <li className="px-1 py-2 text-sm text-muted-foreground">{empty}</li>
      )}
    </ol>
  );
}
