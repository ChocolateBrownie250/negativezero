import { promises as dns } from 'node:dns';

export class BlockedTargetError extends Error {
  constructor(message = 'blocked_target') {
    super(message);
    this.name = 'BlockedTargetError';
  }
}

const PRIVATE_RANGES_V4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  /^224\./,
  /^255\.255\.255\.255$/,
];

export function isPrivateIPv4(ip: string): boolean {
  return PRIVATE_RANGES_V4.some((re) => re.test(ip));
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) {
    return true;
  }
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return isPrivateIPv4(v4);
  }
  return false;
}

export async function assertPublicTarget(hostname: string): Promise<void> {
  if (!hostname) throw new BlockedTargetError();
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    throw new BlockedTargetError();
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new BlockedTargetError();
  }
  if (records.length === 0) throw new BlockedTargetError();
  for (const r of records) {
    if (r.family === 4 && isPrivateIPv4(r.address)) throw new BlockedTargetError();
    if (r.family === 6 && isPrivateIPv6(r.address)) throw new BlockedTargetError();
  }
}
