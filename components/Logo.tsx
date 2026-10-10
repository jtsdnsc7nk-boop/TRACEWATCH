import { useId } from "react";

/** TraceWatch mark: a cat in a detective's fedora. Inherits colour from `currentColor`. */
export function Logo({ className, whiskers = true }: { className?: string; whiskers?: boolean }) {
  const maskId = `tw-logo-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect width="64" height="64" fill="#fff" />
          <g transform="rotate(-9 32 22)">
            <rect x="18" y="18.2" width="28" height="3" fill="#000" />
            <path d="M7.5 27.6 Q32 33.6 56.5 27.6" fill="none" stroke="#000" strokeWidth="1.8" />
          </g>
          <path d="M19.5 40.5 Q24.5 35.2 30 40 Q24.5 44.2 19.5 40.5Z" fill="#000" />
          <path d="M34 40 Q39.5 35.2 44.5 40.5 Q39.5 44.2 34 40Z" fill="#000" />
          <path d="M29.6 46.4 H34.4 L32 49.2Z" fill="#000" />
        </mask>
      </defs>
      <g fill="currentColor" mask={`url(#${maskId})`}>
        <path d="M11 37 C11 27.5 19 24.5 32 24.5 C45 24.5 53 27.5 53 37 C53 49 44.5 56 32 56 C19.5 56 11 49 11 37Z" />
        <path d="M40 27 L50.5 10.5 L50 29Z" />
        <path d="M23.5 27.5 L12.5 14 L12 31.5Z" />
        <g transform="rotate(-9 32 22)">
          <ellipse cx="32" cy="25.4" rx="25" ry="3.8" />
          <path d="M18.5 25.5 C18.5 15.5 20.5 9.5 26 8.6 C29 8.1 30.2 10.8 32 10.8 C33.8 10.8 35 8.1 38 8.6 C43.5 9.5 45.5 15.5 45.5 25.5Z" />
        </g>
      </g>
      <ellipse cx="25" cy="40.1" rx="1" ry="2.3" fill="currentColor" />
      <ellipse cx="39" cy="40.1" rx="1" ry="2.3" fill="currentColor" />
      {whiskers ? (
        <g stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.85">
          <path d="M13 45 L3 43" />
          <path d="M13.5 48 L4 49.5" />
          <path d="M51 45 L61 43" />
          <path d="M50.5 48 L60 49.5" />
        </g>
      ) : null}
    </svg>
  );
}
