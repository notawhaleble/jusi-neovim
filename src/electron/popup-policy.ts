export function popupUrlAllowed(value: string): boolean {
  try { return ["http:", "https:"].includes(new URL(value).protocol) || value === "about:blank"; }
  catch { return false; }
}
export class PopupPermit {
  private deadline = 0;
  private documentGrant = false;
  constructor(private readonly now: () => number = Date.now) {}
  arm(documentGrant = false): void {
    this.documentGrant = documentGrant;
    this.deadline = documentGrant ? 0 : this.now() + 15000;
  }
  reset(): void { this.deadline = 0; this.documentGrant = false; }
  take(url: string, foreground = false): boolean {
    if (this.documentGrant) return foreground && popupUrlAllowed(url);
    const active = this.deadline > this.now();
    this.reset();
    return active && popupUrlAllowed(url);
  }
}
