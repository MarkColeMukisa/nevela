"use client";

import Link from "next/link";
import { KeyRoundIcon, LogOutIcon, MonitorSmartphoneIcon, ShieldCheckIcon, UserIcon } from "lucide-react";
import { signOutAction } from "@/app/auth-actions";
import { authConfig, twoFactorAvailable } from "@/lib/auth-config";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import type { AvatarUser } from "@/components/ui/user-avatar";

/** Who the menu is for. */
export type DashboardUser = AvatarUser;

// It lives in components/ui now, where the customer area can have it too. Still here for code that imports it from here.
export { UserAvatar };

/**
 * What's inside the account menu, wherever it's opened from — the header's avatar and
 * the sidebar's footer both show this, so there's one list of account actions, not two.
 */
export function UserMenuItems({ user }: { user: DashboardUser }) {
  const signOut = async () => {
    await signOutAction();
    window.location.assign("/sign-in");
  };

  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-2 font-normal">
        <UserAvatar user={user} className="size-8" />
        <span className="grid min-w-0">
          <span className="truncate text-sm font-medium">{user.name || "Signed in"}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/account">
            <UserIcon />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/account/password">
            <KeyRoundIcon />
            Password
          </Link>
        </DropdownMenuItem>
        {/* Only when there is something on that page: two-factor or passkeys, switched on in Laravel. */}
        {(twoFactorAvailable || authConfig.passkeys || authConfig.social.length > 0) && (
          <DropdownMenuItem asChild>
            <Link href="/dashboard/account/security">
              <ShieldCheckIcon />
              Security
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/dashboard/account/sessions">
            <MonitorSmartphoneIcon />
            Devices
          </Link>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem variant="destructive" onSelect={signOut}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  );
}
