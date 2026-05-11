export function isWindowCommandFollower(key: string): boolean {
  return /^[hjklwHJKLW<>+\-=|_]$/.test(key);
}

export function isTabKey(key: string): boolean {
  return key === "Tab";
}

export function shouldBlockShellAccelerator(input: { alt?: boolean; meta?: boolean; key?: string }): boolean {
  if (!input.meta) {
    return false;
  }

  const key = String(input.key ?? "").toLowerCase();
  if (key === "r" || (key === "i" && input.alt)) {
    return false;
  }
  return true;
}
