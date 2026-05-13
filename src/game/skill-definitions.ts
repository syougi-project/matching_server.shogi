/**
 * Canonical skill definitions matching app.shogi.
 * Provides fallback definitions for clients that don't receive skill data from BFF.
 * 
 * Sources:
 * - app.shogi: src/ai/engine/session-skill-definitions-v2.ts
 * - server: matching_server.shogi (skill-runtime.ts)
 */

import type { SkillDefinition } from '@/types/domain';

export const CANONICAL_SKILL_DEFINITIONS: readonly SkillDefinition[] = [
  // Skill #38: 幻 (Phantom/Illusion) - evade_capture with 50% proc chance
  {
    skillId: 38,
    pieceChars: ['幻'],
    trigger: { type: 'continuous_rule' },
    conditions: [{ type: 'chance_roll', params: { procChance: 0.5 } }],
    effects: [
      {
        type: 'defense_or_immunity',
        target: { group: 'self', selector: 'self_piece' },
        params: { mode: 'evade_capture' },
      },
    ],
  },

  // Skill #39: 霧 (Mist) - send adjacent enemies to hand with 30% proc chance
  {
    skillId: 39,
    pieceChars: ['霧'],
    trigger: { type: 'after_move' },
    conditions: [{ type: 'chance_roll', params: { procChance: 0.3 } }],
    effects: [
      {
        type: 'send_to_hand',
        target: { group: 'adjacent', selector: 'adjacent_enemy' },
        params: { handOwner: 'target_owner', maxTargets: 1 },
      },
    ],
  },

  // Skill #52: 刀 (Katana) - capture adjacent enemies after capture
  {
    skillId: 52,
    pieceChars: ['刀'],
    trigger: { type: 'after_capture' },
    conditions: [],
    effects: [
      {
        type: 'multi_capture',
        target: { group: 'adjacent', selector: 'adjacent_enemy' },
        params: { captureMode: 'adjacent_after_capture', offsets: [{ dr: 0, dc: -1 }, { dr: 0, dc: 1 }] },
      },
    ],
  },

  // Skill #54: 銃 (Gun) - forward chain capture
  {
    skillId: 54,
    pieceChars: ['銃'],
    trigger: { type: 'continuous_rule' },
    conditions: [],
    effects: [
      {
        type: 'multi_capture',
        target: { group: 'line', selector: 'front_enemy' },
        params: { captureMode: 'forward_chain' },
      },
    ],
  },

  // Skill #72: 獣 (Beast) - stun adjacent enemies on move
  {
    skillId: 72,
    pieceChars: ['獣'],
    trigger: { type: 'after_move' },
    conditions: [{ type: 'orthogonal_adjacent_enemy_exists', params: {} }],
    effects: [
      {
        type: 'apply_status',
        target: { group: 'adjacent', selector: 'adjacent_enemy' },
        params: {
          statusType: 'stun',
          durationTurns: 2,
          adjacency: 'orthogonal',
        },
      },
    ],
  },

  // Additional skills can be added here as needed
  // Format: { skillId, pieceChars, trigger, conditions, effects }
];

/**
 * Merges BFF skill definitions with canonical fallback definitions.
 * If a skill is already defined in BFF data, it takes precedence.
 */
export function mergeSkillDefinitions(
  bffDefinitions: SkillDefinition[],
  fallbackDefinitions: SkillDefinition[] = CANONICAL_SKILL_DEFINITIONS,
): SkillDefinition[] {
  const bffBySkillId = new Map(bffDefinitions.map((def) => [def.skillId, def]));

  // Start with BFF definitions
  const merged = [...bffDefinitions];

  // Add fallback definitions that aren't in BFF
  for (const fallback of fallbackDefinitions) {
    if (!bffBySkillId.has(fallback.skillId)) {
      merged.push(fallback);
    }
  }

  return merged;
}
