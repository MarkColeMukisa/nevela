<?php

namespace App\Policies;

use App\Models\Category;
use App\Models\User;

/**
 * Who may do what with Categories. Generated once — this file is yours.
 *
 * Default: any signed-in user (routes already require auth:sanctum). Tighten this
 * before production, e.g. `return in_array($user->role, ['admin', 'staff']);`.
 */
class CategoryPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Category $category): bool
    {
        return true;
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, Category $category): bool
    {
        return true;
    }

    public function delete(User $user, Category $category): bool
    {
        return true;
    }
}
