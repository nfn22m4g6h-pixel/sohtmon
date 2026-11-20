import { useId } from "react";

/** Фирменный знак SOHTMON: коробка-склад с буквой S */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} role="img" aria-label="SOHTMON">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f86ff" />
          <stop offset="0.55" stopColor="#2557eb" />
          <stop offset="1" stopColor="#1a2f8f" />
        </linearGradient>
        <radialGradient id={`h${id}`} cx="0.25" cy="0.15" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#g${id})`} />
      <rect width="512" height="512" rx="116" fill={`url(#h${id})`} />
      <g transform="translate(256 256)">
        <path d="M0 -160 L139 -80 L139 80 L0 160 L-139 80 L-139 -80 Z" fill="#fff" />
        <path d="M0 0 L139 -80 L139 80 L0 160 Z" fill="#dbe6ff" />
        <path d="M0 0 L-139 -80 L-139 80 L0 160 Z" fill="#eef3ff" />
        <path
          d="M72 -42 L0 -84 L-72 -42 L0 0 L72 42 L0 84 L-72 42"
          fill="none"
          stroke="#2557eb"
          strokeWidth="30"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
