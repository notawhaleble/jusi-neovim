import type { MediaPermissions } from "./media-permissions.js";
export type ProfileAction = "permissions" | "revoke" | "clear";
export interface ProfileSession {
  clearData(): Promise<void>;
  clearAuthCache(): Promise<void>;
  closeAllConnections(): Promise<void>;
}
/** Main-only profile operations; reservations block guest attachment during a change. */
export class BrowserProfiles {
  private busy = new Set<string>();
  constructor(private readonly getSession: (name: string) => ProfileSession,
    private readonly permissions: (session: ProfileSession) => MediaPermissions,
    private readonly hasGuests: (session: ProfileSession) => boolean,
    private readonly confirm: (name: string, action: ProfileAction) => Promise<boolean>) {}
  isBusy(name: string): boolean { return this.busy.has(name); }
  async run(name: string, action: ProfileAction): Promise<string> {
    if (typeof name !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(name)
      || !["permissions", "revoke", "clear"].includes(action)) throw new Error("Invalid profile action");
    if (this.busy.has(name)) throw new Error(`Profile ${name} already has an operation in progress`);
    const session = this.getSession(name);
    const permissions = this.permissions(session);
    if (action === "permissions") return `Profile ${name} session grants:\n${permissions.list().join("\n") || "None"}`;
    if (this.hasGuests(session)) throw new Error(`Close all browser buffers for profile ${name}, including parked tabs, then retry`);
    this.busy.add(name);
    try {
      if (!await this.confirm(name, action)) return `Profile ${name}: cancelled`;
      if (this.hasGuests(session)) throw new Error(`Profile ${name} acquired an active page; retry after closing it`);
      permissions.revoke();
      if (action === "clear") {
        // No success until all operations settle; failures can leave a partial clear.
        await session.clearData();
        await session.clearAuthCache();
        await session.closeAllConnections();
      }
      return `Profile ${name}: ${action === "clear" ? "browser data cleared and session grants revoked" : "session grants revoked"}`;
    } catch (error) {
      throw new Error(`Profile ${name}: ${action} did not complete; data or grants may be partially cleared. ${String(error)}`);
    } finally { this.busy.delete(name); }
  }
}
