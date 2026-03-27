import { useState, useEffect } from "react";
import { NavLink, Outlet } from "react-router";
import {
  Briefcase,
  Archive,
  Settings,
  Menu,
  LogOut,
  X,
  ChevronLeft,
  ChevronRight,
  Database,
} from "lucide-react";
import { useAuth } from "../lib/auth";

const navItems = [
  {
    to: "/",
    label: "Jobs",
    icon: <Briefcase className="size-5 shrink-0" />,
  },
  {
    to: "/archive",
    label: "Archive",
    icon: <Archive className="size-5 shrink-0" />,
  },
  {
    to: "/raw-posts",
    label: "Raw Posts",
    icon: <Database className="size-5 shrink-0" />,
  },
  {
    to: "/settings",
    label: "Settings",
    icon: <Settings className="size-5 shrink-0" />,
  },
];

const HamburgerIcon = () => <Menu className="size-5" />;

const SignOutIcon = () => <LogOut className="size-5 shrink-0" />;

function Tooltip({ label, visible }: { label: string; visible: boolean }) {
  return (
    <span
      className={`pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity ${
        visible ? "group-hover:opacity-100" : ""
      }`}
    >
      {label}
    </span>
  );
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1024);
  const { logout } = useAuth();

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setCollapsed(!e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? "bg-gray-900 text-white"
        : "text-gray-400 hover:bg-gray-800 hover:text-white"
    }`;

  const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
    `group relative flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? "bg-gray-900 text-white"
        : "text-gray-400 hover:bg-gray-800 hover:text-white"
    }`;

  /* ── Mobile sidebar nav (always expanded) ── */
  const mobileSidebarNav = (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4 overflow-y-auto">
      <div className="sticky top-0 z-10 flex flex-col gap-1 bg-gray-950 pb-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={mobileLinkClass}
            onClick={() => setSidebarOpen(false)}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </div>
      <div className="mt-auto border-t border-gray-800 pt-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
        >
          <SignOutIcon />
          Sign out
        </button>
      </div>
    </nav>
  );

  const labelClass = collapsed
    ? "whitespace-nowrap overflow-hidden transition-[max-width,opacity,margin] ease-in-out duration-300 max-w-0 opacity-0 ml-0"
    : "whitespace-nowrap overflow-hidden transition-[max-width,opacity,margin] ease-in-out duration-300 max-w-xs opacity-100 ml-3";

  /* ── Desktop sidebar nav (supports collapsed) ── */
  const desktopSidebarNav = (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      <div className="flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={desktopLinkClass}
          >
            {item.icon}
            <span className={labelClass}>{item.label}</span>
            <Tooltip label={item.label} visible={collapsed} />
          </NavLink>
        ))}
      </div>
      <div className="mt-auto border-t border-gray-800 pt-3">
        <button
          onClick={logout}
          className="group relative flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
        >
          <SignOutIcon />
          <span className={labelClass}>Sign out</span>
          <Tooltip label="Sign out" visible={collapsed} />
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-gray-800 bg-gray-950 overflow-visible transition-[width] ease-in-out duration-300 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-gray-800 px-4">
          <span
            className={`text-lg font-bold tracking-tight mr-auto whitespace-nowrap overflow-hidden transition-[max-width,opacity] ease-in-out duration-300 ${
              collapsed ? "max-w-0 opacity-0" : "max-w-xs opacity-100"
            }`}
          >
            Job Alert
          </span>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-md p-1 text-gray-400 hover:text-white shrink-0"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="size-5" />
            ) : (
              <ChevronLeft className="size-5" />
            )}
          </button>
        </div>
        {desktopSidebarNav}
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-gray-800 bg-gray-950 transition-transform duration-200 md:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-gray-800 px-4">
          <span className="text-lg font-bold tracking-tight">Job Alert</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1 text-gray-400 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>
        {mobileSidebarNav}
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex h-14 items-center gap-3 border-b border-gray-800 px-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1 text-gray-400 hover:text-white"
          >
            <HamburgerIcon />
          </button>
          <span className="text-lg font-bold tracking-tight">Job Alert</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
