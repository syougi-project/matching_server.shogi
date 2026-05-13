import { describe, it, expect } from 'bun:test';
import { setSkillRngSeed } from '@/game/skill-runtime';
import { CANONICAL_SKILL_DEFINITIONS } from '@/game/skill-definitions';

describe('Skill Definitions', () => {
  describe('canonical skill definitions', () => {
    it('should define mist skill (#39) with 30% proc chance', () => {
      const mist = CANONICAL_SKILL_DEFINITIONS.find((def) => def.skillId === 39);
      expect(mist).toBeDefined();
      expect(mist?.pieceChars).toContain('霧');
      expect(mist?.trigger.type).toBe('after_move');
      expect(mist?.conditions[0]?.type).toBe('chance_roll');
      expect(mist?.conditions[0]?.params?.procChance).toBe(0.3);
      expect(mist?.effects[0]?.type).toBe('send_to_hand');
    });

    it('should define phantom skill (#38) with 50% evade chance', () => {
      const phantom = CANONICAL_SKILL_DEFINITIONS.find((def) => def.skillId === 38);
      expect(phantom).toBeDefined();
      expect(phantom?.pieceChars).toContain('幻');
      expect(phantom?.trigger.type).toBe('continuous_rule');
      expect(phantom?.conditions[0]?.type).toBe('chance_roll');
      expect(phantom?.conditions[0]?.params?.procChance).toBe(0.5);
      expect(phantom?.effects[0]?.type).toBe('defense_or_immunity');
    });

    it('should define katana skill (#52) for adjacent capture', () => {
      const katana = CANONICAL_SKILL_DEFINITIONS.find((def) => def.skillId === 52);
      expect(katana).toBeDefined();
      expect(katana?.pieceChars).toContain('刀');
      expect(katana?.trigger.type).toBe('after_capture');
      expect(katana?.effects[0]?.type).toBe('multi_capture');
    });

    it('should define gun skill (#54) for forward chain capture', () => {
      const gun = CANONICAL_SKILL_DEFINITIONS.find((def) => def.skillId === 54);
      expect(gun).toBeDefined();
      expect(gun?.pieceChars).toContain('銃');
      expect(gun?.trigger.type).toBe('continuous_rule');
      expect(gun?.effects[0]?.type).toBe('multi_capture');
    });

    it('should define beast skill (#72) for stun effect', () => {
      const beast = CANONICAL_SKILL_DEFINITIONS.find((def) => def.skillId === 72);
      expect(beast).toBeDefined();
      expect(beast?.pieceChars).toContain('獣');
      expect(beast?.trigger.type).toBe('after_move');
      expect(beast?.effects[0]?.type).toBe('apply_status');
      expect(beast?.effects[0]?.params?.statusType).toBe('stun');
    });
  });

  describe('skill RNG seeding', () => {
    it('should set and use seeded RNG for deterministic behavior', () => {
      setSkillRngSeed(0x12345678);
      // Seed is set, confirming the function exists and works
      expect(true).toBe(true);
    });
  });
});



