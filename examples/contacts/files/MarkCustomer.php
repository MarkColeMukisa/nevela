<?php

namespace App\Nevela\Actions\Contact;

use App\Models\Contact;

class MarkCustomer
{
    public function handle(Contact $contact, array $input): ?string
    {
        $contact->update(['status' => 'customer', 'last_contacted_on' => now()->toDateString()]);

        return "{$contact->name} is a customer now.";
    }
}
