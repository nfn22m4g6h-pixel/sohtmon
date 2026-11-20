import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
      <div>
        <p className="text-5xl font-black text-brand-600">404</p>
        <h1 className="mt-2 text-xl font-bold">Страница не найдена</h1>
        <Link href="/" className="mt-4 inline-block font-semibold text-brand-600">
          На главную
        </Link>
      </div>
    </div>
  );
}
