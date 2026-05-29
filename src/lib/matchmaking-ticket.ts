import { createHmac, timingSafeEqual } from 'node:crypto';
import { DomainError } from '@/lib/errors';

export type MatchmakingTicketClaims = {
  userId: string;
  displayName: string;
  rating: number;
  exp: number;
};

export function verifyMatchmakingTicket(
  ticket: string,
  secret: string,
  nowMs = Date.now(),
): MatchmakingTicketClaims {
  const [payloadPart, signaturePart] = ticket.split('.');
  if (!payloadPart || !signaturePart) {
    throw new DomainError('INVALID_TICKET', 'Matchmaking ticket is malformed.');
  }

  const expected = sign(payloadPart, secret);
  if (!constantTimeEqual(signaturePart, expected)) {
    throw new DomainError('INVALID_TICKET', 'Matchmaking ticket signature is invalid.');
  }

  let claims: MatchmakingTicketClaims;
  try {
    claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    throw new DomainError('INVALID_TICKET', 'Matchmaking ticket payload is invalid.');
  }

  if (!claims.userId || !Number.isFinite(claims.exp)) {
    throw new DomainError('INVALID_TICKET', 'Matchmaking ticket is missing required claims.');
  }
  if (claims.exp * 1000 <= nowMs) {
    throw new DomainError('TICKET_EXPIRED', 'Matchmaking ticket has expired.');
  }

  return {
    userId: claims.userId,
    displayName: claims.displayName?.trim() || claims.userId,
    rating: normalizeRating(claims.rating),
    exp: claims.exp,
  };
}

function sign(payloadPart: string, secret: string) {
  return createHmac('sha256', secret).update(payloadPart).digest('base64url');
}

function constantTimeEqual(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(actualBytes, expectedBytes);
}

function normalizeRating(value: unknown) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return 0;
  return Math.max(0, Math.floor(rating));
}
