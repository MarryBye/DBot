import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Cookie,
  Copy,
  Disc3,
  ExternalLink,
  Eye,
  EyeOff,
  FileAudio,
  FileText,
  Globe,
  GripVertical,
  Headphones,
  Info,
  Link,
  ListMusic,
  Loader2,
  Lock,
  LogOut,
  Mic,
  Moon,
  Music,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Repeat,
  Repeat1,
  Save,
  Search,
  Server,
  Settings,
  Shield,
  Shuffle,
  SkipForward,
  Sliders,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Tv,
  Upload,
  User,
  Users,
  Video,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/cn';

const ICON_MAP = {
  'alert-triangle': AlertTriangle,
  'arrow-down': ArrowDown,
  'arrow-up': ArrowUp,
  'arrow-up-to-line': ArrowUpToLine,
  bookmark: Bookmark,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  clock: Clock,
  cookie: Cookie,
  copy: Copy,
  disc: Disc3,
  'external-link': ExternalLink,
  eye: Eye,
  'eye-off': EyeOff,
  'file-audio': FileAudio,
  'file-text': FileText,
  globe: Globe,
  'grip-vertical': GripVertical,
  headphones: Headphones,
  info: Info,
  link: Link,
  'list-music': ListMusic,
  loader: Loader2,
  lock: Lock,
  'log-out': LogOut,
  mic: Mic,
  moon: Moon,
  music: Music,
  pause: Pause,
  play: Play,
  plus: Plus,
  radio: Radio,
  'refresh-cw': RefreshCw,
  repeat: Repeat,
  'repeat-1': Repeat1,
  save: Save,
  search: Search,
  server: Server,
  settings: Settings,
  shield: Shield,
  shuffle: Shuffle,
  'skip-forward': SkipForward,
  sliders: Sliders,
  sparkles: Sparkles,
  square: Square,
  sun: Sun,
  trash: Trash2,
  tv: Tv,
  upload: Upload,
  user: User,
  users: Users,
  video: Video,
  'volume-2': Volume2,
  'volume-x': VolumeX,
  x: X,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICON_MAP;

const SIZE_MAP = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 22,
  xl: 28,
} as const;

export type IconSize = keyof typeof SIZE_MAP;

export interface IconProps {
  name: IconName;
  size?: IconSize;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 'sm', strokeWidth = 1.85, className }: IconProps) {
  const Component = ICON_MAP[name];
  return (
    <Component
      size={SIZE_MAP[size]}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      className={cn('shrink-0', className)}
    />
  );
}
