import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/health", {
        headers: { Authorization: `Bearer ${trimmed}` },
      });

      // health endpoint is unauthenticated, but we also try an authenticated
      // endpoint to validate the token actually works.
      const check = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${trimmed}` },
      });

      if (check.ok || res.ok) {
        if (!check.ok) {
          setError("Invalid token");
          return;
        }
        login(trimmed);
      } else {
        setError("Invalid token");
      }
    } catch {
      setError("Cannot reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-6 rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-xl"
      >
        {/* Logo / title */}
        <div className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-indigo-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-6 text-white"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white">Job Alert</h1>
          <p className="mt-1 text-sm text-gray-400">
            Enter your API token to continue
          </p>
        </div>

        {/* Token input */}
        <div>
          <label
            htmlFor="token"
            className="mb-1.5 block text-sm font-medium text-gray-300"
          >
            API Token
          </label>
          <input
            id="token"
            type="password"
            autoFocus
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your API_AUTH_TOKEN"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !token.trim()}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Verifying…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
