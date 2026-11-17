export function popupUrlAllowed(value: string): boolean {
  try { return ["http:", "https:"].includes(new URL(value).protocol) || value === "about:blank"; }
  catch { return false; }
}
export class PopupPermit {
  private deadline = 0;
  constructor(private readonly now: () => number = Date.now) {}
  arm(): void { this.deadline = this.now() + 15000; }
  reset(): void { this.deadline = 0; }
  take(url: string): boolean {
    const active = this.deadline > this.now();
    this.reset();
    return active && popupUrlAllowed(url);
  }
}
