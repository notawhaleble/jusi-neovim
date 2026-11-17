/** Session-scoped grants. Documents cannot access this store. */
export class MediaPermissions {
  private grants = new Map<string, Set<string>>();
  private generation = 0;
  constructor(private readonly ask: (site: string, types: string[]) => Promise<boolean>) {}
  list(): string[] {
    return [...this.grants].sort(([a], [b]) => a.localeCompare(b))
      .map(([site, types]) => `${site}: ${[...types].sort().join(", ")}`);
  }
  revoke(): void { this.generation++; this.grants.clear(); }
  check(contents: any, permission: string, requestingOrigin: string, details: any): boolean {
    const site = this.origin(requestingOrigin);
    return permission === "media" && !!contents && !contents.isDestroyed() && !!site
      && site === this.origin(contents.getURL()) && ["audio", "video"].includes(details?.mediaType)
      && (this.grants.get(site)?.has(details.mediaType) ?? false);
  }
  async request(contents: any, permission: string, details: any): Promise<boolean> {
    const site = this.origin(details?.requestingUrl);
    const types = details?.mediaTypes;
    if (permission !== "media" || !contents || contents.isDestroyed() || !details?.isMainFrame
      || !site || site !== this.origin(contents.getURL()) || !Array.isArray(types) || !types.length
      || types.some(type => !["audio", "video"].includes(type))) return false;
    if (types.every(type => this.grants.get(site)?.has(type))) return true;
    const generation = this.generation;
    // Even navigation away and back to the same origin invalidates the prompt.
    let navigated = false;
    const navigation = (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => {
      if (mainFrame && !inPlace) navigated = true;
    };
    contents.on("did-start-navigation", navigation);
    try {
      const allowed = await this.ask(site, [...new Set<string>(types)]);
      if (!allowed || generation !== this.generation || navigated || contents.isDestroyed()
        || this.origin(contents.getURL()) !== site) return false;
      const grants = this.grants.get(site) ?? new Set<string>();
      types.forEach(type => grants.add(type));
      this.grants.set(site, grants);
      return true;
    } catch { return false; }
    finally { contents.removeListener("did-start-navigation", navigation); }
  }
  private origin(url: string): string {
    try { const parsed = new URL(url); return parsed.protocol === "https:" ? parsed.origin : ""; }
    catch { return ""; }
  }
}
