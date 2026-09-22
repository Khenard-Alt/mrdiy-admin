"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.user?.app_metadata?.role !== "admin") {
      await supabase.auth.signOut();

      setError("This account is not an admin account.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        {/* =================================
            LEFT PANEL
        ================================= */}

        <section className="relative hidden overflow-hidden bg-[#e30613] lg:flex lg:min-h-screen lg:flex-col">
          {/* Decorative background elements */}

          <div className="absolute -right-32 -top-32 h-96 w-96 border border-white/10" />

          <div className="absolute -bottom-40 -left-40 h-[30rem] w-[30rem] border border-white/10" />

          <div className="relative z-10 flex min-h-screen flex-col px-14 py-12 xl:px-20">
            {/* LOGO */}

            <div className="flex h-16 w-48 items-center">
              <img
                src="/logo.png"
                alt="MR.DIY"
                className="h-auto w-full object-contain"
              />
            </div>

            {/* MAIN CONTENT */}

            <div className="flex flex-1 items-center">
              <div className="max-w-xl">
                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/65">
                  Careers Administration
                </p>

                <h1 className="text-5xl font-bold leading-[1.08] tracking-tight text-white xl:text-6xl">
                  Manage your
                  <br />
                  recruitment
                  <br />
                  operations.
                </h1>

                <p className="mt-7 max-w-lg text-base leading-7 text-white/80">
                  Manage job postings, review applications, and
                  oversee recruitment activities from one
                  centralized administration portal.
                </p>

                {/* FEATURES */}

                <div className="mt-10 grid max-w-lg gap-3 sm:grid-cols-2">
                  <div className="border border-white/15 bg-white/10 p-5">
                    <p className="text-sm font-semibold text-white">
                      Job Management
                    </p>

                    <p className="mt-2 text-xs leading-5 text-white/70">
                      Create, update, and manage available
                      positions.
                    </p>
                  </div>

                  <div className="border border-white/15 bg-white/10 p-5">
                    <p className="text-sm font-semibold text-white">
                      Applications
                    </p>

                    <p className="mt-2 text-xs leading-5 text-white/70">
                      Review applicants and manage application
                      status.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* LEFT FOOTER */}

            <div className="border-t border-white/15 pt-5">
              <p className="text-xs text-white/55">
                MR.DIY Careers Administration
              </p>
            </div>
          </div>
        </section>

        {/* =================================
            RIGHT PANEL
        ================================= */}

        <section className="flex min-h-screen items-center justify-center bg-[#f5f6f8] px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            {/* MOBILE LOGO */}

            <div className="mb-10 flex justify-center lg:hidden">
              <div className="flex h-16 w-44 items-center">
                <img
                  src="/logo.png"
                  alt="MR.DIY"
                  className="h-auto w-full object-contain"
                />
              </div>
            </div>

            {/* LOGIN HEADING */}

            <div className="mb-7">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
                Careers Administration
              </p>

              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                Admin Login
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Sign in to access the MR.DIY Careers Admin Portal.
              </p>
            </div>

            {/* LOGIN FORM */}

            <form
              onSubmit={handleLogin}
              className="border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
            >
              {/* ERROR */}

              {error && (
                <div className="mb-6 border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm font-medium text-red-700">
                    {error}
                  </p>
                </div>
              )}

              {/* EMAIL */}

              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Email Address
                </label>

                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="admin@example.com"
                  required
                  autoComplete="email"
                  className="w-full border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#e30613] focus:ring-1 focus:ring-[#e30613]"
                />
              </div>

              {/* PASSWORD */}

              <div className="mt-5">
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Password
                </label>

                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className="w-full border border-slate-300 bg-white px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#e30613] focus:ring-1 focus:ring-[#e30613]"
                  />

                  {/* PASSWORD TOGGLE */}

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((current) => !current)
                    }
                    className="absolute right-0 top-0 flex h-full w-12 items-center justify-center text-slate-400 transition hover:text-slate-700"
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    title={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    {showPassword ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className="h-5 w-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 3l18 18"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M10.58 10.58a2 2 0 102.84 2.84"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9.88 5.09A10.94 10.94 0 0112 4.88c5.05 0 8.5 4.5 9.5 7.12a11.7 11.7 0 01-3.05 4.18"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6.23 6.23C3.93 7.74 2.5 10.06 2.5 12c1 2.62 4.45 7.12 9.5 7.12 1.34 0 2.58-.27 3.69-.74"
                        />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className="h-5 w-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"
                        />
                        <circle
                          cx="12"
                          cy="12"
                          r="2.5"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* SIGN IN */}

              <button
                type="submit"
                disabled={loading}
                className="mt-7 w-full bg-[#e30613] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#c80511] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            {/* FOOTER */}

            <div className="mt-7 border-t border-slate-200 pt-5 text-center">
              <p className="text-xs text-slate-400">
                Authorized personnel only
              </p>

              <p className="mt-1 text-xs text-slate-400">
                MR.DIY Careers Administration
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}