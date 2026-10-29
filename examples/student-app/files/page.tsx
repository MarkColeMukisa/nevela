import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join" };

/** Where a student signs up: the students' public form, with their address proved by email. */
export default function JoinPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-4xl md:text-5xl">Join the school</h1>
        <p className="mt-4 text-foreground-muted">Sign up, and we will be in touch about your courses.</p>
        <JoinForm />
      </main>
    </>
  );
}
