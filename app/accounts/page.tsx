"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminAlertsBell from "@/components/AdminAlertsBell";

type Role = "super_admin" | "hr_officer" | "branch_manager";

type Account = {
  id: string;
  username: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  branch_id: string | null;
  is_active: boolean;
  created_at: string | null;
};

type Branch = {
  id: string;
  name: string;
  location: string | null;
};

const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  hr_officer: "HR Officer",
  branch_manager: "Branch Manager",
};

const emptyForm = {
  username: "",
  password: "",
  fullName: "",
  email: "",
  role: "hr_officer" as Role,
  branchId: "",
};

export default function AccountsPage() {
  const router = useRouter();

  const [currentId, setCurrentId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  async function loadAccounts() {
    setLoading(true);
    setError("");
    setForbidden(false);

    try {
      const meResponse = await fetch("/api/me");
      if (meResponse.status === 401) {
        router.push("/login");
        return;
      }
      const me = await meResponse.json();
      setCurrentId(me.session?.id ?? "");

      const [accountsResponse, branchesResponse] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/branches"),
      ]);

      if (accountsResponse.status === 403) {
        setForbidden(true);
        return;
      }

      if (!accountsResponse.ok) {
        const data = await accountsResponse.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load accounts.");
      }

      const accountsData = await accountsResponse.json();
      setAccounts(accountsData.accounts ?? []);

      if (branchesResponse.ok) {
        const branchesData = await branchesResponse.json();
        setBranches(branchesData.branches ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openAddModal() {
    setEditingAccount(null);
    setForm({ ...emptyForm });
    setError("");
    setSuccess("");
    setShowModal(true);
  }

  function openEditModal(account: Account) {
    setEditingAccount(account);
    setForm({
      username: account.username,
      password: "",
      fullName: account.full_name ?? "",
      email: account.email ?? "",
      role: account.role,
      branchId: account.branch_id ?? "",
    });
    setError("");
    setSuccess("");
    setShowModal(true);
  }

  function closeModal() {
    if (saving) return;
    setShowModal(false);
    setEditingAccount(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (form.role === "branch_manager" && !form.branchId) {
      setError("A branch manager must be assigned a branch.");
      return;
    }

    setSaving(true);

    try {
      if (editingAccount) {
        const response = await fetch("/api/accounts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingAccount.id,
            password: form.password || undefined,
            fullName: form.fullName,
            email: form.email,
            role: form.role,
            branchId: form.role === "branch_manager" ? form.branchId : null,
          }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Failed to update account.");
        setSuccess("Account updated.");
      } else {
        if (!form.password) {
          setError("Password is required for a new account.");
          setSaving(false);
          return;
        }

        const response = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: form.username,
            password: form.password,
            fullName: form.fullName,
            email: form.email,
            role: form.role,
            branchId: form.role === "branch_manager" ? form.branchId : null,
          }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Failed to create account.");
        setSuccess("Account created.");
      }

      setShowModal(false);
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(account: Account) {
    setError("");
    const response = await fetch("/api/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account.id, isActive: !account.is_active }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Failed to update account.");
      return;
    }

    await loadAccounts();
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function branchName(branchId: string | null) {
    if (!branchId) return "—";
    return branches.find((b) => b.id === branchId)?.name ?? "—";
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-60 bg-[#e30613] text-white lg:flex lg:flex-col">
        <div className="flex h-20 items-center border-b border-white/15 px-6">
          <div className="flex h-14 w-44 items-center overflow-hidden">
            <img src="/logo.png" alt="MR.DIY" className="h-full w-full object-contain" />
          </div>
        </div>

        <nav className="flex-1 px-3 py-6">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/60">
            Main Menu
          </p>
          <Link href="/dashboard" className="flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium hover:bg-white/10">
            Dashboard
          </Link>
          <Link href="/jobs" className="mt-1 flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium hover:bg-white/10">
            Jobs
          </Link>
          <Link href="/applications" className="mt-1 flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium hover:bg-white/10">
            Applications
          </Link>
          <Link href="/messages" className="mt-1 flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium hover:bg-white/10">
            Messages
          </Link>
          <Link href="/analytics" className="mt-1 flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium hover:bg-white/10">
            Analytics
          </Link>
          <Link href="/accounts" className="mt-1 flex w-full border-l-4 border-white bg-white/15 px-6 py-3 text-left text-sm font-semibold">
            Accounts
          </Link>
        </nav>

        <div className="border-t border-white/15 p-4">
          <button type="button" onClick={handleLogout} className="w-full px-6 py-3 text-left text-sm font-medium hover:bg-white/10">
            Logout
          </button>
        </div>
      </aside>

      <div className="lg:ml-60">
        <header className="sticky top-0 z-10 flex min-h-20 items-center justify-between border-b border-slate-200 bg-white px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">MR.DIY Careers</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Accounts</h1>
          </div>
          <AdminAlertsBell />
        </header>

        <div className="p-5 sm:p-6 lg:p-8">
          <section className="mb-7 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <p className="text-sm text-slate-500">
              Manage HR officer and branch manager accounts. Super admin only.
            </p>
            {!forbidden && (
              <button
                type="button"
                onClick={openAddModal}
                className="bg-[#e30613] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#c80511]"
              >
                + Add Account
              </button>
            )}
          </section>

          {error && (
            <div className="mb-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
          )}
          {success && (
            <div className="mb-6 border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-700">{success}</div>
          )}

          {loading ? (
            <div className="flex min-h-64 items-center justify-center border border-slate-200 bg-white">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#e30613]" />
            </div>
          ) : forbidden ? (
            <div className="border border-slate-200 bg-white px-6 py-16 text-center">
              <h3 className="text-sm font-semibold text-slate-800">Super admin access required</h3>
              <p className="mt-1 text-sm text-slate-500">
                Your account does not have permission to manage other accounts.
              </p>
            </div>
          ) : (
            <section className="border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Username</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Name</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Role</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Branch</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => (
                      <tr key={account.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-5 py-4 text-sm font-semibold text-slate-800">{account.username}</td>
                        <td className="px-5 py-4 text-sm text-slate-600">{account.full_name || "—"}</td>
                        <td className="px-5 py-4">
                          <span className="inline-flex border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                            {ROLE_LABELS[account.role]}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">{branchName(account.branch_id)}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex border px-2.5 py-1 text-[11px] font-semibold ${
                              account.is_active
                                ? "border-green-200 bg-green-50 text-green-700"
                                : "border-red-200 bg-red-50 text-red-700"
                            }`}
                          >
                            {account.is_active ? "Active" : "Disabled"}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(account)}
                              className="border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-[#e30613] hover:text-[#e30613]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={account.id === currentId}
                              onClick={() => toggleActive(account)}
                              className="border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-[#e30613] hover:text-[#e30613] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {account.is_active ? "Disable" : "Enable"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <footer className="mt-8 border-t border-slate-200 pt-5">
            <p className="text-xs text-slate-400">MR.DIY Careers Administration</p>
          </footer>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <h2 className="text-xl font-bold text-slate-900">
                {editingAccount ? "Edit Account" : "Add New Account"}
              </h2>
              <button type="button" onClick={closeModal} disabled={saving} className="flex h-9 w-9 items-center justify-center border border-slate-200 text-lg text-slate-500 hover:bg-slate-50">
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              {error && (
                <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              {!editingAccount && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Username *</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    required
                    className="w-full border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                  />
                </div>
              )}

              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Password {editingAccount ? "(leave blank to keep current)" : "*"}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required={!editingAccount}
                  className="w-full border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                />
              </div>

              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold text-slate-700">Full Name</label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  className="w-full border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                />
              </div>

              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                />
              </div>

              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold text-slate-700">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                  className="w-full border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                >
                  <option value="hr_officer">HR Officer</option>
                  <option value="branch_manager">Branch Manager</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>

              {form.role === "branch_manager" && (
                <div className="mt-5">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Branch *</label>
                  <select
                    value={form.branchId}
                    onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                    required
                    className="w-full border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                  >
                    <option value="">Select a branch…</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeModal} disabled={saving} className="border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="bg-[#e30613] px-6 py-3 text-sm font-semibold text-white hover:bg-[#c80511] disabled:opacity-60">
                  {saving ? "Saving..." : editingAccount ? "Save Changes" : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
