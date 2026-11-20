/** Понятное сообщение для ошибок PostgREST / Postgres */
export function dbError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return "Неизвестная ошибка";
  const msg = error.message ?? "";
  if (error.code === "42501" || /permission denied|row-level security/i.test(msg)) {
    return /[а-яё]/i.test(msg) ? msg : "Недостаточно прав для этой операции";
  }
  if (error.code === "23505" || /duplicate key/i.test(msg)) return "Такая запись уже существует (артикул, штрихкод или название)";
  if (error.code === "23503" || /foreign key/i.test(msg)) return "Запись используется в документах — удалить нельзя. Сделайте её неактивной.";
  if (/[а-яё]/i.test(msg)) return msg;
  return `Ошибка базы данных: ${msg}`;
}

/** Таблица/функция версии 2.0 ещё не создана в базе (не выполнено обновление supabase/upgrades/*.sql) */
export function isMissingSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return ["PGRST202", "PGRST205", "42P01", "42883", "42703", "PGRST200"].includes(error.code ?? "") || /does not exist|could not find/i.test(error.message ?? "");
}

export const UPGRADE_HINT = "Эта функция появится после обновления базы: выполните supabase/upgrades/2.0-a.sql в Supabase → SQL Editor.";
