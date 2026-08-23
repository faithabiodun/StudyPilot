import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AtSign, Check, Loader2, X } from "lucide-react";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import LogoMark from "../../components/common/LogoMark";
import { useAuth } from "../../context/AuthContext";
import { checkUsernameAvailable, getStoredUser, setUsername } from "../../services/authService";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;

/**
 * Shown once, straight after a wallet or Google sign-up, because neither
 * carries a handle we could borrow. Email sign-ups pick one on the form and
 * never land here.
 */
export default function ChooseUsernamePage() {
  const navigate = useNavigate();
  const { user, completeAuth } = useAuth();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState({ state: "idle", reason: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const wellFormed = USERNAME_PATTERN.test(value.trim());

  useEffect(() => {
    if (!wellFormed) {
      setStatus({ state: "idle", reason: "" });
      return undefined;
    }
    setStatus({ state: "checking", reason: "" });
    // Debounced so we are not probing the API on every keystroke.
    const timer = window.setTimeout(async () => {
      const result = await checkUsernameAvailable(value.trim());
      setStatus({
        state: result?.available ? "available" : "taken",
        reason: result?.reason || ""
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [value, wellFormed]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const updated = await setUsername(value.trim());
      // The endpoint returns the fresh user; keep the stored tokens as they are.
      const stored = getStoredUser() || {};
      completeAuth({ ...stored, ...updated });
      navigate(updated?.profile_completed ? "/dashboard" : "/onboarding", { replace: true });
    } catch (requestError) {
      setError(requestError?.message || "Could not save that username.");
    } finally {
      setSaving(false);
    }
  };

  const hint = () => {
    if (!value) return "";
    if (!wellFormed) return "3 to 30 characters, letters, numbers or underscores only.";
    if (status.state === "checking") return "Checking availability...";
    if (status.state === "taken") return status.reason || "That username is already taken.";
    if (status.state === "available") return "That username is available.";
    return "";
  };

  const tone = status.state === "available" && wellFormed ? "text-pilot-green" : "text-pilot-muted";

  return (
    <form onSubmit={submit} className="mx-auto max-w-md rounded-[2rem] border border-pilot-line bg-white p-8 shadow-pilot">
      <div className="mb-7 text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-3xl font-black text-pilot-ink">Choose your username</h1>
        <p className="mt-1 text-sm text-pilot-muted">
          This is how StudyPilot will greet you. You cannot change it later, so pick one you like.
        </p>
      </div>

      {error && <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

      <Input
        label="Username"
        value={value}
        autoFocus
        maxLength={30}
        placeholder="e.g. faith_a"
        onChange={(event) => setValue(event.target.value.replace(/\s/g, ""))}
      />

      {value && (
        <p className={`mt-2 flex items-center gap-1.5 text-xs font-bold ${tone}`}>
          {status.state === "checking" && <Loader2 size={13} className="animate-spin" />}
          {status.state === "available" && wellFormed && <Check size={13} />}
          {(status.state === "taken" || !wellFormed) && <X size={13} className="text-red-500" />}
          {hint()}
        </p>
      )}

      <Button
        type="submit"
        icon={AtSign}
        className="mt-6 w-full"
        disabled={saving || !wellFormed || status.state !== "available"}
      >
        {saving ? "Saving..." : "Continue"}
      </Button>

      {user?.email?.endsWith("@sui.studypilot.local") && (
        <p className="mt-4 text-center text-xs font-semibold text-pilot-muted">
          Signed in with your Sui wallet.
        </p>
      )}
    </form>
  );
}
