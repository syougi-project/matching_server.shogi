import { jsonOk } from '@/lib/http';
import { nowIso } from '@/lib/time';

export function getHealth() {
  return jsonOk({ status: 'ok', timestamp: nowIso() });
}
