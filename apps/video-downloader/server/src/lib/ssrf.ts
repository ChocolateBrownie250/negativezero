import { promises as dns } from 'node:dns';
import net from 'node:net';

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
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // 100.64.0.0/10 CGNAT
  /^224\./,
  /^255\.255\.255\.255$/,
];

export function isPrivateIPv4(ip: string): boolean {
  return PRIVATE_RANGES_V4.some((re) => re.test(ip));
}

// Convert two 16-bit hex groups (the low 32 bits of an IPv6 address) into a
// dotted-quad IPv4 string. Used to normalise IPv4-mapped (::ffff:0:0/96) and
// NAT64 (64:ff9b::/96) addresses down to their embedded IPv4 for v4 checks.
function hexGroupsToV4(high: number, low: number): string {
  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join('.');
}

// Returns the embedded IPv4 (dotted-quad) for IPv4-mapped or NAT64 addresses,
// or null if the address does not embed an IPv4 address.
function embeddedV4(ip: string): string | null {
  const lower = ip.toLowerCase();

  // Dotted form: ::ffff:127.0.0.1 or 64:ff9b::127.0.0.1
  const dotted = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted && (lower.startsWith('::ffff:') || lower.startsWith('64:ff9b:'))) {
    return dotted[1];
  }

  // Hex form. Expand the address to its eight 16-bit groups and inspect the
  // prefix + the low 32 bits.
  const groups = expandIPv6(lower);
  if (!groups) return null;

  // IPv4-mapped: ::ffff:a.b.c.d -> groups [0,0,0,0,0,0xffff,hi,lo]
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  ) {
    return hexGroupsToV4(groups[6], groups[7]);
  }

  // NAT64 well-known prefix 64:ff9b::/96 -> groups [0x64,0xff9b,0,0,0,0,hi,lo]
  if (
    groups[0] === 0x64 &&
    groups[1] === 0xff9b &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0
  ) {
    return hexGroupsToV4(groups[6], groups[7]);
  }

  return null;
}

// Expand a textual IPv6 address into exactly eight 16-bit integer groups.
// Returns null if the address is not parseable as IPv6.
function expandIPv6(ip: string): number[] | null {
  if (net.isIPv6(ip) !== true) return null;
  let head = ip;
  let embedded: string | null = null;

  // Handle an embedded dotted-quad tail (e.g. ::ffff:1.2.3.4).
  const dotted = head.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    embedded = dotted[1];
    head = head.slice(0, head.length - embedded.length);
  }

  const [left, right, extra] = head.split('::');
  if (extra !== undefined) return null;

  const leftParts = left ? left.split(':').filter((p) => p !== '') : [];
  const rightParts =
    right !== undefined && right ? right.split(':').filter((p) => p !== '') : [];

  const tail: string[] = [];
  if (embedded) {
    const octets = embedded.split('.').map((n) => Number(n));
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    tail.push(((octets[0] << 8) | octets[1]).toString(16));
    tail.push(((octets[2] << 8) | octets[3]).toString(16));
  }

  const explicit = [...leftParts, ...rightParts, ...tail];

  let groups: string[];
  if (head.includes('::')) {
    const fill = 8 - explicit.length;
    if (fill < 0) return null;
    groups = [...leftParts, ...Array(fill).fill('0'), ...rightParts, ...tail];
  } else {
    groups = explicit;
  }

  if (groups.length !== 8) return null;
  const nums = groups.map((g) => parseInt(g, 16));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;

  // Normalise IPv4-mapped / NAT64 addresses to their embedded IPv4 and run the
  // v4 checks against it.
  const v4 = embeddedV4(lower);
  if (v4) return isPrivateIPv4(v4);

  const groups = expandIPv6(lower);
  if (groups) {
    const first = groups[0];
    // Loopback / unspecified already handled above via expansion fallbacks.
    if (groups.every((g) => g === 0)) return true; // ::
    if (
      groups[0] === 0 &&
      groups[1] === 0 &&
      groups[2] === 0 &&
      groups[3] === 0 &&
      groups[4] === 0 &&
      groups[5] === 0 &&
      groups[6] === 0 &&
      groups[7] === 1
    ) {
      return true; // ::1
    }
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    return false;
  }

  // Fallback to prefix heuristics if expansion failed for some reason.
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) {
    return true;
  }
  return false;
}

// Validate a single resolved IP address (v4 or v6) and throw if it is private,
// loopback, link-local, multicast, or otherwise non-public.
export function assertPublicAddress(address: string): void {
  if (net.isIPv4(address)) {
    if (isPrivateIPv4(address)) throw new BlockedTargetError();
    return;
  }
  if (net.isIPv6(address)) {
    if (isPrivateIPv6(address)) throw new BlockedTargetError();
    return;
  }
  // Not a recognisable IP literal - refuse to connect.
  throw new BlockedTargetError();
}

function assertPublicHostname(hostname: string): void {
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
}

// Resolve a hostname once, assert every returned address is public, and return
// the vetted addresses so the caller can PIN the connection to one of them
// (defeating DNS-rebinding / TOCTOU). If the hostname is already an IP literal
// it is validated directly without a DNS lookup.
export async function resolvePublicTarget(
  hostname: string,
): Promise<{ address: string; family: number }[]> {
  assertPublicHostname(hostname);

  if (net.isIP(hostname) !== 0) {
    assertPublicAddress(hostname);
    return [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }];
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new BlockedTargetError();
  }
  if (records.length === 0) throw new BlockedTargetError();
  for (const r of records) {
    assertPublicAddress(r.address);
  }
  return records;
}

export async function assertPublicTarget(hostname: string): Promise<void> {
  await resolvePublicTarget(hostname);
}
