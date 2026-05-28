import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getStoredUser, loginWithEmail, registerWithEmail, signOutEverywhere } from "../services/authService";
import { sendActivityHeartbeat } from "../services/dashboardService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());

  const login = async (payload) => {
    const nextUser = await loginWithEmail(payload);
    setUser(nextUser);
    return nextUser;
  };

  const register = async (payload) => {
    const nextUser = await registerWithEmail(payload);
    setUser(nextUser);
    return nextUser;
  };

  const completeAuth = (nextUser) => {
    setUser(nextUser);
    return nextUser;
  };

  const logout = async () => {
    await signOutEverywhere();
    setUser(null);
  };

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    const beat = () => {
      if (!active || document.hidden) return;
      sendActivityHeartbeat().catch(() => {});
    };
    beat();
    const timer = window.setInterval(beat, 120000);
    window.addEventListener("focus", beat);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", beat);
    };
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      role: user?.role,
      isAuthenticated: Boolean(user),
      login,
      register,
      completeAuth,
      logout
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
