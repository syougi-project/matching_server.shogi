import type { ServerContext } from '@/server/context';
import { buildGameFinishedMessage } from '@/server/handlers/ws-message';
import type { MatchSession } from '@/types/domain';

type ReconnectTimerRuntime = {
  reconnectTimersByMatchId: Map<string, ReturnType<typeof setTimeout>>;
};

type BroadcastFinished = (match: MatchSession) => Promise<void>;

export function cancelReconnectForfeitTimer(runtime: ReconnectTimerRuntime, matchId: string) {
  const timer = runtime.reconnectTimersByMatchId.get(matchId);
  if (!timer) return;
  clearTimeout(timer);
  runtime.reconnectTimersByMatchId.delete(matchId);
}

export function scheduleReconnectForfeitTimer(
  runtime: ReconnectTimerRuntime,
  context: ServerContext,
  match: MatchSession,
  broadcastFinished: BroadcastFinished,
) {
  const deadlineAt = match.reconnectDeadlineAt;
  if (!deadlineAt) return;

  cancelReconnectForfeitTimer(runtime, match.matchId);

  const delayMs = Math.max(0, Date.parse(deadlineAt) - Date.now());
  const timer = setTimeout(() => {
    runtime.reconnectTimersByMatchId.delete(match.matchId);
    void finalizeReconnectForfeit(context, match.matchId, broadcastFinished);
  }, delayMs);
  runtime.reconnectTimersByMatchId.set(match.matchId, timer);
}

async function finalizeReconnectForfeit(
  context: ServerContext,
  matchId: string,
  broadcastFinished: BroadcastFinished,
) {
  try {
    const finished = await context.services.gameCommand.abortExpiredReconnect(matchId);
    if (finished?.status !== 'finished') return;
    await broadcastFinished(finished);
    await context.services.outboxWorker.runOnce();
  } catch (error) {
    console.warn(
      `[matching_server] failed to finalize reconnect forfeit for ${matchId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

export function buildReconnectForfeitBroadcast(match: MatchSession) {
  return buildGameFinishedMessage(match);
}
