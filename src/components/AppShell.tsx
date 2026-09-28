import { useEffect, useState } from "react";
import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Car,
  Route as RouteIcon,
  PlayCircle,
  Settings as SettingsIcon,
  LogOut,
  Gauge,
  Menu,
  X,
  ListChecks,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/auth/UserMenu";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/simulate", label: "Simulate", icon: PlayCircle },
  { to: "/simulations", label: "Simulations", icon: ListChecks },
  { to: "/vehicles", label: "Vehicles", icon: Car },
  { to: "/roads", label: "Roads", icon: RouteIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [path]);
  // Lock body scroll while drawer open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  const Brand = (
    <Link to="/dashboard" className="flex items-center gap-2 px-2">
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center shadow-lg shadow-primary/20 shrink-0">
        <Gauge className="w-5 h-5 text-primary-foreground" />
      </div>
      <div className="flex flex-col leading-none min-w-0">
        <span className="font-semibold tracking-tight truncate">VirtuDrive</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">
          AI Test Lab
        </span>
      </div>
    </Link>
  );

  const NavList = (
    <nav className="flex-1 flex flex-col gap-0.5" aria-label="Primary">
      {NAV.map((item) => {
        const active = path === item.to || path.startsWith(item.to + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm min-h-11 transition-colors",
              active
                ? "bg-primary/15 text-primary border-l-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/10",
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const SignOut = (
    <button
      onClick={signOut}
      className="mt-4 flex items-center gap-3 px-3 py-2.5 rounded-md text-sm min-h-11 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
    >
      <LogOut className="w-4 h-4" /> Sign out
    </button>
  );

  return (
    <div className="min-h-dvh flex bg-background text-foreground">
      {/* Desktop / tablet sidebar */}
      <aside className="hidden md:flex w-56 lg:w-60 shrink-0 border-r border-border/60 bg-card/40 backdrop-blur px-3 py-5 flex-col">
        <div className="mb-6">{Brand}</div>
        {NavList}
        <div className="mt-4 pt-3 border-t border-border/60">
          <UserMenu />
        </div>
        {SignOut}
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-between px-3 border-b border-border/60 bg-card/80 backdrop-blur">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="p-2.5 -ml-1 rounded-md hover:bg-accent/10 min-h-11 min-w-11 grid place-items-center"
        >
          <Menu className="w-5 h-5" />
        </button>
        {Brand}
        <UserMenu />
      </header>

      {/* Mobile drawer */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-50 transition-opacity",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <div
          className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={cn(
            "absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-card border-r border-border/60 px-3 py-4 flex flex-col shadow-2xl transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between mb-4">
            {Brand}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="p-2.5 rounded-md hover:bg-accent/10 min-h-11 min-w-11 grid place-items-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {NavList}
          {SignOut}
        </aside>
      </div>

      <main className="flex-1 min-w-0 overflow-x-hidden pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
