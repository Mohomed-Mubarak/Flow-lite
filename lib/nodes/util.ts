// Shared by IF, Filter, Switch.
export function compare(a: any, op: string, b: any): boolean {
  const num = (x: any) => Number(x);
  switch (op) {
    case 'equals': return String(a) === String(b);
    case 'notEquals': return String(a) !== String(b);
    case 'contains': return String(a).includes(String(b));
    case 'notContains': return !String(a).includes(String(b));
    case 'gt': return num(a) > num(b);
    case 'lt': return num(a) < num(b);
    case 'gte': return num(a) >= num(b);
    case 'lte': return num(a) <= num(b);
    case 'isEmpty': return a == null || a === '' || (Array.isArray(a) && !a.length);
    case 'isNotEmpty': return !(a == null || a === '' || (Array.isArray(a) && !a.length));
    case 'regex': return new RegExp(String(b)).test(String(a));
    default: return false;
  }
}
