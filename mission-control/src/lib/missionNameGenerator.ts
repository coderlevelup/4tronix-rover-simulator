/**
 * Mission Name Generator
 *
 * Generates random mission names by combining:
 * - Part 1: Adjectives (e.g., Brave, Swift, Silent)
 * - Part 2: Nouns (e.g., Explorer, Guardian, Scout)
 * - Number: Random 3-digit number (100-999)
 *
 * Examples: BraveExplorer451, SwiftGuardian789, SilentScout123
 */

const PART1_WORDS = [
  'Red',
  'Dust',
  'Solar',
  'Mars',
  'Crater',
  'Rock',
  'Sand',
  'Rover',
  'Terra',
  'Orbital',
  'Lunar',
  'Helios',
  'Aurora',
  'Meteor',
  'Desert',
  'Canyon',
  'Storm',
  'Ridge',
  'Valley',
  'Peak',
];

const PART2_WORDS = [
  'Pathfinder',
  'Pioneer',
  'Explorer',
  'Nomad',
  'Wanderer',
  'Tracker',
  'Scanner',
  'Probe',
  'Rover',
  'Navigator',
  'Sentinel',
  'Seeker',
  'Mapper',
  'Surveyor',
  'Analyst',
  'Observer',
  'Collector',
  'Prospector',
  'Climber',
  'Traveler',
];

/**
 * Generate a random mission name
 *
 * @returns Random mission name in format: Part1-Part2-3DigitNumber
 * @example "Red-Pathfinder-234"
 */
export function generateRandomMissionName(): string {
  const part1 = PART1_WORDS[Math.floor(Math.random() * PART1_WORDS.length)];
  const part2 = PART2_WORDS[Math.floor(Math.random() * PART2_WORDS.length)];
  const number = Math.floor(Math.random() * 900) + 100; // 100-999

  return `${part1}-${part2}-${number}`;
}

/**
 * Generate multiple random mission names (for display options)
 *
 * @param count - Number of names to generate
 * @returns Array of random mission names
 */
export function generateMissionNameSuggestions(count: number = 3): string[] {
  const names: Set<string> = new Set();

  while (names.size < count) {
    names.add(generateRandomMissionName());
  }

  return Array.from(names);
}

/**
 * Validate if a string is a valid mission name
 *
 * @param name - Mission name to validate
 * @returns True if valid (non-empty, max 100 chars)
 */
export function isValidMissionName(name: string): boolean {
  return name.trim().length > 0 && name.length <= 100;
}
