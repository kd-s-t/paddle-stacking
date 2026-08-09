"use client";

import { useRouter } from "next/navigation";
import { SetupForm } from "@/components/SetupForm";
import { putSession } from "@/lib/db";
import { createSession } from "@/lib/rotation";
import type { SetupInput } from "@/lib/types";

export default function NewSessionPage() {
  const router = useRouter();

  function handleStart(input: SetupInput) {
    const session = createSession(input);
    putSession(session);
    router.replace(`/s/${session.id}`);
  }

  return (
    <main className="relative z-10 mx-auto w-full max-w-lg flex-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-3xl sm:px-4">
      <SetupForm onStart={handleStart} onBack={() => router.push("/")} />
    </main>
  );
}
