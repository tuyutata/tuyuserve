export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = Uint8Array.from(
    typeof value === 'string' ? new TextEncoder().encode(value) : value,
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
