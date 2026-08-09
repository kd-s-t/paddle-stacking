"use client";

import { motion } from "framer-motion";
import { Clock3, Layers3, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
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
import { WelcomeOverlay } from "@/components/WelcomeOverlay";
import { deleteSession, listSessions } from "@/lib/db";
import { formatDuration } from "@/lib/rotation";
import type { SessionSummary } from "@/lib/types";

function formatWhen(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export function SessionList() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SessionSummary | null>(
    null,
  );
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  function refresh() {
    setSessions(listSessions());
  }

  useLayoutEffect(() => {
    const list = listSessions();
    setSessions(list);
    setWelcomeOpen(list.length === 0);
    setHydrated(true);
  }, []);

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteSession(pendingDelete.id);
    setPendingDelete(null);
    refresh();
  }

  if (!hydrated) {
    return null;
  }

  if (welcomeOpen && sessions.length === 0) {
    return <WelcomeOverlay onDismiss={() => setWelcomeOpen(false)} />;
  }

  return (
    <motion.div
      className="relative z-10 grid gap-5 pb-8"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <header className="grid gap-2 pt-2">
        <p className="font-display text-[clamp(2.5rem,12vw,4rem)] leading-[0.95] font-extrabold tracking-wide text-[var(--line)] uppercase">
          Paddle Stack
        </p>
        <h1 className="font-display text-[clamp(1.5rem,6vw,2.25rem)] leading-[1.05] font-bold tracking-wide">
          Your sessions
        </h1>
        <p className="max-w-[36ch] text-[0.95rem] leading-snug text-muted-foreground">
          Saved on this device. Open a session ID or create a new stack.
        </p>
      </header>

      <Button
        size="lg"
        className="font-display h-14 w-full text-lg tracking-wide uppercase shadow-[var(--shadow)]"
        onClick={() => router.push("/new")}
      >
        <Plus data-icon="inline-start" />
        New session
      </Button>

      {sessions.length === 0 ? (
        <Card className="border-[var(--border)] bg-[var(--panel)] text-foreground ring-0">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No sessions yet. Create one to start stacking.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {sessions.map((s, i) => (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Card className="border-[var(--border)] bg-[var(--panel)] text-foreground ring-0">
                <CardHeader className="gap-2 px-4 pt-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="font-display truncate text-xl tracking-wide text-[var(--line)]">
                        {s.title}
                      </CardTitle>
                      <CardDescription className="text-muted-foreground">
                        {s.id} · Updated {formatWhen(s.updatedAt)}
                      </CardDescription>
                    </div>
                    <Badge
                      variant="secondary"
                      className={
                        s.status === "active"
                          ? "border-primary/30 bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {s.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 px-4 pb-4">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge
                      variant="secondary"
                      className="gap-1 bg-muted text-foreground"
                    >
                      <Layers3 className="size-3.5" />
                      {s.courtCount} courts
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="gap-1 bg-muted text-foreground"
                    >
                      <Clock3 className="size-3.5" />
                      {s.hours}h · {formatDuration(Date.now() - s.startedAt)} in
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="gap-1 bg-muted text-foreground"
                    >
                      {s.playerCount} players
                    </Badge>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Button
                      type="button"
                      className="font-display h-11 tracking-wide uppercase"
                      onClick={() => router.push(`/s/${s.id}`)}
                    >
                      Open
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 border-[var(--border)] bg-transparent text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label={`Delete session ${s.id}`}
                      onClick={() => setPendingDelete(s)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent className="border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-wide uppercase">
              Are you sure?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Delete session {pendingDelete?.id}? This cannot be undone on this
              device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-[var(--border)] bg-transparent">
            <AlertDialogCancel className="border-[var(--border)] bg-transparent text-foreground">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="font-display tracking-wide uppercase"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
