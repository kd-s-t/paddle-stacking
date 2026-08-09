"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SessionBoard } from "@/components/SessionBoard";
import { Button } from "@/components/ui/button";
import { endSession, getSession, putSession } from "@/lib/db";
import type { Session } from "@/lib/types";

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id?.toUpperCase();
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!id) return;
    setSession(getSession(id));
    setHydrated(true);
  }, [id]);

  useEffect(() => {
    if (!hydrated || !session) return;
    putSession(session);
  }, [session, hydrated]);

  function handleEnd() {
    if (session) endSession(session.id);
    router.push("/");
  }

  if (!hydrated) {
    return (
      <main className="relative z-10 mx-auto w-full max-w-lg flex-1 px-3 pt-8">
        <p className="text-center text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="relative z-10 mx-auto grid w-full max-w-lg flex-1 gap-4 px-3 pt-8">
        <p className="font-display text-2xl tracking-wide text-[var(--line)] uppercase">
          Session not found
        </p>
        <p className="text-muted-foreground">
          No local session with ID {id}. It may have been deleted on this device.
        </p>
        <Button
          className="font-display h-12 tracking-wide uppercase"
          onClick={() => router.push("/")}
        >
          Back home
        </Button>
      </main>
    );
  }

  return (
    <main className="relative z-10 mx-auto w-full max-w-lg flex-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-3xl sm:px-4 lg:max-w-5xl">
      <SessionBoard
        session={session}
        onChange={setSession}
        onEnd={handleEnd}
      />
    </main>
  );
}
