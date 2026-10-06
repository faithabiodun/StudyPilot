import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConnectModal, useCurrentAccount, useSignPersonalMessage } from "@mysten/dapp-kit";
import Button from "../common/Button";
import SuiLogo from "../common/SuiLogo";
import { useAuth } from "../../context/AuthContext";
import { loginWithSui, requestSuiChallenge } from "../../services/authService";
import { postAuthPath } from "../../utils/user";
import { API_BASE_URL } from "../../services/api";
import { validateSuiChallenge } from "../../utils/suiChallenge";

/**
 * Sign in by proving ownership of a Sui wallet.
 *
 * The wallet signs a server-issued nonce, never a transaction, so this costs
 * nothing and moves no funds. The backend re-derives the address from the
 * signature's public key, so a signature cannot be paired with someone else's
 * address.
 */
export default function SuiSignInButton({ label = "Continue with Sui", onError }) {
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { completeAuth } = useAuth();
  const navigate = useNavigate();
  const [connectOpen, setConnectOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const report = (message) => {
    if (onError) onError(message);
  };

  const signIn = async () => {
    if (!account?.address) {
      setConnectOpen(true);
      return;
    }
    setBusy(true);
    report("");
    try {
      const challenge = await requestSuiChallenge(account.address);
      const message = validateSuiChallenge(challenge, account.address, [
        window.location.origin, new URL(API_BASE_URL, window.location.origin).origin
      ]);
      const { signature } = await signPersonalMessage({
        account,
        message: new TextEncoder().encode(message)
      });
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
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="secondary" className="mb-5 w-full" onClick={signIn} disabled={busy}>
        <SuiLogo size={18} />
        {busy ? "Waiting for your wallet..." : account?.address ? label : "Connect Sui Wallet"}
      </Button>
      <p className="mb-5 -mt-3 text-center text-xs text-slate-500">
        Sign a message to verify your wallet. No transaction, fees, or access to your funds.
      </p>
      <ConnectModal
        trigger={<span />}
        open={connectOpen}
        onOpenChange={setConnectOpen}
      />
    </>
  );
}
