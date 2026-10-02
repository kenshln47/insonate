import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.6v.2" />
  </Icon>
);
export const CtIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 3.5v2M12 18.5v2" />
  </Icon>
);
export const LinkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
  </Icon>
);
export const KeyboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10" />
  </Icon>
);
export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Icon>
);
export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);
export const FreezeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
    <path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2" />
  </Icon>
);
export const RulerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m3.5 15.5 12-12 5 5-12 12z" />
    <path d="m7.5 11.5 2 2M10.5 8.5l1.5 1.5M13.5 5.5l2 2" />
  </Icon>
);
export const TagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z" />
    <circle cx="8" cy="8" r="1.5" />
  </Icon>
);
export const TargetIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </Icon>
);
export const ResetIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12a8 8 0 1 0 2.5-5.8" />
    <path d="M4 4v4.5h4.5" />
  </Icon>
);
export const LungsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v8M12 12l-2.5 2M12 12l2.5 2" />
    <path d="M9.5 9C7 7 4 9 4 13c0 3 1 6 3.5 6 2 0 2.5-1.5 2.5-3.5V11" />
    <path d="M14.5 9C17 7 20 9 20 13c0 3-1 6-3.5 6-2 0-2.5-1.5-2.5-3.5V11" />
  </Icon>
);
export const AnatomyIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5c-3.6 0-6.2 2.6-6.2 6.1 0 4.7 4 7.2 6.2 10.9 2.2-3.7 6.2-6.2 6.2-10.9 0-3.5-2.6-6.1-6.2-6.1Z" />
    <path d="M9.2 10.2c.8-1.5 2.1-2.2 3.6-2" />
  </Icon>
);
export const CameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.4-2h6.6l1.4 2h1.8A2.5 2.5 0 0 1 21 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </Icon>
);
export const ArrowIcon = ({ direction, ...p }: IconProps & { direction: "up" | "down" | "left" | "right" }) => {
  const rotation = { up: 0, right: 90, down: 180, left: 270 }[direction];
  return (
    <Icon {...p}>
      <g transform={`rotate(${rotation} 12 12)`}>
        <path d="M12 19V5M6 11l6-6 6 6" />
      </g>
    </Icon>
  );
};
export const RotateIcon = ({ clockwise, ...p }: IconProps & { clockwise: boolean }) => (
  <Icon {...p}>
    <g transform={clockwise ? undefined : "translate(24 0) scale(-1 1)"}>
      <path d="M19 12a7 7 0 1 1-2.1-5" />
      <path d="M19 4.5v4h-4" />
    </g>
  </Icon>
);
export const FanIcon = ({ up, ...p }: IconProps & { up: boolean }) => (
  <Icon {...p}>
    <g transform={up ? undefined : "translate(0 24) scale(1 -1)"}>
      <path d="M12 20 6 6M12 20l6-14" opacity="0.45" />
      <path d="M12 20 9 4" />
      <path d="m7.5 6.5 1.5-2.5 2.5 1.7" />
    </g>
  </Icon>
);
/** Pressing the probe in: a probe pushed down into the skin line. */
export const PressIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3.5h6v7.5l-3 3-3-3z" />
    <path d="M3.5 18c3-2 5.5-2.6 8.5-2.6s5.5.6 8.5 2.6" />
    <path d="M12 17.5v3" opacity="0.5" />
  </Icon>
);
export const RockIcon = ({ toMarker, ...p }: IconProps & { toMarker: boolean }) => (
  <Icon {...p}>
    <g transform={toMarker ? undefined : "translate(24 0) scale(-1 1)"}>
      <rect x="8" y="3" width="8" height="10" rx="2" transform="rotate(-18 12 8)" />
      <path d="M5 19h14" opacity="0.5" />
      <path d="M7 15.5 5 19" />
    </g>
  </Icon>
);

/**
 * The mark: a curvilinear image sector as the monitor shows it, with the orientation marker beside
 * its corner. Drawn in the text colour, so it follows the theme; the marker is the accent.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path
        d="M26.3 11.4A11 11 0 0 0 37.7 11.4L57.7 44.9A50 50 0 0 1 6.3 44.9Z"
        fill="currentColor"
        fillOpacity="0.08"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <path d="M47.4 27.7A30 30 0 0 1 16.6 27.7" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2.4" />
      <circle cx="16.5" cy="9" r="4" style={{ fill: "var(--accent)" }} />
    </svg>
  );
}
