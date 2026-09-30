import type { ReactNode } from "react";

// Minimal inline icon set (stroke-based, inherit currentColor).
interface IconProps {
  size?: number;
}

const wrap = (children: ReactNode, size = 22) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

export const LayersIcon = ({ size }: IconProps) =>
  wrap(
    <>
      <path d="M12 3 2 8l10 5 10-5-10-5Z" />
      <path d="m2 13 10 5 10-5" />
      <path d="m2 18 10 5 10-5" opacity="0.5" />
    </>,
    size,
  );

export const LocateIcon = ({ size }: IconProps) =>
  wrap(
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>,
    size,
  );

export const RecordIcon = ({ size }: IconProps) => wrap(<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />, size);

export const StopIcon = ({ size }: IconProps) => wrap(<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />, size);

export const TripIcon = ({ size }: IconProps) =>
  wrap(
    <>
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <path d="M8 17.5c6-1 8-3 8-9" strokeDasharray="2 2" />
    </>,
    size,
  );

export const OfflineIcon = ({ size }: IconProps) =>
  wrap(
    <>
      <path d="M12 3v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </>,
    size,
  );

export const CloseIcon = ({ size }: IconProps) => wrap(<path d="M6 6l12 12M18 6 6 18" />, size);
