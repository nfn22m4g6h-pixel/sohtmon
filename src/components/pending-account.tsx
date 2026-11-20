import { Clock } from "lucide-react";
import { signOut } from "@/app/actions";
import { Button, Card } from "@/components/ui";

export function PendingAccount({ name, email }: { name: string; email: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <Card className="w-full max-w-sm p-6 text-center animate-fade-up">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <Clock className="size-7" />
        </div>
        <h1 className="text-xl font-bold">Аккаунт ожидает активации</h1>
        <p className="mt-2 text-sm text-muted">
          {name || email}, владелец или администратор должен назначить вам роль в разделе «Сотрудники».
        </p>
        <p className="mt-1 text-xs text-slate-400">{email}</p>
        <form action={signOut} className="mt-6">
          <Button variant="outline" className="w-full">
            Выйти
          </Button>
        </form>
      </Card>
    </div>
  );
}
