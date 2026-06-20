import { RoverType } from '@/core/domain/entities/RoverConfig';

/**
 * Rover Type Visual Indicators
 *
 * Provides consistent badge styling and icons for rover types across the UI.
 * Helps operators quickly identify whether they're working with physical hardware
 * or a simulator, preventing accidental code execution on the wrong target.
 */

export interface RoverTypeBadgeProps {
  type: RoverType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const ROVER_TYPE_STYLES = {
  physical: {
    icon: '🤖',
    label: 'Physical',
    pill: 'bg-blue-950/60 border-blue-500/40 text-blue-400',
    dot: 'bg-blue-400 shadow-[0_0_5px_1px_rgba(96,165,250,0.65)]',
    description: 'Physical Pi Zero rover hardware',
  },
  simulator: {
    icon: '🖥️',
    label: 'Simulator',
    pill: 'bg-purple-950/60 border-purple-500/40 text-purple-400',
    dot: 'bg-purple-400 shadow-[0_0_5px_1px_rgba(192,132,252,0.65)]',
    description: 'Cloud-based simulator',
  },
} as const;

/**
 * Rover type badge component - displays whether rover is physical or simulator
 */
export function RoverTypeBadge({ type, size = 'md', className = '' }: RoverTypeBadgeProps) {
  const style = ROVER_TYPE_STYLES[type];

  const sizeClasses = {
    sm: 'text-[9px] px-1.5 py-0.5 gap-1',
    md: 'text-[10px] px-2 py-0.5 gap-1.5',
    lg: 'text-xs px-2.5 py-1 gap-2',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full
        font-bold tracking-widest uppercase border ${style.pill} ${sizeClasses[size]} ${className}`}
      title={style.description}
    >
      <span className="flex-shrink-0" aria-hidden="true">
        {style.icon}
      </span>
      {style.label}
    </span>
  );
}

/**
 * Get icon for rover type
 */
export function getRoverTypeIcon(type: RoverType): string {
  return ROVER_TYPE_STYLES[type].icon;
}

/**
 * Get label for rover type
 */
export function getRoverTypeLabel(type: RoverType): string {
  return ROVER_TYPE_STYLES[type].label;
}

/**
 * Get description for rover type
 */
export function getRoverTypeDescription(type: RoverType): string {
  return ROVER_TYPE_STYLES[type].description;
}
