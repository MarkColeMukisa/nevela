"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ANY = "any";

/**
 * Search and filters for the list of users. Each one is a query parameter, so a filtered
 * list has an address of its own and survives a reload.
 */
export function UsersToolbar({ roles }: { roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const typed = useRef(false);

  function go(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Any change of filter starts again from the first page.
    next.delete("page");
    router.replace(next.size > 0 ? `${pathname}?${next}` : pathname);
  }

  // Search as they type, a moment after they stop.
  useEffect(() => {
    if (!typed.current) return;
    const timer = setTimeout(() => go({ q: search.trim() || null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the text starts a search
  }, [search]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative sm:max-w-xs sm:flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search users"
          placeholder="Search by name or email"
          className="pl-8"
          value={search}
          onChange={(event) => {
            typed.current = true;
            setSearch(event.target.value);
          }}
        />
      </div>
      <Select value={params.get("role") ?? ANY} onValueChange={(value) => go({ role: value === ANY ? null : value })}>
        <SelectTrigger className="sm:w-44" aria-label="Role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Every role</SelectItem>
          {roles.map((role) => (
            <SelectItem key={role.id} value={role.id}>
              {role.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={params.get("status") ?? ANY} onValueChange={(value) => go({ status: value === ANY ? null : value })}>
        <SelectTrigger className="sm:w-40" aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Switched off</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
