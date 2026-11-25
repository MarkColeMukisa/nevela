<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Nevela\Laravel\Access\ClosedAccounts;
use Nevela\Laravel\Auth\AuthMail;
use Tests\TestCase;

/**
 * A forgotten password, from the phone: a 6-digit code by email, typed into the app with a new
 * password. Where there is a dashboard, its link still works as before.
 */
class PasswordResetCodeTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct horse battery staple';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Cache::flush();
        AuthMail::$outbox = [];
    }

    private function user(): User
    {
        return User::factory()->create(['email' => 'ada@example.com', 'password' => Hash::make(self::PASSWORD), 'email_verified_at' => null]);
    }

    private function emailedCode(): string
    {
        $mail = end(AuthMail::$outbox);
        $this->assertNull($mail['action'], 'a code, with no button');

        return (string) $mail['secret'];
    }

    public function test_the_phone_asks_for_a_code_and_chooses_a_new_password_with_it(): void
    {
        $ada = $this->user();
        // Signed in somewhere else: a reset ends that sign-in, in case it is someone else's.
        $elsewhere = $this->postJson('/api/auth/token', ['email' => 'ada@example.com', 'password' => self::PASSWORD])->assertCreated()->json('token');
        $this->app['auth']->forgetGuards();

        $this->postJson('/api/auth/password/forgot', ['email' => 'Ada@Example.com', 'method' => 'code'])->assertOk()->assertJson(['sent' => true, 'method' => 'code']);
        $code = $this->emailedCode();
        $this->assertMatchesRegularExpression('/^\d{6}$/', $code);

        $this->postJson('/api/auth/password/reset', ['email' => 'ada@example.com', 'code' => $code, 'newPassword' => 'a brand new passphrase'])->assertOk()->assertJsonPath('reset', true);

        $this->assertTrue(Hash::check('a brand new passphrase', $ada->refresh()->password));
        // The code came to the address, so the address is proved.
        $this->assertNotNull($ada->email_verified_at);
        $this->assertSame(0, DB::table('personal_access_tokens')->count(), 'every sign-in ended');
        $this->getJson('/api/auth/me', ['Authorization' => "Bearer {$elsewhere}"])->assertUnauthorized();
        // One code, one reset.
        $this->postJson('/api/auth/password/reset', ['email' => 'ada@example.com', 'code' => $code, 'newPassword' => 'another passphrase'])->assertStatus(401)->assertJsonPath('code', 'OTP_EXPIRED');
        // And the new password signs in.
        $this->postJson('/api/auth/token', ['email' => 'ada@example.com', 'password' => 'a brand new passphrase'])->assertCreated();
    }

    public function test_a_wrong_code_is_refused_and_too_many_end_it(): void
    {
        $this->user();
        $this->postJson('/api/auth/password/forgot', ['email' => 'ada@example.com', 'method' => 'code'])->assertOk();
        $code = $this->emailedCode();
        $wrong = $code === '000000' ? '111111' : '000000';

        $this->postJson('/api/auth/password/reset', ['email' => 'ada@example.com', 'code' => $wrong, 'newPassword' => 'a brand new passphrase'])->assertStatus(401)->assertJsonPath('code', 'INVALID_OTP');
        for ($i = 0; $i < 10; $i++) {
            $last = $this->postJson('/api/auth/password/reset', ['email' => 'ada@example.com', 'code' => $wrong, 'newPassword' => 'a brand new passphrase']);
            if ($last->status() === 429) {
                break;
            }
        }
        $last->assertStatus(429)->assertJsonPath('code', 'TOO_MANY_ATTEMPTS');
        // After that, even the right code is gone: a new one has to be asked for.
        $this->postJson('/api/auth/password/reset', ['email' => 'ada@example.com', 'code' => $code, 'newPassword' => 'a brand new passphrase'])->assertStatus(401)->assertJsonPath('code', 'OTP_EXPIRED');
    }

    public function test_it_says_the_same_for_an_address_with_no_account_and_sends_a_closed_one_nothing(): void
    {
        $this->postJson('/api/auth/password/forgot', ['email' => 'nobody@example.com', 'method' => 'code'])->assertOk()->assertJson(['sent' => true, 'method' => 'code']);
        $this->assertSame([], AuthMail::$outbox);

        $ada = $this->user();
        ClosedAccounts::close($ada);
        $this->postJson('/api/auth/password/forgot', ['email' => 'ada@example.com', 'method' => 'code'])->assertOk();
        $this->assertSame([], AuthMail::$outbox);
    }

    public function test_the_reset_answers_an_unknown_address_exactly_as_a_real_one(): void
    {
        $this->user();
        $answers = function (string $email): array {
            $this->postJson('/api/auth/password/forgot', ['email' => $email, 'method' => 'code'])->assertOk();
            $seen = [];
            for ($i = 0; $i < 10; $i++) {
                $answer = $this->postJson('/api/auth/password/reset', ['email' => $email, 'code' => '000000', 'newPassword' => 'a brand new passphrase']);
                $seen[] = $answer->status().' '.$answer->json('code');
                if ($answer->status() === 429) {
                    break;
                }
            }

            return $seen;
        };

        $real = $answers('ada@example.com');
        $unknown = $answers('nobody@example.com');
        // A wrong code, then too many tries, after the same number of attempts for both.
        $this->assertSame('401 INVALID_OTP', $real[0]);
        $this->assertSame('429 TOO_MANY_ATTEMPTS', end($real));
        $this->assertSame($real, $unknown);
    }

    public function test_the_email_is_sent_after_the_answer_and_is_sent(): void
    {
        \Illuminate\Support\Facades\Notification::fake();
        $this->user();

        $this->postJson('/api/auth/password/forgot', ['email' => 'ada@example.com', 'method' => 'code'])->assertOk();

        // Deferred to after the answer (so its time can't give the account away), and still delivered.
        $sent = \Illuminate\Support\Facades\Notification::sentNotifications();
        $this->assertCount(1, $sent, 'one email, to the account');
        $this->assertSame([\Illuminate\Notifications\AnonymousNotifiable::class], array_keys($sent));
    }

    public function test_the_dashboard_still_gets_a_link_unless_a_code_is_asked_for(): void
    {
        $this->user();
        $this->postJson('/api/auth/password/forgot', ['email' => 'ada@example.com'])->assertOk()->assertJsonPath('method', 'link');
        $this->assertStringContainsString('/reset-password?token=', end(AuthMail::$outbox)['action'][1]);

        $this->postJson('/api/auth/password/reset', ['newPassword' => 'a brand new passphrase'])->assertStatus(422);
        $this->postJson('/api/auth/password/reset', ['code' => '123456', 'newPassword' => 'a brand new passphrase'])->assertStatus(422);
    }
}
