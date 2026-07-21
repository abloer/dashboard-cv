import { analysisServerBaseUrl } from "@/lib/noHelmetAnalysis";

// Session exchange key. Baked into the frontend build so the login page can
// exchange a role token for an httpOnly session cookie. This is NOT a strong
// secret once shipped in the bundle — the real credential is the role token
// (24-byte random, rate-limited at /auth/session). Replaced by proper user
// auth in the commercial phase (multi-tenancy).
const exchangeKey =
  (import.meta.env.VITE_AUTH_SESSION_EXCHANGE_KEY as string | undefined) || "";

export interface LoginResult {
  ok: boolean;
  role?: string;
  message?: string;
}

export async function loginWithToken(token: string): Promise<LoginResult> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, message: "Access token belum diisi." };
  }
  try {
    const response = await fetch(`${analysisServerBaseUrl}/auth/session`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-session-exchange-key": exchangeKey,
      },
      body: JSON.stringify({ token: trimmed }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      return { ok: false, message: payload?.message || "Login gagal." };
    }
    return { ok: true, role: payload.role };
  } catch {
    return { ok: false, message: "Tidak bisa menghubungi server dashboard." };
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${analysisServerBaseUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // best-effort; cookie clears server-side, ignore network errors
  }
}
