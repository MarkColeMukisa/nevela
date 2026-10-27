<?php

namespace App\Policies;

use App\Models\OrderItem;
use App\Models\User;

/**
 * Who may do what with Order items. Generated once — this file is yours.
 *
 * Each action asks for a permission, which a person has through their roles
 * (the dashboard's Roles screen). Add your own conditions beside them, e.g.
 * `return $user->can('order_items.edit') && $orderItem->user_id === $user->id;`.
 */
class OrderItemPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('order_items.view');
    }

    public function view(User $user, OrderItem $orderItem): bool
    {
        return $user->can('order_items.view');
    }

    public function create(User $user): bool
    {
        return $user->can('order_items.create');
    }

    public function update(User $user, OrderItem $orderItem): bool
    {
        return $user->can('order_items.edit');
    }

    public function delete(User $user, OrderItem $orderItem): bool
    {
        return $user->can('order_items.delete');
    }

    /** Bring a deleted one back from the trash. */
    public function restore(User $user, OrderItem $orderItem): bool
    {
        return $user->can('order_items.delete');
    }

    /** Remove a deleted one from the trash, for good. */
    public function forceDelete(User $user, OrderItem $orderItem): bool
    {
        return $user->can('order_items.delete');
    }
}
