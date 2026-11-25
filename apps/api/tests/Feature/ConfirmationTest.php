<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Auth\AuthMail;
use Nevela\Laravel\Auth\Confirmation;
use Nevela\Laravel\Support\Descriptor;
use Tests\GeneratesResources;
use Tests\TestCase;

/**
 * Confirming it's you again (Auth\Confirmation): a sensitive action asks each time, for that
 * exact request; changing who can sign in, where the app asks, opens a few minutes' window.
 */
class ConfirmationTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    private const PASSWORD = 'a long passphrase';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        AuthMail::$outbox = [];
        $this->resources(fn () => [Descriptor::fromArray([
            'name' => 'Payment',
            'fields' => ['payer' => ['kind' => 'string'], 'amount' => ['kind' => 'int'], 'status' => ['kind' => 'enum', 'options' => ['paid', 'refunded'], 'required' => false]],
            'actions' => ['refund' => ['label' => 'Refund', 'set' => ['status' => 'refunded'], 'sensitive' => true, 'many' => true, 'when' => ['status' => 'paid']]],
        ])]);
    }

    /** Signed in for real, so the confirmation is tied to a sign-in. @return array<string, string> */
    private function signIn(string $email = 'owner@example.com'): array
    {
        $user = User::query()->firstOrCreate(['email' => $email], ['name' => 'Owner', 'password' => Hash::make(self::PASSWORD)]);
        Access::grant($user, 'ADMIN');
        $token = $this->postJson('/api/auth/token', ['email' => $email, 'password' => self::PASSWORD])->assertCreated()->json('token');
        $this->app['auth']->forgetGuards();

        return ['Authorization' => "Bearer {$token}"];
    }

    private function payment(int $amount = 10): string
    {
        return (string) \App\Models\Payment::query()->create(['payer' => 'Ada', 'amount' => $amount, 'status' => 'paid'])->getKey();
    }

    private function confirm(array $as, string $challenge, array $with = ['method' => 'password', 'password' => self::PASSWORD]): \Illuminate\Testing\TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->postJson('/api/auth/confirm', ['challenge' => $challenge] + $with, $as);
    }

    public function test_a_sensitive_action_asks_each_time_and_runs_once_confirmed(): void
    {
        $as = $this->signIn();
        $id = $this->payment();

        $asked = $this->postJson("/api/payments/{$id}/_actions/refund", [], $as)->assertStatus(428)
            ->assertJsonPath('code', 'CONFIRMATION_REQUIRED')->assertJsonPath('window', false);
        $this->assertSame(['password', 'email'], $asked->json('methods'));
        $this->assertSame('paid', \App\Models\Payment::query()->find($id)->status);

        // A wrong password counts, and confirms nothing.
        $this->confirm($as, $asked->json('challenge'), ['method' => 'password', 'password' => 'not it'])->assertStatus(422)->assertJsonPath('code', 'NOT_CONFIRMED');
        $token = $this->confirm($as, $asked->json('challenge'))->assertOk()->json('confirmation');
        $this->assertNotEmpty($token);
        // The challenge confirms once.
        $this->confirm($as, $asked->json('challenge'))->assertStatus(410);

        $this->app['auth']->forgetGuards();
        $this->postJson("/api/payments/{$id}/_actions/refund", [], $as + [Confirmation::HEADER => $token])->assertOk();
        $this->assertSame('refunded', \App\Models\Payment::query()->find($id)->status);

        // The token works once.
        $other = $this->payment();
        $this->app['auth']->forgetGuards();
        $this->postJson("/api/payments/{$other}/_actions/refund", [], $as + [Confirmation::HEADER => $token])->assertStatus(428);
    }

    public function test_a_confirmation_is_for_that_request_alone(): void
    {
        $as = $this->signIn();
        [$a, $b] = [$this->payment(10), $this->payment(10000)];

        // Confirmed for refunding one; sent with both, it is another request.
        $challenge = $this->postJson('/api/payments/_actions/refund', ['ids' => [$a]], $as)->assertStatus(428)->json('challenge');
        $token = $this->confirm($as, $challenge)->json('confirmation');
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/payments/_actions/refund', ['ids' => [$a, $b]], $as + [Confirmation::HEADER => $token])->assertStatus(428);

        // Another person, or another sign-in of the same person, can't use it.
        $challenge = $this->postJson('/api/payments/_actions/refund', ['ids' => [$a]], $as)->assertStatus(428)->json('challenge');
        $token = $this->confirm($as, $challenge)->json('confirmation');
        $elsewhere = $this->signIn();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/payments/_actions/refund', ['ids' => [$a]], $elsewhere + [Confirmation::HEADER => $token])->assertStatus(428);
        $someoneElse = $this->signIn('eve@example.com');
        $this->confirm($someoneElse, $challenge)->assertStatus(410);

        // Nor once its minutes are up.
        $this->travel(Confirmation::SECONDS + 1)->seconds();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/payments/_actions/refund', ['ids' => [$a]], $as + [Confirmation::HEADER => $token])->assertStatus(428);
    }

    public function test_it_can_be_confirmed_with_an_emailed_code(): void
    {
        $as = $this->signIn();
        $id = $this->payment();
        $challenge = $this->postJson("/api/payments/{$id}/_actions/refund", [], $as)->json('challenge');

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/auth/confirm/send', ['challenge' => $challenge], $as)->assertOk();
        $code = end(AuthMail::$outbox)['secret'];
        $this->confirm($as, $challenge, ['method' => 'email', 'code' => '000000'])->assertStatus(422);
        $token = $this->confirm($as, $challenge, ['method' => 'email', 'code' => $code])->assertOk()->json('confirmation');

        $this->app['auth']->forgetGuards();
        $this->postJson("/api/payments/{$id}/_actions/refund", [], $as + [Confirmation::HEADER => $token])->assertOk();
    }

    public function test_a_request_that_would_be_refused_is_not_asked_about(): void
    {
        $as = $this->signIn();
        $id = $this->payment();
        \App\Models\Payment::query()->whereKey($id)->update(['status' => 'refunded']);

        // Already refunded: the action doesn't apply, and that is the answer, not a question.
        $this->postJson("/api/payments/{$id}/_actions/refund", [], $as)->assertStatus(409);
    }

    public function test_changing_who_can_sign_in_asks_once_for_a_few_minutes_where_the_app_says_so(): void
    {
        $as = $this->signIn();
        $role = (string) \Nevela\Laravel\Models\Role::query()->where('name', 'USER')->value('id');
        $make = fn (string $email) => $this->postJson('/api/_nevela/users', ['name' => 'New', 'email' => $email, 'password' => 'another long passphrase', 'roles' => [$role]], $as);

        // Off, as in an app from before it: nothing asked.
        $make('one@example.com')->assertCreated();

        config(['nevela.auth.confirm.access' => true]);
        $this->app['auth']->forgetGuards();
        $asked = $make('two@example.com')->assertStatus(428)->assertJsonPath('window', true);
        $this->assertFalse(User::query()->where('email', 'two@example.com')->exists());
        $this->confirm($as, $asked->json('challenge'))->assertOk()->assertJsonMissingPath('confirmation');

        // For the next few minutes, on this sign-in, nothing more is asked.
        $this->app['auth']->forgetGuards();
        $make('two@example.com')->assertCreated();
        $this->app['auth']->forgetGuards();
        $three = $make('three@example.com')->assertCreated()->json('id');
        $this->app['auth']->forgetGuards();
        $this->patchJson("/api/_nevela/users/{$three}", ['name' => 'Renamed'], $as)->assertOk();

        // Another sign-in is asked for itself.
        $other = $this->signIn();
        $this->app['auth']->forgetGuards();
        $this->deleteJson("/api/_nevela/users/{$three}", [], $other)->assertStatus(428);

        // And after the window, this one is asked again.
        $this->travel(Confirmation::windowSeconds() + 1)->seconds();
        $this->app['auth']->forgetGuards();
        $this->deleteJson("/api/_nevela/users/{$three}", [], $as)->assertStatus(428);
        // A name alone isn't who can sign in.
        $this->app['auth']->forgetGuards();
        $this->patchJson("/api/_nevela/users/{$three}", ['name' => 'Again'], $as)->assertOk();
    }
}
