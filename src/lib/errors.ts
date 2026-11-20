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
