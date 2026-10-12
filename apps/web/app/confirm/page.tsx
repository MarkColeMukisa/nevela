import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { laravel } from "@/lib/laravel";

export const metadata = { title: "Confirm your address", robots: { index: false } };

/**
 * Where the link in a confirmation email leads: a list someone joined through a public
 * form whose descriptor has "confirm". Opening it proves the address is theirs.
 *
 * Laravel made the link and Laravel checks it. This page passes on what the link
 * carries and says how it went. To send people somewhere of your own, change what is
 * shown here, or point nevela.public.confirm.path at another page that does the same.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ list?: string; id?: string; key?: string }> }) {
  const { list = "", id = "", key = "" } = await searchParams;
  // Only what a link of ours looks like is passed on.
  const wellFormed = /^[a-z0-9][a-z0-9-]{0,80}$/.test(list) && /^[A-Za-z0-9-]{1,40}$/.test(id) && /^[a-f0-9]{64}$/.test(key);

  let confirmed = false;
  let unreachable = false;
  if (wellFormed) {
    try {
      const response = await laravel(`public/_nevela/confirm/${list}/${id}/${key}`, { method: "POST", token: null });
      confirmed = response.ok;
      unreachable = response.status >= 500 || response.status === 429;
    } catch {
      unreachable = true;
    }
  }

  const [title, subtitle] = confirmed
    ? ["You're confirmed", "Thank you. Your address is on the list."]
    : unreachable
      ? ["We couldn't check that just now", "Nothing is wrong with your link. Open it again in a moment."]
      : ["This link is no longer good", "It may have been used too late. Sign up again and we'll send a new one."];

  return (
    <AuthShell
      title={title}
      subtitle={subtitle}
      footer={
        <Link href="/" className="font-medium text-link hover:underline">
          Back to the site
        </Link>
      }
    >
      {null}
    </AuthShell>
  );
}
