import React from 'react';

const S = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: '1.8',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  style: { display: 'block' as const, flexShrink: 0 as const },
};

const Ic = ({ d, size = 15 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}><path d={d} /></svg>
);

export const IconX             = ({ size = 15 }: { size?: number }) => <Ic d="M18 6 6 18M6 6l12 12" size={size} />;
export const IconCheck         = ({ size = 15 }: { size?: number }) => <Ic d="M20 6 9 17l-5-5" size={size} />;
export const IconChevronDown   = ({ size = 15 }: { size?: number }) => <Ic d="M6 9l6 6 6-6" size={size} />;
export const IconChevronUp     = ({ size = 15 }: { size?: number }) => <Ic d="M18 15l-6-6-6 6" size={size} />;
export const IconChevronRight  = ({ size = 15 }: { size?: number }) => <Ic d="M9 6l6 6-6 6" size={size} />;
export const IconArrowLeft     = ({ size = 15 }: { size?: number }) => <Ic d="M19 12H5M12 5l-7 7 7 7" size={size} />;
export const IconArrowRight    = ({ size = 15 }: { size?: number }) => <Ic d="M5 12h14M12 19l7-7-7-7" size={size} />;
export const IconLink          = ({ size = 15 }: { size?: number }) => <Ic d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" size={size} />;
export const IconEdit          = ({ size = 15 }: { size?: number }) => <Ic d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" size={size} />;
export const IconMaximize      = ({ size = 15 }: { size?: number }) => <Ic d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" size={size} />;

export const IconTrash = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
);

export const IconCalendar = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
  </svg>
);

export const IconTimer = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

export const IconPin = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1v3.76z" />
  </svg>
);

export const IconClipboard = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
    <path d="M15 2H9a1 1 0 00-1 1v2a1 1 0 001 1h6a1 1 0 001-1V3a1 1 0 00-1-1z" />
  </svg>
);

export const IconSettings = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconInfo = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

export const IconTarget = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

export const IconRepeat = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M17 1l4 4-4 4" />
    <path d="M3 11V9a4 4 0 014-4h14" />
    <path d="M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 01-4 4H3" />
  </svg>
);

export const IconNote = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h5" />
  </svg>
);

export const IconFlame = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M12 2c1 4 5 5 5 10a5 5 0 11-10 0c0-2 1-3 1-5 0 1 1 2 2 2 0-3 1-5 2-7z" />
  </svg>
);

export const IconSnowflake = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" />
  </svg>
);

export const IconTarget2 = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const IconReply = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M9 10l-5 5 5 5" />
    <path d="M20 4v7a4 4 0 01-4 4H4" />
  </svg>
);
