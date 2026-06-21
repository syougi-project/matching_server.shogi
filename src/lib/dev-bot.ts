export const DEV_BOT_USER_ID = '__dev_bot__';

export function isDevBotUserId(userId: string): boolean {
  return userId === DEV_BOT_USER_ID;
}

export function isDevBotMatch(match: { playerBlackUserId: string; playerWhiteUserId: string }): boolean {
  return isDevBotUserId(match.playerBlackUserId) || isDevBotUserId(match.playerWhiteUserId);
}
