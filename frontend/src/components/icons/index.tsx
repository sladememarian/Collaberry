/**
 * Hand-built SVG icon set — no emoji anywhere in the UI. Each icon is a thin
 * wrapper over react-native-svg with a shared props contract so sizing and color
 * stay consistent. Strokes use `currentColor`-style props (we pass explicit color)
 * and round caps to match the soft, premium feel of the theme.
 */
import React from "react";
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";

import { palette } from "@/theme/tokens";

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
});

const stroke = (color: string, w: number) => ({
  stroke: color,
  strokeWidth: w,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function PlusIcon({ size = 22, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Line x1="12" y1="5" x2="12" y2="19" {...stroke(color, strokeWidth)} />
      <Line x1="5" y1="12" x2="19" y2="12" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function KanbanIcon({ size = 22, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Rect x="3" y="4" width="5" height="16" rx="1.5" {...stroke(color, strokeWidth)} />
      <Rect x="10" y="4" width="5" height="10" rx="1.5" {...stroke(color, strokeWidth)} />
      <Rect x="17" y="4" width="4" height="13" rx="1.5" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function DocumentIcon({ size = 22, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" {...stroke(color, strokeWidth)} />
      <Polyline points="14 3 14 8 19 8" {...stroke(color, strokeWidth)} />
      <Line x1="8.5" y1="13" x2="15.5" y2="13" {...stroke(color, strokeWidth)} />
      <Line x1="8.5" y1="16.5" x2="13" y2="16.5" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function ChecklistIcon({ size = 22, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Polyline points="3 6 4.5 7.5 7 4.5" {...stroke(color, strokeWidth)} />
      <Polyline points="3 13 4.5 14.5 7 11.5" {...stroke(color, strokeWidth)} />
      <Line x1="11" y1="6" x2="20" y2="6" {...stroke(color, strokeWidth)} />
      <Line x1="11" y1="13" x2="20" y2="13" {...stroke(color, strokeWidth)} />
      <Line x1="11" y1="19" x2="16" y2="19" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function CheckIcon({ size = 18, color = palette.textHi, strokeWidth = 2.4 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Polyline points="4 12.5 9.5 18 20 6" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function UserIcon({ size = 22, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx="12" cy="8" r="4" {...stroke(color, strokeWidth)} />
      <Path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function UsersIcon({ size = 22, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx="9" cy="8" r="3.4" {...stroke(color, strokeWidth)} />
      <Path d="M2.5 19.5c0-3 2.9-5 6.5-5s6.5 2 6.5 5" {...stroke(color, strokeWidth)} />
      <Path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M18 14.6c2.3.6 3.8 2.2 3.8 4.4" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function BellIcon({ size = 22, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" {...stroke(color, strokeWidth)} />
      <Path d="M10 19a2 2 0 0 0 4 0" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function LockIcon({ size = 18, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" {...stroke(color, strokeWidth)} />
      <Path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" {...stroke(color, strokeWidth)} />
      <Circle cx="12" cy="15" r="1.4" fill={color} />
    </Svg>
  );
}

export function SearchIcon({ size = 20, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx="10.5" cy="10.5" r="6.5" {...stroke(color, strokeWidth)} />
      <Line x1="15.5" y1="15.5" x2="20" y2="20" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 20, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Polyline points="9 5 16 12 9 19" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function ArrowLeftIcon({ size = 22, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Line x1="20" y1="12" x2="5" y2="12" {...stroke(color, strokeWidth)} />
      <Polyline points="11 5 4 12 11 19" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function CloseIcon({ size = 22, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Line x1="6" y1="6" x2="18" y2="18" {...stroke(color, strokeWidth)} />
      <Line x1="18" y1="6" x2="6" y2="18" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function SparkIcon({ size = 22, color = palette.purple, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path
        d="M12 3c.5 3.8 1.7 5 5.5 5.5-3.8.5-5 1.7-5.5 5.5-.5-3.8-1.7-5-5.5-5.5C10.3 8 11.5 6.8 12 3z"
        fill={color}
      />
      <Path d="M18.5 14c.25 1.9.85 2.5 2.75 2.75-1.9.25-2.5.85-2.75 2.75-.25-1.9-.85-2.5-2.75-2.75 1.9-.25 2.5-.85 2.75-2.75z" fill={color} />
    </Svg>
  );
}

export function ImageIcon({ size = 22, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Rect x="3" y="4" width="18" height="16" rx="2.5" {...stroke(color, strokeWidth)} />
      <Circle cx="8.5" cy="9.5" r="1.6" {...stroke(color, strokeWidth)} />
      <Path d="M4 17l4.5-4.5a2 2 0 0 1 2.8 0L20 20" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function TrashIcon({ size = 20, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Polyline points="4 7 20 7" {...stroke(color, strokeWidth)} />
      <Path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" {...stroke(color, strokeWidth)} />
      <Path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function FlagIcon({ size = 16, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M5 21V4" {...stroke(color, strokeWidth)} />
      <Path d="M5 4h11l-2 3.5L16 11H5" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function LogoutIcon({ size = 20, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" {...stroke(color, strokeWidth)} />
      <Polyline points="15 8 19 12 15 16" {...stroke(color, strokeWidth)} />
      <Line x1="19" y1="12" x2="9" y2="12" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function DotGridIcon({ size = 20, color = palette.textLow }: IconProps) {
  const pts = [6, 12, 18];
  return (
    <Svg {...base(size)}>
      {pts.map((y) =>
        [9, 15].map((x) => <Circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill={color} />),
      )}
    </Svg>
  );
}

export function QuestionIcon({ size = 16, color = palette.textLow, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx="12" cy="12" r="9" {...stroke(color, strokeWidth)} />
      <Path d="M9.2 9.5a2.8 2.8 0 0 1 5.4 1c0 1.8-2.6 1.9-2.6 3.8" {...stroke(color, strokeWidth)} />
      <Circle cx="12" cy="17.2" r="1" fill={color} />
    </Svg>
  );
}

export function SendIcon({ size = 18, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M4 20l17-8L4 4l0 6.5L15 12 4 13.5z" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function CalendarIcon({ size = 18, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Rect x="3.5" y="5" width="17" height="16" rx="2.2" {...stroke(color, strokeWidth)} />
      <Line x1="3.5" y1="9.5" x2="20.5" y2="9.5" {...stroke(color, strokeWidth)} />
      <Line x1="8" y1="3" x2="8" y2="7" {...stroke(color, strokeWidth)} />
      <Line x1="16" y1="3" x2="16" y2="7" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** The Collaberry mark — two interlocking rings, purple→blue. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Circle cx="15" cy="20" r="10" stroke={palette.purple} strokeWidth="3" />
      <Circle cx="25" cy="20" r="10" stroke={palette.blue} strokeWidth="3" opacity={0.9} />
    </Svg>
  );
}

/**
 * A little berry glyph — a cluster of three fruit with a sprig of leaf, tinted
 * with the berry accent swatches. The friendly counterpart to the BrandMark's
 * rings; use it as a subtle brand garnish (empty states, footers, splashes).
 */
export function BerryMark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* leaf sprig */}
      <Path
        d="M12 4c1.4-1.4 3.6-1.6 5-1.2-.4 1.4-.6 3.6-2 5-1.4 1.4-3 .6-3.6 0-.6-.6-.8-2.4.6-3.8z"
        fill={palette.success}
        opacity={0.85}
      />
      <Path d="M12 4v4" {...stroke(palette.success, 1.4)} />
      {/* berry cluster */}
      <Circle cx="8.5" cy="13" r="3.4" fill={palette.raspberry} />
      <Circle cx="15.5" cy="13" r="3.4" fill={palette.blueberry} />
      <Circle cx="12" cy="18" r="3.4" fill={palette.blackberry} />
      {/* seed highlights */}
      <Circle cx="8.5" cy="13" r="0.8" fill={palette.textHi} opacity={0.5} />
      <Circle cx="15.5" cy="13" r="0.8" fill={palette.textHi} opacity={0.5} />
      <Circle cx="12" cy="18" r="0.8" fill={palette.textHi} opacity={0.4} />
    </Svg>
  );
}

export function GearIcon({ size = 20, color = palette.textHi, strokeWidth = 2 }: IconProps) {  return (
    <Svg {...base(size)}>
      <Circle cx="12" cy="12" r="3.2" {...stroke(color, strokeWidth)} />
      <Path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09A1.7 1.7 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"
        {...stroke(color, strokeWidth * 0.85)}
      />
    </Svg>
  );
}

export function HomeIcon({ size = 22, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M3.5 10.5 12 3.8l8.5 6.7V19a1.6 1.6 0 0 1-1.6 1.6H5.1A1.6 1.6 0 0 1 3.5 19z" {...stroke(color, strokeWidth)} />
      <Path d="M9.6 20.6v-6.2h4.8v6.2" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function MoonIcon({ size = 20, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M20.2 14.4A8.4 8.4 0 1 1 9.6 3.8a6.6 6.6 0 0 0 10.6 10.6z" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function SunIcon({ size = 20, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  // Eight rays, drawn from the axes/diagonals so the icon stays symmetric at
  // any size rather than hand-placing sixteen coordinates.
  const rays: [number, number][] = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7],
  ];
  return (
    <Svg {...base(size)}>
      <Circle cx="12" cy="12" r="4.2" {...stroke(color, strokeWidth)} />
      {rays.map(([dx, dy], i) => (
        <Line
          key={i}
          x1={12 + dx * 6.6}
          y1={12 + dy * 6.6}
          x2={12 + dx * 9}
          y2={12 + dy * 9}
          {...stroke(color, strokeWidth)}
        />
      ))}
    </Svg>
  );
}

export function ChevronLeftIcon({ size = 20, color = palette.textHi, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Polyline points="14.5 5 8 12 14.5 19" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}
