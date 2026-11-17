export interface DocumentTicket {
  bufferId: number;
  sessionId: string;
  incarnation: number;
  revision: number;
}

type Entry = { ticket: DocumentTicket; tail: Promise<unknown>; ready: Promise<boolean> };

/** Main-process authority. Serialize Neovim invalidation and commits per session. */
export class DocumentRevisions {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly invalidate: (ticket: DocumentTicket) => Promise<boolean>) {}

  advance(identity: Omit<DocumentTicket, "revision">): Promise<DocumentTicket | null> {
    let entry = this.entries.get(identity.sessionId);
    const ticket = { ...identity, revision: (entry?.ticket.revision ?? 0) + 1 };
    if (!entry) {
      entry = { ticket, tail: Promise.resolve(), ready: Promise.resolve(false) };
      this.entries.set(identity.sessionId, entry);
    }
    entry.ticket = ticket; // revoke synchronously, before any async work
    const ready = entry.tail.catch(() => {}).then(async () => {
      if (!this.isCurrent(ticket)) return false;
      return this.invalidate(ticket);
    });
    entry.ready = ready;
    entry.tail = ready;
    return ready.then(ok => ok && this.isCurrent(ticket) ? ticket : null);
  }

  async current(sessionId: string): Promise<DocumentTicket | null> {
    const entry = this.entries.get(sessionId);
    if (!entry) return null;
    const ticket = entry.ticket;
    return await entry.ready && this.isCurrent(ticket) ? { ...ticket } : null;
  }

  isCurrent(ticket: DocumentTicket): boolean {
    const current = this.entries.get(ticket.sessionId)?.ticket;
    return !!current && current.revision === ticket.revision && current.bufferId === ticket.bufferId
      && current.incarnation === ticket.incarnation;
  }

  async commit(ticket: DocumentTicket, apply: () => Promise<boolean>): Promise<boolean> {
    const entry = this.entries.get(ticket.sessionId);
    if (!entry || !this.isCurrent(ticket)) return false;
    const ready = entry.ready;
    const result = entry.tail.catch(() => {}).then(async () => {
      if (!this.isCurrent(ticket) || !await ready) return false;
      const accepted = await apply();
      return accepted && this.isCurrent(ticket);
    });
    entry.tail = result;
    return result;
  }

  forget(sessionId: string): void { this.entries.delete(sessionId); }
}
