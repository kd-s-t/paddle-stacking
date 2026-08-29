export function PaddleStackMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect width="32" height="32" rx="7" fill="#163828" />
      <rect
        width="32"
        height="32"
        rx="7"
        stroke="#e8f5a0"
        strokeOpacity="0.35"
        fill="none"
      />
      <g transform="rotate(38 16 16)">
        <rect x="10" y="2.5" width="12" height="19" rx="5" fill="#f4f7f0" />
        <rect x="13.5" y="20" width="5" height="9.5" rx="1.6" fill="#f4f7f0" />
        <g stroke="#0f2e1c" strokeWidth="2" strokeLinecap="round">
          <path d="M12 8 L19 8" />
          <path d="M12 12.5 L19 12.5" />
          <path d="M12 17 L19 17" />
        </g>
      </g>
    </svg>
  );
}
