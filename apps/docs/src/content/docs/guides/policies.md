---
title: "Roles and policies"
description: "Who may do what: Laravel policies decide, and the dashboard can hide what a role cannot use."
---

## Laravel decides

Each resource gets a policy at `app/Policies/<Name>Policy.php` with `viewAny`, `view`, `create`, `update` and `delete`. All five return `true` to begin with, which means any signed-in user can do everything. Change them before real use:

```php
public function delete(User $user, Product $product): bool
{
    return $user->role === 'admin';
}
```

Laravel checks the policy on every request and answers 403 when it says no. The dashboard shows that as an error message.

## Hiding buttons in the dashboard

`policies/index.ts` can hide actions a role cannot use:

```ts
export const policies: Record<string, Policy> = {
  Product: { read: ["admin", "staff"], create: ["admin"], update: ["admin"], delete: ["admin"] },
};
```

This only changes what is shown. Laravel's policy is what is enforced, and a resource with no entry here shows every button and lets Laravel answer.

The role comes from a `role` attribute on the Laravel user. A fresh Laravel app has no such column; add one if you want roles.
