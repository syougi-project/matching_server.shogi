import { afterEach } from 'bun:test';
import { setSkillRngSeed } from '@/game/skill-runtime';

process.env.MATCHING_USE_IN_MEMORY_CATALOG = 'true';
process.env.MATCHING_BFF_BASE_URL = '';

const originalRandom = Math.random;

afterEach(() => {
  Math.random = originalRandom;
  setSkillRngSeed(0x12345678);
});
