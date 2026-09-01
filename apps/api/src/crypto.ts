export function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateApiKeyToken(): string {
  return `ask_${randomHex(24)}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashKey(token: string, pepper: string): Promise<string> {
  return sha256Hex(`${pepper}:${token}`);
}

export async function hashIp(ip: string, pepper: string): Promise<string> {
  return sha256Hex(`${pepper}:signup:${ip}`);
}

export async function hmacSha256Base64(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export function timingSafeEqualBase64(a: string, b: string): boolean {
  try {
    const left = Uint8Array.from(atob(a), (c) => c.charCodeAt(0));
    const right = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i += 1) {
      diff |= left[i]! ^ right[i]!;
    }
    return diff === 0;
  } catch {
    return false;
  }
}
