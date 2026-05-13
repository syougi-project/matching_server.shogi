import type { IntegrationEventRepository } from '@/repositories/contracts';
import type { IntegrationEvent } from '@/types/domain';

export class InMemoryIntegrationEventRepository implements IntegrationEventRepository {
  private readonly events: IntegrationEvent[] = [];

  async save(event: IntegrationEvent) {
    this.events.push(event);
  }

  async listPending() {
    return this.events.filter((event) => event.deliveryStatus === 'pending');
  }
}
