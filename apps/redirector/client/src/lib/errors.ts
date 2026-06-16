const LABELS: Record<string, string> = {
  invalid_target: 'Enter a valid http(s) URL.',
  validation: 'Enter a destination URL.',
};

// Map a server error code (optionally suffixed with the " (NNN)" HTTP status
// the api layer appends) to a human-readable message, falling back to
// `fallback` for anything unrecognized.
export function redirectErrorLabel(message: string, fallback: string): string {
  const key = message.replace(/\s\(\d+\)$/, '');
  return LABELS[key] ?? fallback;
}
