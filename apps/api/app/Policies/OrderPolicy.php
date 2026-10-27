<?php

namespace App\Policies;

use App\Models\Order;
use App\Models\User;

/**
 * Who may do what with Orders. Generated once — this file is yours.
 *
 * Each action asks for a permission, which a person has through their roles
 * (the dashboard's Roles screen). Add your own conditions beside them, e.g.
 * `return $user->can('orders.edit') && $order->user_id === $user->id;`.
 */
class OrderPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('orders.view');
    }

    public function view(User $user, Order $order): bool
    {
        return $user->can('orders.view');
    }

    public function create(User $user): bool
    {
        return $user->can('orders.create');
    }

    public function update(User $user, Order $order): bool
    {
        return $user->can('orders.edit');
    }

    public function delete(User $user, Order $order): bool
    {
        return $user->can('orders.delete');
    }

    /** Bring a deleted one back from the trash. */
    public function restore(User $user, Order $order): bool
    {
        return $user->can('orders.delete');
    }

    /** Remove a deleted one from the trash, for good. */
    public function forceDelete(User $user, Order $order): bool
    {
        return $user->can('orders.delete');
    }
}
