"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { blockAddressAction, unblockAddressAction } from "@/app/dashboard/access/actions";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

/** How long a block made here lasts. "" is until it is cleared. */
const LENGTHS = [
  { value: "60", label: "An hour" },
  { value: "1440", label: "A day" },
  { value: "10080", label: "A week" },
  { value: "", label: "Until cleared" },
];

/** Block an address by hand. Laravel refuses this server, the exempt list and your own address. */
export function BlockAddressForm() {
  const router = useRouter();
  const confirmed = useConfirm();
  const [pending, startTransition] = useTransition();
  const [address, setAddress] = useState("");
  const [minutes, setMinutes] = useState("1440");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function block(event: React.FormEvent) {
    event.preventDefault();
    setProblem(null);
    startTransition(async () => {
      const result = await confirmed(() => blockAddressAction({ address: address.trim(), ...(minutes ? { minutes: Number(minutes) } : {}), ...(note.trim() ? { note: note.trim() } : {}) }));
      if (result.ok) {
        toast.success(`${result.data.address} is blocked.`);
        setAddress("");
        setNote("");
        router.refresh();
      } else {
        setProblem(result.issues?.[0]?.message ?? result.error);
      }
    });
  }

  return (
    <form onSubmit={block} className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor="block-address">Address</Label>
          <Input id="block-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="203.0.113.7" className="font-mono" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="block-minutes">For</Label>
          <select id="block-minutes" value={minutes} onChange={(event) => setMinutes(event.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm">
            {LENGTHS.map((length) => (
              <option key={length.label} value={length.value}>
                {length.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="block-note">Why (optional)</Label>
          <Input id="block-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Keeps trying passwords" maxLength={255} />
        </div>
        <Button type="submit" disabled={pending || address.trim() === ""}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Block
        </Button>
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">An IPv6 address is blocked with the rest of its /64: one person usually has the whole range.</p>
      )}
    </form>
  );
}

/** Clear a block: the address can reach the app again. */
export function UnblockButton({ id, address }: { id: string; address: string }) {
  const router = useRouter();
  const confirmed = useConfirm();
  const [pending, startTransition] = useTransition();

  function clear() {
    startTransition(async () => {
      const result = await confirmed(() => unblockAddressAction(id));
      if (result.ok) {
        toast.success(`${address} can reach the app again.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={clear}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      Clear
    </Button>
  );
}
