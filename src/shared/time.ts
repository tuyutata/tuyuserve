export function nowMs(): number {
  return Date.now();
}

export function millisecondsFromNow(seconds: number): number {
  return nowMs() + seconds * 1000;
}

