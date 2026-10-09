import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConnectModal, useCurrentAccount, useCurrentWallet } from "@mysten/dapp-kit";
import Button from "../common/Button";
import SuiLogo from "../common/SuiLogo";
import { useAuth } from "../../context/AuthContext";
import { loginWithSui, requestSuiChallenge } from "../../services/authService";
import { postAuthPath } from "../../utils/user";
import { API_BASE_URL } from "../../services/api";
import { validateSuiChallenge } from "../../utils/suiChallenge";
import { signWalletPersonalMessage, supportsSuiSignIn } from "../../utils/suiWallet";

/**
 * Sign in by proving ownership of a Sui wallet.
 *
 * The wallet signs a server-issued nonce, never a transaction, so this costs
 * nothing and moves no funds. The backend verifies the signature and wallet
 * identity together, so it cannot be paired with someone else's address.
 */
export default function SuiSignInButton({ label = "Continue with Sui", onError }) {
  const account = useCurrentAccount();
  const { currentWallet } = useCurrentWallet();
  const { completeAuth } = useAuth();
  const navigate = useNavigate();
  const [connectOpen, setConnectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [challengeState, setChallengeState] = useState({ status: "idle", data: null });
  const [attempt, setAttempt] = useState(0);
  const signing = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const allowedOrigins = () => [window.location.origin, new URL(API_BASE_URL, window.location.origin).origin];

  useEffect(() => {
    let active = true;
    let timer;
    setChallengeState({ status: "idle", data: null });
    if (!account?.address || !currentWallet) return;
    const prepare = async () => {
      setChallengeState({ status: "loading", data: null });
      try {
        const challenge = await requestSuiChallenge(account.address);
        validateSuiChallenge(challenge, account.address, allowedOrigins());
        if (!active) return;
        setChallengeState({ status: "ready", data: challenge });
        timer = window.setTimeout(prepare, 240000);
      } catch (error) {
        if (!active) return;
        setChallengeState({ status: "error", data: null });
        onErrorRef.current?.(error.message || "Could not prepare wallet sign-in. Please try again.");
      }
    };
    prepare();
    return () => { active = false; window.clearTimeout(timer); };
  }, [account?.address, currentWallet, attempt]);

  const report = (message) => {
    if (onError) onError(message);
  };

  const signIn = async () => {
    if (signing.current) return;
    if (!account?.address || !currentWallet) {
      report("");
      setConnectOpen(true);
      return;
    }
    if (!challengeState.data) {
      report("");
      setAttempt((value) => value + 1);
      return;
    }
    const challenge = challengeState.data;
    let message;
    try { message = validateSuiChallenge(challenge, account.address, allowedOrigins()); }
    catch {
      report("Your sign-in request expired. Preparing a new one; please try again.");
      setAttempt((value) => value + 1);
      return;
    }
    signing.current = true;
    setBusy(true);
    report("");
    try {
      const { signature } = await signWalletPersonalMessage(currentWallet, account, new TextEncoder().encode(message));
      const user = await loginWithSui({
        address: account.address,
        signature,
        nonce: challenge.nonce
      });
      completeAuth(user);
      navigate(postAuthPath(user), { replace: true });
    } catch (error) {
      // A user dismissing the wallet popup is a cancellation, not a failure.
      const message = String(error?.message || "");
      if (/reject|denied|cancel/i.test(message)) {
        report("Wallet signature was cancelled.");
      } else {
        report(message || "Could not sign in with Sui.");
      }
    } finally {
      signing.current = false;
      setBusy(false);
      setAttempt((value) => value + 1);
    }
  };

  return (
    <>
      <Button type="button" variant="secondary" className="mb-5 w-full" onClick={signIn} disabled={busy || challengeState.status === "loading"}>
        <SuiLogo size={18} />
        {busy ? "Waiting for your wallet..." : challengeState.status === "loading" ? "Preparing wallet sign-in..." : challengeState.status === "error" ? "Retry Sui sign-in" : account?.address ? label : "Connect Sui Wallet"}
      </Button>
      <p className="mb-5 -mt-3 text-center text-xs text-slate-500">
        Sign a message to verify your wallet. No transaction, fees, or access to your funds.
      </p>
      {account?.address && (
        <p className="mb-4 -mt-3 text-center text-xs text-slate-500">
          {currentWallet?.name}: {account.address.slice(0, 6)}...{account.address.slice(-4)}. Click above to finish signing in.
          <button type="button" className="ml-2 underline" disabled={busy} onClick={() => setConnectOpen(true)}>Change wallet</button>
        </p>
      )}
      <ConnectModal
        trigger={<span />}
        open={connectOpen}
        onOpenChange={setConnectOpen}
        walletFilter={supportsSuiSignIn}
      />
    </>
  );
}
