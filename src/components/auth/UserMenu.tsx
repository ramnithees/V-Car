import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, User as UserIcon, Settings as SettingsIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type ProfileState = {
  email: string;
  fullName: string;
  avatarUrl: string | null;
};

function initials(name: string, email: string): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [profile, setProfile] = useState<ProfileState | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) return;
      const md = (user.user_metadata ?? {}) as Record<string, unknown>;
      const metaName = (md.full_name as string) || (md.name as string) || "";
      const metaAvatar = (md.avatar_url as string) || (md.picture as string) || null;
      // Try DB profile for authoritative name/avatar; fall back to metadata.
      const { data: row } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, email")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setProfile({
        email: row?.email || user.email || "",
        fullName: row?.full_name || metaName || "",
        avatarUrl: row?.avatar_url || metaAvatar,
      });
    }
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "USER_UPDATED") void load();
      if (e === "SIGNED_OUT") setProfile(null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  const name = profile?.fullName || profile?.email?.split("@")[0] || "Account";
  const email = profile?.email || "";
  const avatar = profile?.avatarUrl || undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open account menu"
        className="flex items-center gap-2 rounded-full p-1 pr-3 hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors min-h-10"
      >
        <Avatar className="w-8 h-8">
          <AvatarImage src={avatar} alt="" />
          <AvatarFallback className="text-xs bg-primary/20 text-primary">
            {initials(profile?.fullName ?? "", profile?.email ?? "")}
          </AvatarFallback>
        </Avatar>
        <span className="hidden sm:inline text-sm font-medium truncate max-w-[140px]">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 py-2">
          <Avatar className="w-10 h-10">
            <AvatarImage src={avatar} alt="" />
            <AvatarFallback className="bg-primary/20 text-primary">
              {initials(profile?.fullName ?? "", profile?.email ?? "")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{name}</div>
            <div className="text-xs text-muted-foreground truncate">{email}</div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" className="cursor-pointer">
            <UserIcon className="w-4 h-4 mr-2" /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings" className="cursor-pointer">
            <SettingsIcon className="w-4 h-4 mr-2" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={signOut}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="w-4 h-4 mr-2" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
