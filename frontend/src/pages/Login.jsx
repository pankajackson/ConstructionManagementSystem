import React, { useState } from "react";
import { toast } from "sonner";
import { HardHat, EnvelopeSimple, ShieldCheck, ArrowLeft } from "@phosphor-icons/react";
import { API, errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email"); // email | otp
  const [busy, setBusy] = useState(false);
  const [devOtp, setDevOtp] = useState("");
  const [expiresIn, setExpiresIn] = useState(600);
  const { login } = useAuth();
  const navigate = useNavigate();

  const requestOtp = async (e) => {
    e?.preventDefault();
    if (!email) return;
    setBusy(true);
    try {
      const { data } = await API.post("/auth/request-otp", { email: email.trim().toLowerCase(), name: name || undefined });
      setStep("otp");
      setDevOtp(data.data.dev_otp || "");
      setExpiresIn(data.data.expires_in || 600);
      if (data.data.dev_otp) {
        toast.success(`OTP sent (dev): ${data.data.dev_otp}`);
      } else {
        toast.success("OTP sent to your email.");
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e?.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    try {
      const { data } = await API.post("/auth/verify-otp", { email: email.trim().toLowerCase(), code });
      login(data.data);
      toast.success(`Welcome, ${data.data.user.name || data.data.user.email}`);
      if ((data.data.organizations || []).length === 0) {
        navigate("/setup", { replace: true });
      } else if (data.data.organizations.length === 1) {
        navigate("/projects", { replace: true });
      } else {
        navigate("/switch-org", { replace: true });
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const runDemo = async (demoEmail) => {
    setEmail(demoEmail);
    setBusy(true);
    try {
      const { data } = await API.post("/auth/request-otp", { email: demoEmail });
      setStep("otp");
      const otp = data.data.dev_otp;
      setDevOtp(otp || "");
      if (otp) {
        // auto-verify
        const login1 = await API.post("/auth/verify-otp", { email: demoEmail, code: otp });
        login(login1.data.data);
        toast.success(`Signed in as ${login1.data.data.user.name}`);
        if ((login1.data.data.organizations || []).length === 1) {
          navigate("/projects", { replace: true });
        } else {
          navigate("/switch-org", { replace: true });
        }
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-muted">
      {/* Left panel */}
      <div className="hidden lg:flex blueprint text-white p-10 flex-col justify-between relative overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-safety border-2 border-white flex items-center justify-center">
            <HardHat size={28} weight="fill" color="#09090b" />
          </div>
          <div>
            <div className="heading text-4xl leading-none">CONSTRUCT<span className="text-safety">OS</span></div>
            <div className="text-xs uppercase tracking-widest text-zinc-400 mt-1">Site Operations Platform</div>
          </div>
        </div>
        <div className="relative z-10">
          <h1 className="heading text-6xl leading-[0.9] uppercase mb-4">
            Run your <span className="text-safety">site</span><br/>from your <span className="text-safety">pocket.</span>
          </h1>
          <p className="text-zinc-300 text-lg max-w-md">
            Daily logs, task tracking, and site issues — all in one place. Built for Indian construction crews.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4 max-w-md">
            {[
              ["Tasks", "Kanban + priority"],
              ["Daily Logs", "1-tap submit"],
              ["Issues", "Safety first"],
            ].map(([a, b]) => (
              <div key={a} className="border-2 border-white/30 p-3">
                <div className="heading text-2xl">{a}</div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-400">{b}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-500">© {new Date().getFullYear()} ConstructOS · IST</div>
      </div>

      {/* Right panel — form */}
      <div className="flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-6 flex items-center gap-2">
            <div className="w-9 h-9 bg-ink border-2 border-ink flex items-center justify-center">
              <HardHat size={20} weight="fill" color="#fbbf24" />
            </div>
            <div className="heading text-2xl">CONSTRUCT<span className="text-safety">OS</span></div>
          </div>

          <div className="card-brut p-6">
            {step === "email" && (
              <form onSubmit={requestOtp} className="space-y-4" data-testid="login-email-form">
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1">Step 1 / 2</div>
                  <h2 className="heading text-4xl uppercase">Sign in</h2>
                  <p className="text-sm text-zinc-600 mt-1">We'll email you a 6-digit code. No password.</p>
                </div>

                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest">Email</span>
                  <input
                    type="email"
                    required
                    autoFocus
                    className="input-brut mt-1"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    data-testid="login-email-input"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest">Your Name <span className="text-zinc-500 normal-case">(if new)</span></span>
                  <input
                    type="text"
                    className="input-brut mt-1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ravi Kumar"
                    data-testid="login-name-input"
                  />
                </label>

                <button className="btn-brut safety w-full" disabled={busy} data-testid="login-request-otp-btn">
                  {busy ? "Sending..." : "Send OTP"}
                </button>

                <div className="border-t-2 border-ink pt-4">
                  <div className="text-[11px] uppercase tracking-widest text-zinc-500 mb-2">Try the demo</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["admin@demo.com", "Admin"],
                      ["pm@demo.com", "PM"],
                      ["engineer@demo.com", "Engineer"],
                      ["viewer@demo.com", "Viewer"],
                    ].map(([e, r]) => (
                      <button
                        key={e}
                        type="button"
                        className="btn-brut secondary text-xs h-10"
                        onClick={() => runDemo(e)}
                        data-testid={`demo-login-${r.toLowerCase()}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={verify} className="space-y-4" data-testid="login-otp-form">
                <button
                  type="button"
                  className="text-xs uppercase tracking-widest flex items-center gap-1 text-zinc-600 hover:text-ink"
                  onClick={() => { setStep("email"); setCode(""); setDevOtp(""); }}
                  data-testid="otp-back-btn"
                >
                  <ArrowLeft size={14} weight="bold" /> Change email
                </button>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1">Step 2 / 2</div>
                  <h2 className="heading text-4xl uppercase">Enter code</h2>
                  <p className="text-sm text-zinc-600 mt-1">
                    Sent to <span className="font-bold">{email}</span>. Expires in {Math.round(expiresIn / 60)}m.
                  </p>
                </div>
                {devOtp && (
                  <div className="bg-safety/20 border-2 border-safety p-2 text-sm" data-testid="dev-otp-hint">
                    <div className="text-[10px] uppercase tracking-widest">Dev mode OTP</div>
                    <div className="mono text-2xl font-bold tracking-widest">{devOtp}</div>
                  </div>
                )}
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest">6-digit code</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    maxLength={6}
                    className="input-brut mt-1 mono text-2xl tracking-[0.5em] text-center"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    data-testid="otp-code-input"
                  />
                </label>
                <button className="btn-brut safety w-full" disabled={busy || code.length !== 6} data-testid="otp-verify-btn">
                  {busy ? "Verifying..." : "Verify & Sign In"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
