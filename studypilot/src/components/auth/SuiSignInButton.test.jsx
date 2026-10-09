import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ account: null, wallet: null, prepare: vi.fn(), login: vi.fn(), complete: vi.fn(), navigate: vi.fn() }));
vi.mock("@mysten/dapp-kit", () => ({
  useCurrentAccount: () => state.account,
  useCurrentWallet: () => ({ currentWallet: state.wallet }),
  ConnectModal: ({ open }) => open ? <div role="dialog">Choose a wallet</div> : null,
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => state.navigate }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ completeAuth: state.complete }) }));
vi.mock("../../services/authService", () => ({ requestSuiChallenge: state.prepare, loginWithSui: state.login }));
vi.mock("../../services/api", () => ({ API_BASE_URL: "/api" }));
import SuiSignInButton from "./SuiSignInButton";

let root, container, onError;
function challenge() {
  const issued = new Date();
  const origin = window.location.origin;
  return { address: state.account.address, nonce: "a".repeat(32), origin, issued_at: issued.toISOString(), expires_in: 300,
    message: "Sign in to StudyPilot\n\nThis signature proves you own this wallet. It is free and does not create a transaction.\n\n" +
      `Website: ${origin}\nWallet: ${state.account.address}\nNonce: ${"a".repeat(32)}\nIssued at: ${issued.toISOString()}\nExpires at: ${new Date(issued.getTime() + 300000).toISOString()}` };
}
const render = () => act(async () => { root.render(<SuiSignInButton onError={onError} />); });
const button = () => [...container.querySelectorAll("button")].find((item) => !item.textContent.includes("Change wallet"));
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  state.account = { address: "0x" + "a".repeat(64) };
  state.wallet = { name: "Test Sui wallet", features: { "sui:signPersonalMessage": { signPersonalMessage: vi.fn(async () => ({ signature: "signed" })) } } };
  state.prepare.mockImplementation(async () => challenge());
  state.login.mockResolvedValue({ id: 1, username: "student", profile_completed: true });
  onError = vi.fn();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("Sui sign-in button", () => {
  it("prepares the challenge before clicking, invokes the wallet immediately, and completes login", async () => {
    await render();
    expect(state.prepare).toHaveBeenCalledTimes(1);
    expect(button().textContent).toContain("Continue with Sui");
    const sign = state.wallet.features["sui:signPersonalMessage"].signPersonalMessage;
    await act(async () => {
      button().click();
      expect(sign).toHaveBeenCalledTimes(1);
      expect(state.login).not.toHaveBeenCalled();
    });
    expect(state.login).toHaveBeenCalledWith({ address: state.account.address, signature: "signed", nonce: "a".repeat(32) });
    expect(state.complete).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(state.navigate).toHaveBeenCalledWith("/dashboard", { replace: true });
  });

  it("opens wallet selection before preparing an account challenge", async () => {
    state.account = null; state.wallet = null;
    await render();
    await act(async () => button().click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(state.prepare).not.toHaveBeenCalled();
  });

  it("offers a retry after a failed challenge instead of opening a wallet with unvalidated text", async () => {
    state.prepare.mockRejectedValueOnce(new Error("API unavailable"));
    await render();
    expect(button().textContent).toContain("Retry Sui sign-in");
    expect(state.wallet.features["sui:signPersonalMessage"].signPersonalMessage).not.toHaveBeenCalled();
    await act(async () => button().click());
    expect(button().textContent).toContain("Continue with Sui");
    expect(state.prepare).toHaveBeenCalledTimes(2);
  });

  it("refreshes the challenge after a cancelled signature and allows another attempt", async () => {
    state.wallet.features["sui:signPersonalMessage"].signPersonalMessage.mockRejectedValueOnce(new Error("User rejected"));
    await render();
    await act(async () => button().click());
    expect(onError).toHaveBeenCalledWith("Wallet signature was cancelled.");
    expect(state.prepare).toHaveBeenCalledTimes(2);
    expect(state.login).not.toHaveBeenCalled();
    await act(async () => button().click());
    expect(state.login).toHaveBeenCalledTimes(1);
  });

  it("routes new wallet accounts to username setup after sign-up", async () => {
    state.login.mockResolvedValueOnce({ id: 2, username: "", profile_completed: false });
    await render();
    await act(async () => button().click());
    expect(state.navigate).toHaveBeenCalledWith("/choose-username", { replace: true });
  });

  it("refuses an HTTP challenge on an HTTPS website", async () => {
    state.prepare.mockImplementationOnce(async () => ({ ...challenge(), origin: "http://studypilot.test" }));
    await render();
    expect(button().textContent).toContain("Retry Sui sign-in");
    expect(state.wallet.features["sui:signPersonalMessage"].signPersonalMessage).not.toHaveBeenCalled();
    expect(state.login).not.toHaveBeenCalled();
  });

  it("prevents rapid clicks from opening duplicate signature requests", async () => {
    await render();
    await act(async () => { button().click(); button().click(); });
    expect(state.wallet.features["sui:signPersonalMessage"].signPersonalMessage).toHaveBeenCalledTimes(1);
    expect(state.login).toHaveBeenCalledTimes(1);
  });
});
