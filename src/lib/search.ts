/** Убирает символы, ломающие фильтр PostgREST .or() */
export function cleanSearch(q: string | undefined) {
  return (q ?? "").replace(/[,()*%\\:"']/g, " ").trim().slice(0, 80);
}
