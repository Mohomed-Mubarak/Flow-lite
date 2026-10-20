function field(expr: string, v: number, min: number, max: number): boolean {
  return expr.split(',').some((part) => {
    const [range, stepStr] = part.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;
    let lo = min;
    let hi = max;
    if (range !== '*') {
      const [a, b] = range.split('-');
      lo = parseInt(a, 10);
      hi = b !== undefined ? parseInt(b, 10) : stepStr ? max : lo;
    }
    return v >= lo && v <= hi && (v - lo) % step === 0;
  });
}

/** 5-field cron, evaluated in UTC. Supports *, lists, ranges, steps. */
export function cronMatches(expr: string, d = new Date()): boolean {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return false;
  const [mi, h, dom, mon, dow] = f;
  return (
    field(mi, d.getUTCMinutes(), 0, 59) &&
    field(h, d.getUTCHours(), 0, 23) &&
    field(dom, d.getUTCDate(), 1, 31) &&
    field(mon, d.getUTCMonth() + 1, 1, 12) &&
    field(dow, d.getUTCDay(), 0, 6)
  );
}
