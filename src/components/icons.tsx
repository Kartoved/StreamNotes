import React from 'react';
import {
  X, Check, ChevronDown, ChevronUp, ChevronRight,
  ArrowLeft, ArrowRight, Link, Pencil, Maximize2,
  Trash2, Calendar, Timer, Pin, Clipboard,
  Settings, Info, Target, Repeat, FileText,
  CornerUpLeft, Flame, Snowflake, Zap,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';

// Thin wrapper — keeps stroke width consistent with the previous hand-drawn set
const ic = (C: React.FC<LucideProps>) =>
  ({ size = 15, ...p }: { size?: number } & Omit<LucideProps, 'size'>) =>
    <C size={size} strokeWidth={1.8} {...p} />;

export const IconX            = ic(X);
export const IconCheck        = ic(Check);
export const IconChevronDown  = ic(ChevronDown);
export const IconChevronUp    = ic(ChevronUp);
export const IconChevronRight = ic(ChevronRight);
export const IconArrowLeft    = ic(ArrowLeft);
export const IconArrowRight   = ic(ArrowRight);
export const IconLink         = ic(Link);
export const IconEdit         = ic(Pencil);
export const IconMaximize     = ic(Maximize2);
export const IconTrash        = ic(Trash2);
export const IconCalendar     = ic(Calendar);
export const IconTimer        = ic(Timer);
export const IconPin          = ic(Pin);
export const IconClipboard    = ic(Clipboard);
export const IconSettings     = ic(Settings);
export const IconInfo         = ic(Info);
export const IconTarget       = ic(Target);
export const IconTarget2      = ic(Target);
export const IconRepeat       = ic(Repeat);
export const IconNote         = ic(FileText);
export const IconReply        = ic(CornerUpLeft);
export const IconFlame        = ic(Flame);
export const IconSnowflake    = ic(Snowflake);

// ── Animated streak icons ────────────────────────────────────────────

/** Flame — pulses when streak is active, dims+grayscale when zero */
export const StreakFlame = ({
  size = 15,
  active,
}: {
  size?: number;
  active: boolean;
}) => (
  <span style={{
    display: 'inline-flex',
    color: active ? '#f97316' : 'var(--text-faint)',
    filter: active ? 'none' : 'grayscale(1)',
    animation: active ? 'streak-pulse 2.4s ease-in-out infinite' : 'none',
    transition: 'color 0.3s, filter 0.3s',
  }}>
    <Flame size={size} strokeWidth={1.8} />
  </span>
);

/** Snowflake — cyan when freezes available, fades out when depleted */
export const FreezeCrystal = ({
  size = 15,
  active,
}: {
  size?: number;
  active: boolean;
}) => (
  <span style={{
    display: 'inline-flex',
    color: active ? '#4a7cf0' : 'var(--text-faint)',
    filter: active ? 'none' : 'grayscale(1) opacity(0.5)',
    transition: 'color 0.3s, filter 0.3s',
    animation: active ? 'freeze-spin 8s linear infinite' : 'none',
  }}>
    <Snowflake size={size} strokeWidth={1.8} />
  </span>
);

/** XP bolt — flashes amber when multiplier > 0 */
export const XpBolt = ({
  size = 15,
  active,
}: {
  size?: number;
  active: boolean;
}) => (
  <span style={{
    display: 'inline-flex',
    color: active ? '#4ade80' : 'var(--text-faint)',
    filter: active ? 'none' : 'grayscale(1) opacity(0.45)',
    animation: active ? 'xp-flash 3s ease-in-out infinite' : 'none',
    transition: 'color 0.3s, filter 0.3s',
  }}>
    <Zap size={size} strokeWidth={1.8} />
  </span>
);
