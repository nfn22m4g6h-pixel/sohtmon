import { WifiOff } from "lucide-react";

export const metadata = { title: "Нет соединения" };

export default function OfflinePage() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <WifiOff className="size-8" />
        </div>
        <h1 className="text-xl font-bold">Нет подключения к интернету</h1>
        <p className="mt-2 text-sm text-muted">Данные хранятся в облаке. Проверьте соединение и обновите страницу.</p>
      </div>
    </div>
  );
}
