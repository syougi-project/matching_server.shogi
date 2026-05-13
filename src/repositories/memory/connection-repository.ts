import type { ConnectionRepository } from '@/repositories/contracts';
import type { ConnectionRecord } from '@/types/domain';

export class InMemoryConnectionRepository implements ConnectionRepository {
  private readonly byConnectionId = new Map<string, ConnectionRecord>();
  private readonly byUserId = new Map<string, string>();

  async save(connection: ConnectionRecord) {
    this.byConnectionId.set(connection.connectionId, connection);
    this.byUserId.set(connection.userId, connection.connectionId);
  }

  async findByConnectionId(connectionId: string) {
    return this.byConnectionId.get(connectionId) ?? null;
  }

  async findByUserId(userId: string) {
    const connectionId = this.byUserId.get(userId);
    if (!connectionId) return null;
    return this.byConnectionId.get(connectionId) ?? null;
  }
}
