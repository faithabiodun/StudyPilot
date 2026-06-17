import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { checkBackendHealth, exchangeSupabaseGoogleToken } from "../../services/authService";

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { completeAuth } = useAuth();
  const [status, setStatus] = useState("Verifying your Google sign in...");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function finishLogin() {
      try {
        if (!isSupabaseConfigured || !supabase) {
          throw new Error("Google sign in is not available right now. Please use your email and password.");
        }
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (import.meta.env.DEV) {
          console.log("Supabase session exists", Boolean(data?.session));
        }
        const accessToken = data?.session?.access_token;
        if (import.meta.env.DEV) {
          console.log("Supabase access token exists", Boolean(accessToken));
        }
        if (!accessToken) throw new Error("Google session was not found. Please try again.");

        if (mounted) setStatus("Checking StudyPilot backend...");
        await checkBackendHealth();

        if (mounted) setStatus("Creating your StudyPilot session...");
        const user = await exchangeSupabaseGoogleToken(accessToken);
        completeAuth(user);

        if (mounted) setStatus("Redirecting to your dashboard...");
        navigate(user.profile_completed ? "/dashboard" : "/onboarding", { replace: true });
      } catch (callbackError) {
        if (!mounted) return;
        setError(callbackError.message || "Google login could not be completed.");
      }
    }

    finishLogin();
    return () => {
      mounted = false;
    };
  }, [completeAuth, navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-pilot-sky px-5">
      <section className="w-full max-w-md rounded-[2rem] border border-pilot-line bg-white p-8 text-center shadow-pilot">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-pilot-soft text-pilot-blue">
          {error ? <ShieldCheck size={26} /> : <Loader2 className="animate-spin" size={26} />}
        </div>
        <h1 className="mt-5 text-2xl font-black text-pilot-ink">Google Sign In</h1>
        <p className="mt-2 text-sm leading-6 text-pilot-muted">{error || status}</p>
        {!error && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-pilot-blue">
            <CheckCircle size={16} />
            Secure sign in
          </div>
        )}
        {error && (
          <Link to="/login" className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-pilot-blue px-4 py-2.5 text-sm font-bold text-white shadow-glow transition hover:bg-blue-700 active:scale-[0.98]">
            Back to Login
          </Link>
        )}
      </section>
    </main>
  );
}
