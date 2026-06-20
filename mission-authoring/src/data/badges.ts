export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
}

// Badge definitions — conditions are evaluated in BadgeEngine
export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  // Evaluated by BadgeEngine
  condition: (ctx: BadgeContext) => boolean;
}

export interface BadgeContext {
  completedChallenges: string[];
  totalSubmissions: number;
  successfulSubmissions: number;
  currentStreak: number;
  xp: number;
  level: number;
  hintsUsed: number;         // on the current submission
  totalHintsEver: number;    // across all submissions
  lastFiveCorrect: boolean;  // last 5 submissions were all correct
  justCompletedId?: string;  // ID of challenge just completed
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: "first-steps",
    name: "First Steps",
    description: "Complete your first challenge",
    icon: "🎯",
    condition: (ctx) => ctx.completedChallenges.length >= 1,
  },
  {
    id: "shape-starter",
    name: "Shape Starter",
    description: "Complete all beginner shape challenges",
    icon: "🔷",
    condition: (ctx) => {
      const beginnerIds = ["draw-line", "draw-square", "draw-rectangle", "draw-triangle"];
      return beginnerIds.every((id) => ctx.completedChallenges.includes(id));
    },
  },
  {
    id: "speed-runner",
    name: "Speed Runner",
    description: "Complete 3 challenges in a row without failing",
    icon: "⚡",
    condition: (ctx) => ctx.currentStreak >= 3,
  },
  {
    id: "perfectionist",
    name: "Perfectionist",
    description: "Maintain 100% success rate over your first 5 submissions",
    icon: "✨",
    condition: (ctx) => ctx.totalSubmissions >= 5 && ctx.lastFiveCorrect,
  },
  {
    id: "hintless",
    name: "No Peeking",
    description: "Complete a challenge without using any hints",
    icon: "🙈",
    condition: (ctx) => ctx.hintsUsed === 0 && ctx.completedChallenges.length >= 1,
  },
  {
    id: "house-builder",
    name: "House Builder",
    description: "Complete the Draw a House challenge",
    icon: "🏠",
    condition: (ctx) => ctx.completedChallenges.includes("draw-house"),
  },
  {
    id: "level-3",
    name: "Rising Coder",
    description: "Reach Level 3",
    icon: "🚀",
    condition: (ctx) => ctx.level >= 3,
  },
  {
    id: "centurion",
    name: "Centurion",
    description: "Earn 100 XP",
    icon: "💯",
    condition: (ctx) => ctx.xp >= 100,
  },
  {
    id: "all-shapes",
    name: "Shape Master",
    description: "Complete all shape challenges",
    icon: "🎨",
    condition: (ctx) => {
      const shapeIds = ["draw-line", "draw-square", "draw-rectangle", "draw-triangle", "draw-circle", "draw-house"];
      return shapeIds.every((id) => ctx.completedChallenges.includes(id));
    },
  },
];

export function badgeDefToRecord(def: BadgeDefinition, earnedAt: string): Badge {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    earnedAt,
  };
}