"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Clock3, LayoutGrid, Type } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { capacityPerRound, estimatedRounds } from "@/lib/rotation";
import {
  DEFAULT_GAME_LENGTH_HOURS,
  DEFAULT_SESSION_TITLE,
  HOUR_OPTIONS,
  type SetupInput,
} from "@/lib/types";

type Props = {
  onStart: (input: SetupInput) => void;
  onBack?: () => void;
};

const COURT_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

function formatHours(n: number): string {
  return n === 1 ? "1 hour" : `${n} hours`;
}

export function SetupForm({ onStart, onBack }: Props) {
  const [title, setTitle] = useState(DEFAULT_SESSION_TITLE);
  const [courtCount, setCourtCount] = useState(4);
  const [hours, setHours] = useState(2);

  const rounds = estimatedRounds(hours, DEFAULT_GAME_LENGTH_HOURS);
  const playing = capacityPerRound(courtCount);
  const canStart = courtCount >= 1 && hours > 0;

  return (
    <motion.form
      className="relative z-10 mx-auto grid w-full gap-5 pb-8"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canStart) return;
        onStart({
          title,
          courtCount,
          hours,
          gameLengthHours: DEFAULT_GAME_LENGTH_HOURS,
        });
      }}
    >
      <header className="grid gap-2 pt-2">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 w-fit -ml-2 text-muted-foreground"
            onClick={onBack}
          >
            <ArrowLeft data-icon="inline-start" />
            Sessions
          </Button>
        )}
        <motion.p
          className="font-display text-[clamp(2.5rem,12vw,4rem)] leading-[0.95] font-extrabold tracking-wide text-[var(--line)] uppercase"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.4 }}
        >
          Paddle Stack
        </motion.p>
        <motion.h1
          className="font-display max-w-[14ch] text-[clamp(1.5rem,6vw,2.25rem)] leading-[1.05] font-bold tracking-wide"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.4 }}
        >
          New session
        </motion.h1>
        <p className="max-w-[34ch] text-[0.95rem] leading-snug text-muted-foreground">
          Set courts and hours. You&apos;ll get a session ID saved on this
          device.
        </p>
      </header>

      <div className="grid gap-3">
        <FieldCard
          icon={<Type className="size-4 text-primary" />}
          label="Title"
          htmlFor="title"
        >
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={DEFAULT_SESSION_TITLE}
            className="h-12 border-[var(--border)] bg-[rgba(8,28,16,0.35)] text-base"
          />
        </FieldCard>
        <FieldCard
          icon={<LayoutGrid className="size-4 text-primary" />}
          label="Courts"
          htmlFor="courts"
        >
          <Select
            value={courtCount}
            onValueChange={(value) => {
              if (value != null) setCourtCount(Number(value));
            }}
          >
            <SelectTrigger
              id="courts"
              className="h-12 w-full border-[var(--border)] bg-[rgba(8,28,16,0.35)] text-base"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="start"
              className="max-h-72 border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)]"
            >
              {COURT_OPTIONS.map((n) => (
                <SelectItem
                  key={n}
                  value={n}
                  className="focus:bg-[var(--accent)] focus:text-[var(--accent-foreground)]"
                >
                  {n} {n === 1 ? "court" : "courts"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldCard>
        <FieldCard
          icon={<Clock3 className="size-4 text-primary" />}
          label="Hours"
          htmlFor="hours"
        >
          <Select
            value={hours}
            onValueChange={(value) => {
              if (value != null) setHours(Number(value));
            }}
          >
            <SelectTrigger
              id="hours"
              className="h-12 w-full border-[var(--border)] bg-[rgba(8,28,16,0.35)] text-base"
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
                  {formatHours(n)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldCard>
      </div>

      <div className="rounded-md border-l-[3px] border-primary bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
        <p>
          ~{rounds} rounds · {playing} next up when stack is full
        </p>
      </div>

      <motion.div
        className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20"
        whileTap={{ scale: canStart ? 0.98 : 1 }}
      >
        <Button
          type="submit"
          size="lg"
          disabled={!canStart}
          className="font-display h-14 w-full text-lg tracking-wide uppercase shadow-[var(--shadow)]"
        >
          Create session
        </Button>
      </motion.div>
    </motion.form>
  );
}

function FieldCard({
  icon,
  label,
  htmlFor,
  children,
}: {
  icon: ReactNode;
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <Card className="border-[var(--border)] bg-[rgba(8,28,16,0.45)] text-foreground ring-0">
      <CardContent className="grid gap-2 pt-4">
        <Label
          htmlFor={htmlFor}
          className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-[var(--line)] uppercase"
        >
          {icon}
          {label}
        </Label>
        {children}
      </CardContent>
    </Card>
  );
}
