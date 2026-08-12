import { useEffect, useState, type FormEvent, type ReactNode } from "react";

const SESSION_KEY = "pmu-prototype-session";

export function AuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSignedIn(sessionStorage.getItem(SESSION_KEY) === "active");
    setReady(true);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address.");
    if (password.length < 6) return setError("Password must contain at least 6 characters.");
    sessionStorage.setItem(SESSION_KEY, "active");
    sessionStorage.setItem(`${SESSION_KEY}-email`, email);
    setSignedIn(true);
  }

  if (!ready) return <div className="min-h-screen bg-sidebar" />;
  if (signedIn) return <>{children}</>;

  return (
    <main className="grid min-h-screen place-items-center bg-sidebar px-5 py-10 text-sidebar-foreground">
      <div className="w-full max-w-md rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-8 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sidebar-primary">Secure research workspace</p>
        <h1 className="mt-3 text-3xl font-bold">Physics-Aware PMU</h1>
        <p className="mt-2 text-sm leading-relaxed text-sidebar-foreground/70">Sign in to upload grid-event recordings and access physics-informed stability analysis.</p>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-semibold">Email address<input className="mt-2 h-11 w-full rounded-md border border-sidebar-border bg-sidebar px-3 text-base text-sidebar-foreground outline-none focus:ring-2 focus:ring-sidebar-primary" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="operator@example.com" required /></label>
          <label className="block text-sm font-semibold">Password<input className="mt-2 h-11 w-full rounded-md border border-sidebar-border bg-sidebar px-3 text-base text-sidebar-foreground outline-none focus:ring-2 focus:ring-sidebar-primary" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 characters" required /></label>
          {error ? <p className="rounded-md border border-unstable/40 bg-unstable/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
          <button className="h-11 w-full rounded-md bg-sidebar-primary font-bold text-sidebar-primary-foreground transition hover:brightness-110" type="submit">Sign in to dashboard</button>
        </form>
        <p className="mt-5 text-xs leading-relaxed text-sidebar-foreground/55">Prototype access gate. Do not reuse a sensitive password.</p>
      </div>
    </main>
  );
}

export function logoutPrototype() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(`${SESSION_KEY}-email`);
  window.location.assign("/");
}
