import type { ReactNode } from 'react';

/** Names of all icons in the studio. */
export type IconName =
  | 'select' | 'move' | 'scale' | 'rotate'
  | 'block' | 'sphere' | 'cylinder' | 'wedge' | 'cornerwedge' | 'truss' | 'spawn'
  | 'kill' | 'checkpoint' | 'mover' | 'spinner' | 'jumppad' | 'fade' | 'finish'
  | 'script' | 'localscript' | 'module' | 'light' | 'folder' | 'model'
  | 'undo' | 'redo' | 'copy' | 'paste' | 'duplicate' | 'group' | 'trash' | 'focus'
  | 'cut' | 'anchor' | 'play' | 'settings' | 'download' | 'publish' | 'plus' | 'check' | 'close' | 'more';

const PATHS: Record<IconName, ReactNode> = {
  select: <path d="M5 3l14 7.5-6.2 1.9L10.5 19z" />,
  move: <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />,
  scale: <path d="M5 19L19 5M13 5h6v6M11 19H5v-6" />,
  rotate: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  block: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" />,
  sphere: <><circle cx="12" cy="12" r="9" /><path d="M3 12c0 2 4 3.6 9 3.6s9-1.6 9-3.6" /></>,
  wedge: <><path d="M3 19h18V7z" /></>,
  cornerwedge: <><path d="M3 17l9 4 9-4-9-13z" /><path d="M12 4v17" /></>,
  cylinder: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /></>,
  truss: <path d="M6 3v18M18 3v18M6 7h12M6 12h12M6 17h12M6 7l12 5M18 12L6 17" />,
  spawn: <><ellipse cx="12" cy="18" rx="8" ry="3" /><path d="M12 15V5M8.5 8.5L12 5l3.5 3.5" /></>,
  kill: <><path d="M12 3a7 7 0 0 0-4 12.7V19h8v-3.7A7 7 0 0 0 12 3z" /><path d="M10 19v2.5M14 19v2.5" /><circle cx="9.5" cy="11" r="1" fill="currentColor" /><circle cx="14.5" cy="11" r="1" fill="currentColor" /></>,
  checkpoint: <path d="M6 21V4M6 4h11l-2.5 4L17 12H6" />,
  mover: <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />,
  spinner: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />,
  jumppad: <path d="M4 20h16M8 20v-4h8v4M12 14V4M8.5 7.5L12 4l3.5 3.5" />,
  fade: <rect x="4" y="4" width="16" height="16" rx="3" strokeDasharray="3.2 3.2" />,
  finish: <path d="M6 21V3M6 4h13v9H6M10.3 4v9M14.7 4v9M6 8.5h13" />,
  script: <path d="M8 6l-5 6 5 6M16 6l5 6-5 6M14 4l-4 16" />,
  localscript: <><path d="M8 6l-5 6 5 6M16 6l5 6-5 6" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>,
  module: <path d="M4 8h5V4h6v4h5v6h-4v6H9v-6H4z" />,
  light: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  model: <><rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 3" /><path d="M12 7l4 2.2v4.6L12 16l-4-2.2V9.2zM12 11.5l4-2.3M12 11.5V16M12 11.5L8 9.2" /></>,
  undo: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  redo: <path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
  paste: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6" /></>,
  duplicate: <><rect x="3" y="3" width="12" height="12" rx="2" /><rect x="9" y="9" width="12" height="12" rx="2" /></>,
  group: <><rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 3" /><rect x="7" y="7" width="4" height="4" rx="1" /><rect x="13" y="13" width="4" height="4" rx="1" /></>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  focus: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /><circle cx="12" cy="12" r="2.5" /></>,
  cut: <><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8 7.5L20 18M8 16.5L20 6" /></>,
  anchor: <><circle cx="12" cy="5" r="2" /><path d="M12 7v14M7 11h10M5 15c0 3 3 6 7 6s7-3 7-6" /></>,
  play: <path d="M7 4.5l13 7.5-13 7.5z" fill="currentColor" />,
  settings: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  download: <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />,
  publish: <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 13l4 4L19 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  more: <><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></>,
};

/**
 * Props for an icon.
 */
export type IconProps = { name: IconName; size?: number };

/**
 * Line icon drawn with SVG. It takes its color from the surrounding text color.
 */
export function Icon({ name, size = 22 }: IconProps) {
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
    >
      {PATHS[name]}
    </svg>
  );
}
