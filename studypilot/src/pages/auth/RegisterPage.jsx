import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import Button from "../../components/common/Button";
import GoogleIcon from "../../components/common/GoogleIcon";
import Input from "../../components/common/Input";
import LogoMark from "../../components/common/LogoMark";
import { useAuth } from "../../context/AuthContext";
import { signInWithGoogle } from "../../services/authService";

function isEmail(value) {
  return /\S+@\S+\.\S+/.test(value);
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setFormError("");
    const next = {
      fullName: !form.fullName ? "Full name is required" : "",
      email: !form.email ? "Email is required" : !isEmail(form.email) ? "Enter a valid email" : "",
      password: !form.password ? "Password is required" : "",
      confirmPassword: form.password !== form.confirmPassword ? "Passwords must match" : ""
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setLoading(true);
    try {
      const user = await register({ ...form, role: "student" });
      navigate(user.profile_completed ? "/student/dashboard" : "/onboarding");
    } catch (error) {
      setFormError(error.message || "Registration failed. Please check the form.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setFormError("");
    try {
      await signInWithGoogle();
    } catch (error) {
      setFormError(error.message || "Google login could not start.");
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-md rounded-[2rem] border border-pilot-line bg-white p-8 shadow-pilot">
      <div className="mb-7 text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-3xl font-black text-pilot-ink">Create Account</h1>
        <p className="mt-1 text-sm text-pilot-muted">Join StudyPilot today</p>
      </div>
      <Button type="button" variant="secondary" className="mb-5 w-full" onClick={handleGoogleLogin}>
        <GoogleIcon />
        Continue with Google
      </Button>
      {formError && <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{formError}</p>}
      <div className="space-y-4">
        <Input label="Full Name" value={form.fullName} error={errors.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
        <Input label="Email" type="email" value={form.email} error={errors.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <Input label="Password" type="password" value={form.password} error={errors.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        <Input label="Confirm Password" type="password" value={form.confirmPassword} error={errors.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} />
      </div>
      <Button className="mt-6 w-full" disabled={loading}>{loading ? "Creating account..." : "Create Account"}</Button>
      <p className="mt-5 text-center text-sm text-pilot-muted">Already have an account? <Link to="/login" className="font-black text-pilot-blue">Login</Link></p>
    </form>
  );
}
