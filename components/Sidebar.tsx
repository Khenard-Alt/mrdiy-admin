"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type AdminRole = "super_admin" | "hr_officer" | "branch_manager";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs", roles: ["super_admin", "hr_officer"] as AdminRole[] },
  { href: "/applications", label: "Applications" },
  { href: "/directory", label: "Applicant Directory", roles: ["super_admin", "hr_officer"] as AdminRole[] },
  { href: "/interviews/calendar", label: "Interview Calendar" },
  { href: "/employees", label: "Employees" },
  { href: "/messages", label: "Messages" },
  { href: "/analytics", label: "Analytics" },
  { href: "/accounts", label: "Accounts", roles: ["super_admin"] as AdminRole[] },
] as const;

type NavHref = (typeof NAV_ITEMS)[number]["href"];

/**
 * Left nav shared by every admin page. Fixed on desktop (lg+); on smaller
 * screens it is a slide-over panel opened with the hamburger button in the
 * mobile top bar rendered alongside it. Items with a `roles` list are hidden
 * from admins outside those roles — a UI convenience only; the matching API
 * routes enforce the same restriction server-side regardless of this list.
 */
export default function Sidebar({ active }: { active: NavHref }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setRole(data?.session?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const items = NAV_ITEMS.filter((item) => {
    const allowed = "roles" in item ? item.roles : null;
    // Role-restricted items stay hidden until the role is confirmed, instead
    // of showing then disappearing once /api/me resolves — a restricted item
    // popping in for an allowed role reads fine; one flickering away for a
    // role that was never allowed does not.
    return !allowed || (role !== null && allowed.includes(role));
  });

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* MOBILE TOP BAR */}

      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between bg-[#e30613] px-4 text-white lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex h-9 w-28 items-center overflow-hidden">
          <img src="/logo.png" alt="MR.DIY" className="h-full w-full object-contain" />
        </div>

        <span className="w-9" />
      </div>

      {/* BACKDROP (mobile only, while open) */}

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* SIDEBAR */}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-60 flex-col bg-[#e30613] text-white transition-transform duration-200 ease-out lg:z-20 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* LOGO */}

        <div className="flex h-20 items-center justify-between border-b border-white/15 px-6">
          <div className="flex h-14 w-44 items-center overflow-hidden">
            <img src="/logo.png" alt="MR.DIY" className="h-full w-full object-contain" />
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center lg:hidden"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* MENU */}

        <nav className="flex-1 px-3 py-6">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/60">
            Main Menu
          </p>

          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`mt-1 flex w-full border-l-4 px-6 py-3 text-left text-sm transition first:mt-0 ${
                item.href === active
                  ? "border-white bg-white/15 font-semibold"
                  : "border-transparent font-medium hover:bg-white/10"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* LOGOUT */}

        <div className="border-t border-white/15 p-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full px-6 py-3 text-left text-sm font-medium transition hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
