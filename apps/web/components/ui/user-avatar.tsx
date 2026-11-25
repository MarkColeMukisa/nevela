import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/** Someone as an avatar shows them: a picture, or their initials. */
export interface AvatarUser {
  name?: string | null;
  email: string;
  image?: string | null;
}

/** "Ada Lovelace" → "AL"; an address falls back to its first letter. */
function initials(user: AvatarUser): string {
  const source = user.name?.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : source.slice(0, 2)).toUpperCase();
}

export function UserAvatar({ user, className }: { user: AvatarUser; className?: string }) {
  return (
    <Avatar className={className}>
      {user.image && <AvatarImage src={user.image} alt="" />}
      <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">{initials(user)}</AvatarFallback>
    </Avatar>
  );
}
