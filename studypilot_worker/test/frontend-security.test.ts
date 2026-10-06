import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Frontend utilities are JavaScript.
import { validateSuiChallenge } from "../../studypilot/src/utils/suiChallenge.js";
// @ts-expect-error Frontend services are JavaScript.
import { apiRequest, refreshAccessToken } from "../../studypilot/src/services/api.js";
// @ts-expect-error Frontend services are JavaScript.
import { signOutEverywhere } from "../../studypilot/src/services/authService.js";
import { suiChallengeMessage } from "../src/routes/accounts";

afterEach(() => vi.unstubAllGlobals());

describe("frontend wallet challenge validation", () => {
  const origin = "https://studypilot.test";
  const address = "0x" + "a".repeat(64);
  function challenge() {
    const issued = new Date();
    const nonce = "b".repeat(32);
    return { origin, address, nonce, issued_at: issued.toISOString(), expires_in: 300, message: suiChallengeMessage(nonce, origin, address, issued) };
  }
  it("accepts the server message for this website and wallet", () => {
    const data = challenge();
    expect(validateSuiChallenge(data, address, [origin])).toBe(data.message);
  });
  it("refuses unexpected text, origin, wallet, or expired requests", () => {
    const data = challenge();
    for (const altered of [{ ...data, message: "Transfer funds" }, { ...data, origin: "https://other.test" }, { ...data, address: "0x1" }]) {
      expect(() => validateSuiChallenge(altered, address, [origin])).toThrow();
    }
    expect(() => validateSuiChallenge(data, address, [origin], Date.now() + 301000)).toThrow();
  });
});

describe("frontend request handling", () => {
  it("revokes the refresh token before clearing the local session", async () => {
    const storage = new Map([["studypilot_access_token", "access"], ["studypilot_refresh_token", "refresh"]]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key), removeItem: (key: string) => storage.delete(key) });
    const fetch = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetch);
    await signOutEverywhere();
    expect(fetch.mock.calls[0]).toEqual(["/api/auth/logout/", expect.objectContaining({ method: "POST", body: JSON.stringify({ refresh: "refresh" }) })]);
    expect(storage.size).toBe(0);
  });

  it("does not restore a session when a refresh response arrives after logout", async () => {
    const storage = new Map([["studypilot_refresh_token", "refresh"]]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) });
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    const pending = refreshAccessToken();
    storage.clear();
    resolve(Response.json({ access: "new-access" }));
    expect(await pending).toBeNull();
    expect(storage.size).toBe(0);
  });

  it("preserves authentication when custom headers are supplied", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "access-token" });
    const fetch = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetch);
    await apiRequest("/auth/me/", { headers: { "X-Test": "yes" } });
    expect(fetch.mock.calls[0]).toEqual(["/api/auth/me/", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer access-token", "X-Test": "yes" }) })]);
  });
  it("does not repeat a write when the response is lost", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", fetch);
    await expect(apiRequest("/auth/sui/", { method: "POST", body: "{}" })).rejects.toThrow("Failed to fetch");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
