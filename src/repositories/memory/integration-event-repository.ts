import type { IntegrationEventRepository } from '@/repositories/contracts';
import type { IntegrationEvent } from '@/types/domain';

export class InMemoryIntegrationEventRepository implements IntegrationEventRepository {
  private readonly events: IntegrationEvent[] = [];

  async save(event: IntegrationEvent) {
    this.events.push(event);
  }

  async listPending() {
    const now = Date.now();
    return this.events.filter(
      (event) =>
        event.deliveryStatus === 'pending' &&
        (!event.nextAttemptAt || new Date(event.nextAttemptAt).getTime() <= now),
    );
  }

  async markDelivered(eventId: string) {
    return this.update(eventId, { deliveryStatus: 'delivered', nextAttemptAt: null });
  }

  async markFailed(eventId: string, nextAttemptAt: string | null) {
    const found = this.events.find((event) => event.eventId === eventId);
    return this.update(eventId, {
      deliveryStatus: 'pending',
      attemptCount: found ? found.attemptCount + 1 : 1,
      nextAttemptAt,
    });
  }

  private async update(eventId: string, patch: Partial<IntegrationEvent>) {
    const index = this.events.findIndex((event) => event.eventId === eventId);
    if (index < 0) return false;
    this.events[index] = { ...this.events[index], ...patch };
    return true;
  }
}
