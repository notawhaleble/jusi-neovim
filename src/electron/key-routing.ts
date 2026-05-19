export function isWindowCommandFollower(key: string): boolean {
  return key.length === 1;
}

export function isTabKey(key: string): boolean {
  return key === "Tab";
}

export function isPhysicalKeyInput(input: { type?: string; code?: string }, code: string): boolean {
  return input.type === "keyDown" && input.code === code;
}

export function isCtrlAInput(input: { type?: string; control?: boolean; meta?: boolean; alt?: boolean; code?: string }): boolean {
  return isPhysicalKeyInput(input, "KeyA")
    && input.control === true
    && input.meta !== true
    && input.alt !== true;
}

export function shouldBlockShellAccelerator(input: { alt?: boolean; meta?: boolean; key?: string }): boolean {
  if (!input.meta) {
    return false;
  }

  const key = String(input.key ?? "").toLowerCase();
  if (key === "i" && input.alt) {
    return false;
  }
  return true;
}
