// SKM Protein Tracker — Professional SVG Icon Library
// All icons are inline SVG. No emojis, no external icon packages.

import { type SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number; color?: string };

const base = (size: number, color: string, props: IconProps) => ({
  width:   size,
  height:  size,
  viewBox: '0 0 24 24',
  fill:    'none',
  stroke:  color,
  strokeWidth: 2,
  strokeLinecap:  'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
});

export const HomeIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

export const ScanIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <rect x="3" y="3" width="5" height="5" rx="1"/>
    <rect x="16" y="3" width="5" height="5" rx="1"/>
    <rect x="3" y="16" width="5" height="5" rx="1"/>
    <path d="M16 16h2v2h-2zM18 18h3v3h-3zM16 21h2"/>
    <path d="M3 8h3M3 16V8M8 3v3M16 3V3"/>
  </svg>
);

export const FoodLogIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M18 8h1a4 4 0 010 8h-1"/>
    <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/>
    <line x1="6" y1="1" x2="6" y2="4"/>
    <line x1="10" y1="1" x2="10" y2="4"/>
    <line x1="14" y1="1" x2="14" y2="4"/>
  </svg>
);

export const AnalyticsIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
    <line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);

export const TrophyIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <polyline points="8 21 12 17 16 21"/>
    <line x1="12" y1="17" x2="12" y2="11"/>
    <path d="M7 4H4v3a5 5 0 005 5h6a5 5 0 005-5V4h-3"/>
    <rect x="7" y="3" width="10" height="2" rx="1"/>
  </svg>
);

export const UserIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

export const StarIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

export const FlameIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M12 2c0 0-5 5-5 10a5 5 0 0010 0 8 8 0 01-5-10z"/>
    <path d="M12 12c0 0-2 2-2 4a2 2 0 004 0 4 4 0 01-2-4z"/>
  </svg>
);

export const TargetIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);

export const CheckCircleIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

export const BellIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 01-3.46 0"/>
  </svg>
);

export const SettingsIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
);

export const EditIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

export const LogoutIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

export const TrashIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
  </svg>
);

export const PlusIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

export const ChevronRightIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

export const ChevronLeftIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

export const ChevronDownIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

export const ArrowLeftIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
);

export const SearchIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

export const CloseIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export const CameraIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);

export const ZapIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

export const AwardIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <circle cx="12" cy="8" r="6"/>
    <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
  </svg>
);

export const GiftIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <polyline points="20 12 20 22 4 22 4 12"/>
    <rect x="2" y="7" width="20" height="5"/>
    <line x1="12" y1="22" x2="12" y2="7"/>
    <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/>
    <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
  </svg>
);

export const CalendarIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

export const TrendUpIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
);

export const UsersIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 00-3-3.87"/>
    <path d="M16 3.13a4 4 0 010 7.75"/>
  </svg>
);

export const EggIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M12 22c5 0 8-4.5 8-9a8 8 0 00-16 0c0 4.5 3 9 8 9z"/>
  </svg>
);

export const ShieldIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

export const InfoIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);

export const LockIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0110 0v4"/>
  </svg>
);

export const UnlockIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 019.9-1"/>
  </svg>
);

export const CoinIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 6v12M9 8.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5S13.7 11 12 11s-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5"/>
  </svg>
);

export const CheckIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

export const AlertIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

export const GamepadIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <line x1="6" y1="12" x2="10" y2="12"/>
    <line x1="8" y1="10" x2="8" y2="14"/>
    <line x1="15" y1="13" x2="15.01" y2="13"/>
    <line x1="18" y1="11" x2="18.01" y2="11"/>
    <rect x="2" y="6" width="20" height="12" rx="2"/>
  </svg>
);

export const SunIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

export const MoonIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
  </svg>
);

export const CrownIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M2 20h20M5 20V10l7-7 7 7v10"/>
    <path d="M5 10L2 7M19 10l3-3M12 3v4"/>
  </svg>
);

export const ShareIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);

export const DownloadIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

export const ListIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <line x1="8" y1="6" x2="21" y2="6"/>
    <line x1="8" y1="12" x2="21" y2="12"/>
    <line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/>
    <line x1="3" y1="12" x2="3.01" y2="12"/>
    <line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);

export const PhoneIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
  </svg>
);

export const MailIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22 6 12 13 2 6"/>
  </svg>
);

export const HeartIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 000-7.8z"/>
  </svg>
);

export const RulerIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <path d="M3 17l6-6 4 4L21 7"/>
    <path d="M3 21h18"/>
  </svg>
);

export const ScaleIcon = ({ size = 20, color = 'currentColor', ...p }: IconProps) => (
  <svg {...base(size, color, p)}>
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <circle cx="12" cy="12" r="4"/>
  </svg>
);
