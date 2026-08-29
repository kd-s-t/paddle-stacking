"use client";

import { motion } from "framer-motion";
import { ChevronRight, Trash2 } from "lucide-react";
import Link from "next/link";
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
import { PaddleStackMark } from "@/components/PaddleStackMark";
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
        <div className="flex items-center gap-3">
          <PaddleStackMark className="h-10 w-10 shrink-0" />
          <p className="font-display text-[1.65rem] leading-none tracking-wide text-[#e8f5a0] sm:text-3xl">
            Paddle Stack
          </p>
        </div>
        <h1 className="font-display text-xl tracking-wide text-[#f4f7f0] sm:text-2xl">
          Your sessions
        </h1>
        <p className="max-w-[36ch] text-sm leading-snug text-[#f4f7f0]/65">
          Saved on this device. Open a session or start a new stack.
        </p>
      </header>

      <aside>
        <Link
          href="/new"
          className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-[#e8f5a0]/25 bg-[#0f2e1c] px-3 py-3 pr-12 transition hover:border-[#e8f5a0]/45 hover:bg-[#163828] sm:px-5 sm:py-4 sm:pr-16"
        >
          <span
            aria-hidden
            className="shiny-gold-sheen pointer-events-none absolute inset-y-0 left-0 z-0 w-1/3 bg-gradient-to-r from-transparent via-[#e8f5a0]/25 to-transparent"
          />
          <PaddleStackMark className="relative z-[1] mt-0.5 h-10 w-10 shrink-0 self-start" />
          <span className="relative z-[1] min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[#f5d76e] underline-offset-2 group-hover:underline">
              New session
            </span>
            <span className="mt-1 block text-sm text-[#f4f7f0]/65">
              Running open play with a group? Fair rotations — each court keeps
              its own stack.
            </span>
          </span>
          <ChevronRight
            aria-hidden
            strokeWidth={3}
            className="pointer-events-none absolute right-2 z-[1] size-12 -translate-x-2 text-[#f5d76e] opacity-0 transition duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-100 sm:right-3 sm:size-14"
          />
        </Link>
      </aside>

      {sessions.length === 0 ? (
        <p className="px-1 text-sm text-[#f4f7f0]/60">
          No sessions yet. Create one to start stacking.
        </p>
      ) : (
        <ul className="grid gap-3">
          {sessions.map((s, i) => (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <div className="group relative flex items-center gap-1 overflow-hidden rounded-2xl border border-[#e8f5a0]/25 bg-[#0f2e1c] pr-12 transition hover:border-[#e8f5a0]/45 hover:bg-[#163828] sm:pr-16">
                <button
                  type="button"
                  className="relative z-[1] flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left sm:px-5 sm:py-4"
                  onClick={() => router.push(`/s/${s.id}`)}
                >
                  <PaddleStackMark className="mt-0.5 h-10 w-10 shrink-0 self-start" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#f5d76e] underline-offset-2 group-hover:underline">
                      {s.title}
                    </span>
                    <span className="mt-1 block text-sm text-[#f4f7f0]/65">
                      {s.courtCount} courts · {s.playerCount} stacked ·{" "}
                      {s.hours}h · {formatDuration(Date.now() - s.startedAt)} in
                    </span>
                    <span className="mt-0.5 block text-xs text-[#f4f7f0]/45">
                      {s.id} · {s.status} · Updated {formatWhen(s.updatedAt)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete session ${s.id}`}
                  className="relative z-[2] mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-[#f4f7f0]/40 hover:text-[#ff6b4a]"
                  onClick={() => setPendingDelete(s)}
                >
                  <Trash2 className="size-4" />
                </button>
                <ChevronRight
                  aria-hidden
                  strokeWidth={3}
                  className="pointer-events-none absolute right-2 z-[1] size-12 -translate-x-2 text-[#f5d76e] opacity-0 transition duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-100 sm:right-3 sm:size-14"
                />
              </div>
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
        <AlertDialogContent className="rounded-2xl border-[#e8f5a0]/25 bg-[#163828] text-[#f4f7f0]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-wide text-[#e8f5a0]">
              Delete this stack?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#f4f7f0]/70">
              Delete session {pendingDelete?.id}? This cannot be undone on this
              device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-[#e8f5a0]/15 bg-transparent">
            <AlertDialogCancel className="rounded-xl border-[#e8f5a0]/30 bg-transparent text-[#f4f7f0]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="rounded-xl font-semibold"
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
