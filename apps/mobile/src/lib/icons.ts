import type { IconName } from "@/components/ui";

/**
 * The dashboard names its icons by lucide.dev; a phone has its own set. The common ones
 * are matched here, and anything else gets a plain one. Add yours as you need them.
 */
const ICONS: Record<string, IconName> = {
  package: "cube-outline",
  box: "cube-outline",
  tags: "pricetags-outline",
  tag: "pricetag-outline",
  "shopping-cart": "cart-outline",
  "shopping-bag": "bag-outline",
  users: "people-outline",
  user: "person-outline",
  "file-text": "document-text-outline",
  newspaper: "newspaper-outline",
  receipt: "receipt-outline",
  "credit-card": "card-outline",
  building: "business-outline",
  calendar: "calendar-outline",
  mail: "mail-outline",
  phone: "call-outline",
  briefcase: "briefcase-outline",
  "graduation-cap": "school-outline",
  truck: "bus-outline",
  wallet: "wallet-outline",
  star: "star-outline",
  image: "image-outline",
  folder: "folder-outline",
  "message-square": "chatbox-outline",
};

export function iconFor(name: string | undefined): IconName {
  return ICONS[name ?? ""] ?? "albums-outline";
}
