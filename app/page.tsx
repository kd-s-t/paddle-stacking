import { SessionList } from "@/components/SessionList";

export default function Home() {
  return (
    <main className="relative z-10 mx-auto w-full max-w-lg flex-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-3xl sm:px-4">
      <SessionList />
    </main>
  );
}
