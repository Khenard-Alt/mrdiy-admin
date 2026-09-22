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
    <main className="min-h-screen bg-gray-100">
      <div className="grid min-h-screen lg:grid-cols-2">

        {/* LEFT SIDE */}
        <div className="hidden bg-[#e30613] lg:flex lg:flex-col lg:justify-center lg:px-20">
          <div className="max-w-xl text-white">

            {/* LOGO */}
            <div className="mb-8 inline-flex rounded-xl bg-white px-6 py-4">
              <span className="text-3xl font-black text-[#e30613]">
                MR.DIY
              </span>
            </div>

            {/* TITLE */}
            <h1 className="text-5xl font-bold leading-tight">
              Careers Admin Portal
            </h1>

            <p className="mt-6 text-lg leading-8 text-white">
              Manage job postings, applications, and applicants
              from one centralized dashboard.
            </p>

            {/* FEATURES */}
            <div className="mt-10 space-y-4">

              <div className="rounded-2xl bg-white/10 p-5">
                <p className="font-semibold">
                  Job Management
                </p>

                <p className="mt-1 text-sm text-white/80">
                  Create, edit, and manage available job positions.
                </p>
              </div>

              <div className="rounded-2xl bg-white/10 p-5">
                <p className="font-semibold">
                  Application Management
                </p>

                <p className="mt-1 text-sm text-white/80">
                  Review applicants and manage application status.
                </p>
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">

            {/* MOBILE LOGO */}
            <div className="mb-6 text-center lg:hidden">
              <div className="inline-block rounded-xl bg-[#e30613] px-5 py-3">
                <span className="text-2xl font-black text-white">
                  MR.DIY
                </span>
              </div>
            </div>

            {/* TITLE */}
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold text-gray-900">
                Admin Login
              </h2>

              <p className="mt-2 text-gray-600">
                Sign in to access the Careers Admin Portal.
              </p>
            </div>

            {/* LOGIN FORM */}
            <form
              onSubmit={handleLogin}
              className="rounded-3xl bg-white p-8 shadow-xl"
            >

              {/* ERROR MESSAGE */}
              {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* EMAIL */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Email Address
                </label>

                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@example.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
                />
              </div>

              {/* PASSWORD */}
              <div className="mt-5">
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Password
                </label>

                <div className="relative">

                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pr-14 text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
                  />

                  {/* SHOW / HIDE PASSWORD */}
                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((current) => !current)
                    }
                    className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
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
                    {showPassword ? "🙈" : "👁️"}
                  </button>

                </div>
              </div>

              {/* LOGIN BUTTON */}
              <button
                type="submit"
                disabled={loading}
                className="mt-7 w-full rounded-xl bg-[#e30613] px-5 py-3.5 font-semibold text-white transition hover:bg-[#c80511] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>

            </form>

            {/* FOOTER */}
            <p className="mt-6 text-center text-xs text-gray-500">
              MR.DIY Careers Administration
            </p>

          </div>
        </div>

      </div>
    </main>
  );
}