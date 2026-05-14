/**
 * LIFF (LINE Frontend Framework) wrapper.
 *
 * In production this would call into `window.liff` from the official SDK
 * (loaded via `<script src="https://static.line-scdn.net/liff/edge/2/sdk.js">`
 * with `LIFF_ID` from env). For the demo we implement a graceful fallback that:
 *   - returns the real `liff.getProfile()` if the SDK is present, OR
 *   - returns a mock profile (configurable via the login screen) so the app
 *     can be tested in any browser.
 *
 * The seed includes `lineUserId="U_demo_line_0000001"` on the demo patient so
 * the mock path always resolves to a known account.
 */
declare global {
  interface Window {
    liff?: {
      init: (cfg: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: (opts?: { redirectUri?: string }) => void;
      getProfile: () => Promise<{
        userId: string;
        displayName: string;
        pictureUrl?: string;
      }>;
      logout: () => void;
    };
  }
}

export type LiffProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

export type LiffMode = "real" | "mock";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? "";

export async function getLiffProfile(): Promise<{
  mode: LiffMode;
  profile: LiffProfile | null;
}> {
  if (typeof window === "undefined") return { mode: "mock", profile: null };
  if (!LIFF_ID || !window.liff) return { mode: "mock", profile: null };

  try {
    await window.liff.init({ liffId: LIFF_ID });
    if (!window.liff.isLoggedIn()) {
      window.liff.login({ redirectUri: window.location.href });
      return { mode: "real", profile: null };
    }
    const profile = await window.liff.getProfile();
    return { mode: "real", profile };
  } catch (err) {
    console.warn("[liff] init failed, falling back to mock:", err);
    return { mode: "mock", profile: null };
  }
}

export function liffLogout(): void {
  if (typeof window === "undefined") return;
  window.liff?.logout();
}
