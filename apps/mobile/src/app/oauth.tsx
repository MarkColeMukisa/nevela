import { router } from "expo-router";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth";

/**
 * The address the browser returns to after Google: `shop://oauth?code=…&state=…`.
 *
 * The sign-in that is waiting for it picks the code up itself (see lib/social.ts), so this
 * is never a screen anyone should see. But on Android the same link also reaches the
 * router, which would show "Unmatched Route" on top of the sign-in screen. So it goes
 * straight back to where it was, or, if the app was opened by this link alone, to the start.
 */
export default function OAuthReturn() {
  const { user } = useAuth();

  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace(user ? "/" : "/sign-in");
  }, [user]);

  return null;
}
