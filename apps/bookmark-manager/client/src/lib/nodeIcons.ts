import {
  Star,
  Heart,
  Bookmark,
  Flag,
  Bell,
  Tag,
  Globe,
  Home,
  Zap,
  Rocket,
  Briefcase,
  Code,
  Music,
  Camera,
  ShoppingCart,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';

// Fixed set of named icons the user can pick. The server stores only the name
// string; the client renders via this map, so an unknown/forged name fails
// closed (renders nothing rather than crashing).
export const NODE_ICONS: Record<string, LucideIcon> = {
  star: Star,
  heart: Heart,
  bookmark: Bookmark,
  flag: Flag,
  bell: Bell,
  tag: Tag,
  globe: Globe,
  home: Home,
  zap: Zap,
  rocket: Rocket,
  briefcase: Briefcase,
  code: Code,
  music: Music,
  camera: Camera,
  cart: ShoppingCart,
  book: BookOpen,
};

// Background-color swatches for a custom icon.
export const ICON_COLORS = [
  '#5b93f0', // blue (accent)
  '#7c5cff', // purple
  '#ff6a86', // pink
  '#ff8c42', // orange
  '#ffd60a', // yellow
  '#56e0b0', // green
  '#34c1d6', // teal
  '#8a93a6', // slate
];

// Curated, cross-platform emoji set — these render as the user's own system
// emoji on macOS/iOS. (A focusable input would also let macOS power users open
// the OS palette with Ctrl+Cmd+Space, but a grid works everywhere.)
export const ICON_EMOJI = [
  '⭐', '❤️', '🔥', '🚀', '📌', '🔖', '🎯', '💡',
  '✅', '📁', '📚', '💼', '🛒', '🎵', '🎬', '📷',
  '🌐', '🏠', '⚙️', '🔒', '💰', '📈', '🧠', '✏️',
  '🎨', '🍿', '☕', '🌙', '⚡', '🧩', '🐙', '💬',
];
