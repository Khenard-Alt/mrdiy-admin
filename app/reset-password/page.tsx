"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleResetPassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess(false);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    setTimeout(() => {
      router.push("/login");
      router.refresh();
    }, 2000);
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <div className="flex min-h-screen items-center justify-center px-6 py-12">

        <div className="w-full max-w-md">

          {/* LOGO */}
          <div className="mb-6 text-center">
            <div className="inline-block rounded-xl bg-[#e30613] px-5 py-3">
              <span className="text-2xl font-black text-white">
                MR.DIY
              </span>
            </div>
          </div>

          {/* TITLE */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900">
              Reset Password
            </h1>

            <p className="mt-2 text-gray-600">
              Create a new password for your admin account.
            </p>
          </div>

          {/* CARD */}
          <div className="rounded-3xl bg-white p-8 shadow-xl">

            {/* ERROR */}
            {error && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* SUCCESS */}
            {success && (
              <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                Password updated successfully. Redirecting to login...
              </div>
            )}

            <form onSubmit={handleResetPassword}>

              {/* NEW PASSWORD */}
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  New Password
                </label>

                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    placeholder="Enter new password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pr-14 text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((current) => !current)
                    }
                    className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              {/* CONFIRM PASSWORD */}
              <div className="mt-5">
                <label
                  htmlFor="confirmPassword"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Confirm New Password
                </label>

                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={
                      showConfirmPassword ? "text" : "password"
                    }
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    placeholder="Confirm new password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pr-14 text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(
                        (current) => !current
                      )
                    }
                    className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                    aria-label={
                      showConfirmPassword
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    {showConfirmPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              {/* PASSWORD REQUIREMENT */}
              <p className="mt-3 text-xs text-gray-500">
                Password must be at least 6 characters.
              </p>

              {/* BUTTON */}
              <button
                type="submit"
                disabled={loading || success}
                className="mt-7 w-full rounded-xl bg-[#e30613] px-5 py-3.5 font-semibold text-white transition hover:bg-[#c80511] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? "Updating Password..."
                  : "Update Password"}
              </button>

            </form>

            {/* BACK TO LOGIN */}
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="mt-5 w-full text-center text-sm font-medium text-gray-600 hover:text-[#e30613]"
            >
              ← Back to Login
            </button>

          </div>

          {/* FOOTER */}
          <p className="mt-6 text-center text-xs text-gray-500">
            MR.DIY Careers Administration
          </p>

        </div>
      </div>
    </main>
  );
}