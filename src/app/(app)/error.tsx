"use client";

import { Button, Card } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto mt-10 max-w-md p-6 text-center">
      <h2 className="text-lg font-bold">Что-то пошло не так</h2>
      <p className="mt-2 text-sm text-muted">{error.message || "Не удалось загрузить данные. Проверьте соединение."}</p>
      <Button onClick={reset} className="mt-4">
        Повторить
      </Button>
    </Card>
  );
}
