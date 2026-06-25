/**
 * Mission Name Generator
 *
 * Generates friendly mission names by pairing two words, e.g. "Helios Explorer",
 * "Red Pathfinder". No numeric suffix and no dashes (per David's feedback):
 * names are for humans to recognise and re-roll, and they need not be unique.
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
 * @returns A two-word name like "Helios Explorer" (no number, no dashes)
 */
export function generateRandomMissionName(): string {
  const part1 = PART1_WORDS[Math.floor(Math.random() * PART1_WORDS.length)];
  const part2 = PART2_WORDS[Math.floor(Math.random() * PART2_WORDS.length)];

  return `${part1} ${part2}`;
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
