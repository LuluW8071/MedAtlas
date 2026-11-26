"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${apiUrl}/auth/me`, { credentials: "include" })
      .then((response) => {
        if (response.ok) router.replace("/");
      })
      .catch(() => {});
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not authenticate.");
      router.replace("/");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not authenticate.");
    } finally {
      setLoading(false);
    }
  }

  const input = "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#1d76bc] focus:ring-2 focus:ring-[#1d76bc]/20 dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <main className="relative grid min-h-dvh place-items-center bg-slate-50 px-6 py-12 dark:bg-black">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[380px]">
        <div className="mb-8">
          <a className="text-lg font-bold tracking-tight" href="/">Med<span className="text-[#1d76bc]">Atlas</span></a>
          <h1 className="mt-6 text-2xl font-semibold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
            {mode === "login" ? "Sign in to continue your conversations." : "Your conversations stay linked to your account."}
          </p>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300" htmlFor="auth-email">
            Email
            <input id="auth-email" className={input} type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300" htmlFor="auth-password">
            Password
            <input id="auth-password" className={input} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <div className="min-h-5">
            {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
          </div>
          <button className="w-full rounded-lg bg-[#1d76bc] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2185d4] active:scale-[0.98] disabled:opacity-60" type="submit" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500 dark:text-zinc-400">
          {mode === "login" ? "New to MedAtlas?" : "Already have an account?"}{" "}
          <button className="font-medium text-[#1d76bc] hover:underline dark:text-sky-300" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
            {mode === "login" ? "Create account" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
