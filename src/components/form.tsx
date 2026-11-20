"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/types";
import { Button, Notice, type ButtonVariant } from "@/components/ui";

export function SubmitButton({
  children,
  pendingText = "Сохранение…",
  variant = "primary",
  className,
  size,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} className={className} size={size}>
      {pending && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {pending ? pendingText : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error) return <Notice tone="red">{state.error}</Notice>;
  if (state.message) return <Notice tone="green">{state.message}</Notice>;
  return null;
}

/** Сбрасывает форму после успешного действия */
export function useResetOnSuccess(state: ActionState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return ref;
}
