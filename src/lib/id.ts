export function createId(prefix: string) {
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `${prefix}_${suffix}`;
}
