<?php

namespace App\Policies;

use App\Models\Category;
use App\Models\User;

/**
 * Who may do what with Categories. Generated once — this file is yours.
 *
 * Each action asks for a permission, which a person has through their roles
 * (the dashboard's Roles screen). Add your own conditions beside them, e.g.
 * `return $user->can('categories.edit') && $category->user_id === $user->id;`.
 */
class CategoryPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('categories.view');
    }

    public function view(User $user, Category $category): bool
    {
        return $user->can('categories.view');
    }

    public function create(User $user): bool
    {
        return $user->can('categories.create');
    }

    public function update(User $user, Category $category): bool
    {
        return $user->can('categories.edit');
    }

    public function delete(User $user, Category $category): bool
    {
        return $user->can('categories.delete');
    }
}
