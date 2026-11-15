"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mark } from "@/components/Shell";
import { Notice } from "@/components/ui";
import { CLOUD_ENABLED } from "@/lib/config";
import { supabase } from "@/lib/store";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!CLOUD_ENABLED) {
    return (
      <div className="min-h-[100dvh] grid place-items-center p-6">
        <div className="max-w-sm text-center"><p>Accounts aren't set up for this build. You're using this-device mode.</p><a className="btn-primary mt-4" href="./../">Open ContentPilot</a></div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const sb = supabase()!;
    try {
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        location.assign((process.env.NEXT_PUBLIC_BASE_PATH || "") + "/");
      } else if (mode === "up") {
        const { data, error } = await sb.auth.signUp({ email, password: pw });
        if (error) throw error;
        if (data.session) location.assign((process.env.NEXT_PUBLIC_BASE_PATH || "") + "/");
        else setMsg({ kind: "info", text: "Check your email to confirm your account, then sign in." });
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + (process.env.NEXT_PUBLIC_BASE_PATH || "") + "/login/" });
        if (error) throw error;
        setMsg({ kind: "info", text: "If that email has an account, a reset link is on its way." });
      }
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally { setBusy(false); }
    void router;
  }

  return (
    <div className="min-h-[100dvh] grid place-items-center p-6 layers">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2"><Mark /><span className="font-display text-2xl font-bold">ContentPilot</span></div>
        <h1 className="text-xl font-semibold">{mode === "in" ? "Sign in" : mode === "up" ? "Create your account" : "Reset password"}</h1>
        <label><span className="label">Email</span><input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {mode !== "reset" && <label><span className="label">Password</span><input className="field" type="password" autoComplete={mode === "up" ? "new-password" : "current-password"} minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /></label>}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button className="btn-primary" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}</button>
        <div className="flex justify-between text-sm">
          <button type="button" className="text-teal" onClick={() => setMode(mode === "up" ? "in" : "up")}>{mode === "up" ? "I have an account" : "Create an account"}</button>
          {mode !== "reset" && <button type="button" className="text-mute" onClick={() => setMode("reset")}>Forgot password?</button>}
        </div>
      </form>
    </div>
  );
}
