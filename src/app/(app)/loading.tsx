export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-5 h-8 w-48 rounded-lg bg-slate-200/70" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-slate-200/60" />
        ))}
      </div>
      <div className="mt-4 h-64 rounded-2xl bg-slate-200/50" />
    </div>
  );
}
