export function SythixMark({ size = 22 }: { size?: number }) {
  // Voxel "S" mark: an isometric cube split into three accent faces.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="sx-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="0.6" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path d="M12 2 21 7v10l-9 5-9-5V7z" fill="none" stroke="url(#sx-g)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 2 21 7l-9 5-9-5z" fill="#8b5cf6" opacity=".35" />
      <path d="M12 12v10l-9-5V7z" fill="#3b82f6" opacity=".18" />
      <path d="M15.5 9.2 9 12.6l6.4 3.3" fill="none" stroke="#e9d5ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <SythixMark />
      <span className="text-sm font-semibold tracking-tight">
        Sythi<span className="sx-gradient-text">X</span> <span className="font-normal text-muted">Studio</span>
      </span>
    </span>
  );
}
