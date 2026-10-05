<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Nevela\Laravel\Auth\AuthMail;
use Nevela\Laravel\Auth\Passkeys;
use Nevela\Laravel\Auth\Totp;
use Nevela\Laravel\Media\ImageOptimizer;
use Nevela\Laravel\Media\Uploads;
use Nevela\Laravel\Models\Passkey;
use Nevela\Laravel\Models\TwoFactor;
use Tests\TestCase;

/**
 * Signing in and looking after an account, over HTTP: passwords, a second step,
 * passkeys, emailed links and codes, the profile picture and the list of devices.
 */
class AuthTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct horse battery staple';

    private const ORIGIN = 'http://localhost:3000';

    protected function setUp(): void
    {
        parent::setUp();
        // These tests sign in far more often than ten times a minute. The limit has a test of its own.
        if ($this->name() !== 'test_guessing_passwords_is_slowed_down') {
            $this->withoutMiddleware(ThrottleRequests::class);
        }
        Notification::fake();
        Storage::fake('public');
        Storage::fake('local');
        Uploads::forget();
        Cache::flush();
        AuthMail::$outbox = [];
    }

    private function user(array $attributes = []): User
    {
        return User::factory()->create($attributes + ['email' => 'ada@example.com', 'password' => Hash::make(self::PASSWORD)]);
    }

    /** Sign in and return headers that carry the token. @return array<string, string> */
    private function signedIn(User $user): array
    {
        $token = $this->postJson('/api/auth/token', ['email' => $user->email, 'password' => self::PASSWORD])->assertCreated()->json('token');
        $this->app['auth']->forgetGuards();

        return ['Authorization' => "Bearer {$token}", 'X-Nevela-Origin' => self::ORIGIN];
    }

    /** The code in the last email "sent". */
    private function emailedCode(): string
    {
        preg_match('/\b(\d{6})\b/', implode(' ', end(AuthMail::$outbox)['lines']), $m);

        return $m[1];
    }

    private function emailedLink(): string
    {
        return end(AuthMail::$outbox)['action'][1];
    }

    public function test_nobody_can_register_until_the_app_allows_it(): void
    {
        $this->postJson('/api/auth/register', ['name' => 'Ada', 'email' => 'ada@example.com', 'password' => self::PASSWORD])->assertNotFound();
        $this->getJson('/api/auth/config')->assertJsonPath('registration', false);
        $this->assertSame(0, User::count());
    }

    public function test_someone_can_register_and_is_sent_a_code_that_verifies_their_address(): void
    {
        config(['nevela.auth.registration' => true]);
        $response = $this->postJson('/api/auth/register', ['name' => 'Ada', 'email' => 'Ada@Example.com', 'password' => self::PASSWORD])->assertCreated();
        $response->assertJsonPath('user.email', 'ada@example.com')->assertJsonPath('user.emailVerified', false);
        $headers = ['Authorization' => 'Bearer '.$response->json('token')];

        $this->assertStringContainsString('/verify-email?', $this->emailedLink());
        $this->withHeaders($headers)->postJson('/api/auth/email/verify', ['email' => 'ada@example.com', 'code' => '000000'])->assertStatus(401)->assertJsonPath('code', 'INVALID_OTP');
        $this->withHeaders($headers)->postJson('/api/auth/email/verify', ['email' => 'ada@example.com', 'code' => $this->emailedCode()])->assertOk()->assertJsonPath('user.emailVerified', true);

        // The same address again, a short password, and registration switched off.
        $this->postJson('/api/auth/register', ['name' => 'Ada', 'email' => 'ada@example.com', 'password' => self::PASSWORD])->assertStatus(422)->assertJsonPath('code', 'USER_ALREADY_EXISTS');
        $this->postJson('/api/auth/register', ['name' => 'Bo', 'email' => 'bo@example.com', 'password' => 'short'])->assertStatus(422);
        config(['nevela.auth.registration' => false]);
        $this->postJson('/api/auth/register', ['name' => 'Bo', 'email' => 'bo@example.com', 'password' => self::PASSWORD])->assertNotFound();
    }

    public function test_a_wrong_password_and_an_unknown_address_get_the_same_answer(): void
    {
        $this->user();

        $wrong = $this->postJson('/api/auth/token', ['email' => 'ada@example.com', 'password' => 'not it'])->assertStatus(401);
        $unknown = $this->postJson('/api/auth/token', ['email' => 'nobody@example.com', 'password' => 'not it'])->assertStatus(401);
        $this->assertSame($wrong->json(), $unknown->json());
        $this->assertSame('INVALID_EMAIL_OR_PASSWORD', $wrong->json('code'));
    }

    public function test_an_unverified_address_cannot_sign_in_when_verification_is_required(): void
    {
        config(['nevela.auth.require_email_verification' => true]);
        $this->user(['email_verified_at' => null]);

        $this->postJson('/api/auth/token', ['email' => 'ada@example.com', 'password' => self::PASSWORD])->assertStatus(403)->assertJsonPath('code', 'EMAIL_NOT_VERIFIED');
        // A fresh code was sent, and using it signs them in.
        $this->postJson('/api/auth/email/verify', ['email' => 'ada@example.com', 'code' => $this->emailedCode()])->assertCreated()->assertJsonStructure(['token']);
    }

    public function test_a_forgotten_password_is_reset_by_an_emailed_link_that_works_once_and_signs_every_device_out(): void
    {
        $user = $this->user();
        $old = $this->signedIn($user);

        $this->postJson('/api/auth/password/forgot', ['email' => 'nobody@example.com'], ['X-Nevela-Origin' => self::ORIGIN])->assertOk();
        $this->assertSame([], AuthMail::$outbox);
        $this->postJson('/api/auth/password/forgot', ['email' => 'ada@example.com'], ['X-Nevela-Origin' => 'http://localhost:3001'])->assertOk();
        // The link goes to the dashboard that asked, on whatever port it is using.
        $this->assertStringStartsWith('http://localhost:3001/reset-password?token=', $this->emailedLink());
        parse_str((string) parse_url($this->emailedLink(), PHP_URL_QUERY), $query);

        $this->postJson('/api/auth/password/reset', ['token' => $query['token'], 'newPassword' => 'short'])->assertStatus(422);
        $this->postJson('/api/auth/password/reset', ['token' => 'made-up', 'newPassword' => 'a brand new passphrase'])->assertStatus(401);
        // (The short attempt used the link up: one link, one try.)
        $this->postJson('/api/auth/password/forgot', ['email' => 'ada@example.com'])->assertOk();
        parse_str((string) parse_url($this->emailedLink(), PHP_URL_QUERY), $query);
        $this->postJson('/api/auth/password/reset', ['token' => $query['token'], 'newPassword' => 'a brand new passphrase'])->assertOk();
        $this->postJson('/api/auth/password/reset', ['token' => $query['token'], 'newPassword' => 'another passphrase'])->assertStatus(401);

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/auth/me', $old)->assertUnauthorized();
        $this->postJson('/api/auth/token', ['email' => 'ada@example.com', 'password' => 'a brand new passphrase'])->assertCreated();
    }

    public function test_a_link_in_an_email_never_points_at_someone_elses_site(): void
    {
        $this->user();

        $this->postJson('/api/auth/password/forgot', ['email' => 'ada@example.com'], ['X-Nevela-Origin' => 'https://evil.example'])->assertOk();
        $this->assertStringStartsWith(rtrim((string) config('nevela.auth.web_url'), '/').'/reset-password', $this->emailedLink());
    }

    public function test_changing_the_password_takes_the_current_one_and_can_sign_other_devices_out(): void
    {
        $user = $this->user();
        $other = $this->signedIn($user);
        $here = $this->signedIn($user);

        $this->postJson('/api/auth/password', ['currentPassword' => 'wrong', 'newPassword' => 'a brand new passphrase'], $here)->assertStatus(422)->assertJsonPath('code', 'INVALID_PASSWORD');
        $this->postJson('/api/auth/password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'a brand new passphrase', 'revokeOtherSessions' => true], $here)->assertOk();

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/auth/me', $here)->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/auth/me', $other)->assertUnauthorized();
    }

    public function test_an_authenticator_app_is_set_up_confirmed_and_then_asked_for_at_sign_in(): void
    {
        $user = $this->user();
        $headers = $this->signedIn($user);

        $this->postJson('/api/auth/two-factor/enable', ['password' => 'wrong', 'method' => 'totp'], $headers)->assertStatus(422);
        $setup = $this->postJson('/api/auth/two-factor/enable', ['password' => self::PASSWORD, 'method' => 'totp'], $headers)->assertOk()->json();
        $this->assertStringStartsWith('otpauth://totp/', $setup['totpURI']);
        $this->assertCount(10, $setup['backupCodes']);

        // Not on until a code from the app proves it has the secret.
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/auth/token', ['email' => $user->email, 'password' => self::PASSWORD])->assertCreated();
        $this->postJson('/api/auth/two-factor/confirm', ['code' => '000000'], $headers)->assertStatus(422);
        $this->postJson('/api/auth/two-factor/confirm', ['code' => Totp::code($setup['secret'])], $headers)->assertOk()->assertJsonPath('user.twoFactorEnabled', true);

        // The secret is not readable in the database.
        $this->assertStringNotContainsString($setup['secret'], (string) TwoFactor::query()->toBase()->value('secret'));

        // Now the password alone is not enough.
        $this->app['auth']->forgetGuards();
        $first = $this->postJson('/api/auth/token', ['email' => $user->email, 'password' => self::PASSWORD])->assertOk();
        $first->assertJsonMissingPath('token')->assertJsonPath('twoFactor', true)->assertJsonPath('methods', ['totp', 'email', 'backup']);
        $challenge = $first->json('challenge');

        $this->postJson('/api/auth/two-factor/verify', ['challenge' => $challenge, 'method' => 'totp', 'code' => '000000'])->assertStatus(401)->assertJsonPath('code', 'INVALID_TWO_FACTOR_CODE');
        // The code that confirmed the app is spent, so it can't also sign in.
        $this->postJson('/api/auth/two-factor/verify', ['challenge' => $challenge, 'method' => 'totp', 'code' => Totp::code($setup['secret'])])->assertStatus(401);
        // The app's next code can.
        $next = Totp::code($setup['secret'], time() + 30);
        $this->postJson('/api/auth/two-factor/verify', ['challenge' => $challenge, 'method' => 'totp', 'code' => $next])->assertCreated()->assertJsonStructure(['token']);
        // A finished challenge can't be replayed,
        $this->postJson('/api/auth/two-factor/verify', ['challenge' => $challenge, 'method' => 'totp', 'code' => $next])->assertStatus(401)->assertJsonPath('code', 'SESSION_EXPIRED');
        // and neither can the code, in a new sign-in: someone who watched it typed has nothing.
        $again = $this->postJson('/api/auth/token', ['email' => $user->email, 'password' => self::PASSWORD])->json('challenge');
        $this->postJson('/api/auth/two-factor/verify', ['challenge' => $again, 'method' => 'totp', 'code' => $next])->assertStatus(401)->assertJsonPath('code', 'INVALID_TWO_FACTOR_CODE');
    }

    public function test_an_emailed_link_or_code_still_owes_the_authenticator_app(): void
    {
        $user = $this->user();
        $headers = $this->signedIn($user);
        $setup = $this->postJson('/api/auth/two-factor/enable', ['password' => self::PASSWORD, 'method' => 'totp'], $headers)->json();
        $this->postJson('/api/auth/two-factor/confirm', ['code' => Totp::code($setup['secret'])], $headers)->assertOk();
        $this->app['auth']->forgetGuards();

        // Getting into the mailbox is not enough: the app is asked for, and email isn't offered again.
        $this->postJson('/api/auth/email-code', ['email' => $user->email])->assertOk();
        $byCode = $this->postJson('/api/auth/email-code/verify', ['email' => $user->email, 'code' => $this->emailedCode()])->assertOk();
        $byCode->assertJsonMissingPath('token')->assertJsonPath('twoFactor', true)->assertJsonPath('methods', ['totp', 'backup']);
        $this->postJson('/api/auth/two-factor/send', ['challenge' => $byCode->json('challenge')])->assertStatus(422)->assertJsonPath('code', 'METHOD_NOT_ALLOWED');
        $this->postJson('/api/auth/two-factor/verify', ['challenge' => $byCode->json('challenge'), 'method' => 'email', 'code' => '123456'])->assertStatus(422);
        $this->postJson('/api/auth/two-factor/verify', ['challenge' => $byCode->json('challenge'), 'method' => 'totp', 'code' => Totp::code($setup['secret'], time() + 30)])->assertCreated();

        $this->postJson('/api/auth/magic-link', ['email' => $user->email])->assertOk();
        parse_str((string) parse_url($this->emailedLink(), PHP_URL_QUERY), $query);
        $this->postJson('/api/auth/magic-link/verify', ['token' => $query['token']])->assertOk()->assertJsonMissingPath('token')->assertJsonPath('methods', ['totp', 'backup']);
    }

    public function test_an_account_whose_second_step_is_email_signs_in_by_email_alone(): void
    {
        $user = $this->user();
        $this->postJson('/api/auth/two-factor/enable', ['password' => self::PASSWORD, 'method' => 'email'], $this->signedIn($user))->assertOk();
        $this->app['auth']->forgetGuards();

        // Their second step is the mailbox, and the mailbox is what they just proved.
        $this->postJson('/api/auth/email-code', ['email' => $user->email])->assertOk();
        $this->postJson('/api/auth/email-code/verify', ['email' => $user->email, 'code' => $this->emailedCode()])->assertCreated()->assertJsonStructure(['token']);
        // A password still asks for it.
        $this->postJson('/api/auth/token', ['email' => $user->email, 'password' => self::PASSWORD])->assertOk()->assertJsonPath('twoFactor', true);
    }

    public function test_the_second_step_can_be_an_emailed_code_or_a_backup_code_used_once(): void
    {
        $user = $this->user();
        $headers = $this->signedIn($user);
        $setup = $this->postJson('/api/auth/two-factor/enable', ['password' => self::PASSWORD, 'method' => 'totp'], $headers)->json();
        $this->postJson('/api/auth/two-factor/confirm', ['code' => Totp::code($setup['secret'])], $headers)->assertOk();
        $this->app['auth']->forgetGuards();

        $challenge = $this->postJson('/api/auth/token', ['email' => $user->email, 'password' => self::PASSWORD])->json('challenge');
        $this->postJson('/api/auth/two-factor/send', ['challenge' => $challenge])->assertOk();
        $this->postJson('/api/auth/two-factor/verify', ['challenge' => $challenge, 'method' => 'email', 'code' => $this->emailedCode()])->assertCreated();

        $backup = $setup['backupCodes'][3];
        $challenge = $this->postJson('/api/auth/token', ['email' => $user->email, 'password' => self::PASSWORD])->json('challenge');
        $this->postJson('/api/auth/two-factor/verify', ['challenge' => $challenge, 'method' => 'backup', 'code' => strtoupper($backup)])->assertCreated();
        $challenge = $this->postJson('/api/auth/token', ['email' => $user->email, 'password' => self::PASSWORD])->json('challenge');
        $this->postJson('/api/auth/two-factor/verify', ['challenge' => $challenge, 'method' => 'backup', 'code' => $backup])->assertStatus(401);
    }

    public function test_guessing_a_second_step_code_ends_the_sign_in_after_five_tries(): void
    {
        $user = $this->user();
        $headers = $this->signedIn($user);
        $this->postJson('/api/auth/two-factor/enable', ['password' => self::PASSWORD, 'method' => 'email'], $headers)->assertOk()->assertJsonPath('enabled', true);
        $this->app['auth']->forgetGuards();

        $challenge = $this->postJson('/api/auth/token', ['email' => $user->email, 'password' => self::PASSWORD])->assertJsonPath('methods', ['email', 'backup'])->json('challenge');
        $this->postJson('/api/auth/two-factor/send', ['challenge' => $challenge])->assertOk();
        $code = $this->emailedCode();
        for ($try = 1; $try <= 4; $try++) {
            $this->postJson('/api/auth/two-factor/verify', ['challenge' => $challenge, 'method' => 'email', 'code' => '111111'])->assertStatus(401);
        }
        $this->postJson('/api/auth/two-factor/verify', ['challenge' => $challenge, 'method' => 'email', 'code' => '111111'])->assertStatus(429)->assertJsonPath('code', 'TOO_MANY_ATTEMPTS');
        // Even the right code is too late now.
        $this->postJson('/api/auth/two-factor/verify', ['challenge' => $challenge, 'method' => 'email', 'code' => $code])->assertStatus(401);
    }

    public function test_two_factor_is_turned_off_with_the_password_and_backup_codes_can_be_replaced(): void
    {
        $user = $this->user();
        $headers = $this->signedIn($user);
        $old = $this->postJson('/api/auth/two-factor/enable', ['password' => self::PASSWORD, 'method' => 'email'], $headers)->json('backupCodes');

        $new = $this->postJson('/api/auth/two-factor/backup-codes', ['password' => self::PASSWORD], $headers)->assertOk()->json('backupCodes');
        $this->assertCount(10, $new);
        $this->assertSame([], array_intersect($old, $new));

        $this->postJson('/api/auth/two-factor/disable', ['password' => 'wrong'], $headers)->assertStatus(422);
        $this->postJson('/api/auth/two-factor/disable', ['password' => self::PASSWORD], $headers)->assertOk();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/auth/token', ['email' => $user->email, 'password' => self::PASSWORD])->assertCreated();
    }

    public function test_an_emailed_link_signs_in_once_and_an_emailed_code_signs_in_too(): void
    {
        $this->user(['email_verified_at' => null]);

        $this->postJson('/api/auth/magic-link', ['email' => 'nobody@example.com'])->assertOk()->assertJson(['sent' => true]);
        $this->assertSame([], AuthMail::$outbox);
        $this->postJson('/api/auth/magic-link', ['email' => 'ada@example.com', 'next' => 'https://evil.example/x'], ['X-Nevela-Origin' => self::ORIGIN])->assertOk();
        parse_str((string) parse_url($this->emailedLink(), PHP_URL_QUERY), $query);
        $this->assertSame('/dashboard', $query['next']);
        // A tab or a backslash is dropped by browsers, which would make these "//evil.example".
        foreach (["/\t/evil.example", '/\\evil.example', "/\n/evil.example", '//evil.example'] as $next) {
            $this->postJson('/api/auth/magic-link', ['email' => 'ada@example.com', 'next' => $next], ['X-Nevela-Origin' => self::ORIGIN])->assertOk();
            parse_str((string) parse_url($this->emailedLink(), PHP_URL_QUERY), $bent);
            $this->assertSame('/dashboard', $bent['next'], json_encode($next));
        }
        $this->postJson('/api/auth/magic-link', ['email' => 'ada@example.com', 'next' => '/dashboard/products?q=tea'], ['X-Nevela-Origin' => self::ORIGIN])->assertOk();
        parse_str((string) parse_url($this->emailedLink(), PHP_URL_QUERY), $query);
        $this->assertSame('/dashboard/products?q=tea', $query['next']);

        $this->postJson('/api/auth/magic-link/verify', ['token' => $query['token']])->assertCreated()->assertJsonPath('user.emailVerified', true);
        $this->postJson('/api/auth/magic-link/verify', ['token' => $query['token']])->assertStatus(401);

        $this->postJson('/api/auth/email-code', ['email' => 'ada@example.com'])->assertOk();
        $code = $this->emailedCode();
        $this->postJson('/api/auth/email-code/verify', ['email' => 'ada@example.com', 'code' => '999999'])->assertStatus(401)->assertJsonPath('code', 'INVALID_OTP');
        $this->postJson('/api/auth/email-code/verify', ['email' => 'ADA@example.com', 'code' => $code])->assertCreated()->assertJsonStructure(['token']);
        $this->postJson('/api/auth/email-code/verify', ['email' => 'ada@example.com', 'code' => $code])->assertStatus(401);

        config(['nevela.auth.magic_link' => false, 'nevela.auth.email_code' => false]);
        $this->postJson('/api/auth/magic-link', ['email' => 'ada@example.com'])->assertNotFound();
        $this->postJson('/api/auth/email-code', ['email' => 'ada@example.com'])->assertNotFound();
    }

    public function test_a_passkey_is_added_and_then_signs_in_without_a_password(): void
    {
        $user = $this->user();
        $headers = $this->signedIn($user);
        $device = new SoftwareAuthenticator('localhost', self::ORIGIN);

        $start = $this->postJson('/api/auth/passkeys/options', [], $headers)->assertOk()->json();
        $this->assertSame('localhost', $start['options']['rp']['id']);
        $this->assertSame('required', $start['options']['authenticatorSelection']['residentKey']);
        $added = $this->postJson('/api/auth/passkeys', ['challenge' => $start['challenge'], 'name' => 'Test key', 'response' => $device->create($start['options'])], $headers)->assertCreated();
        $added->assertJsonPath('name', 'Test key');
        $this->getJson('/api/auth/passkeys', $headers)->assertJsonCount(1, 'data');
        // The same response a second time: the challenge is spent.
        $this->postJson('/api/auth/passkeys', ['challenge' => $start['challenge'], 'response' => $device->create($start['options'])], $headers)->assertStatus(422);

        $this->app['auth']->forgetGuards();
        $ask = $this->postJson('/api/auth/passkey/options', [], ['X-Nevela-Origin' => self::ORIGIN])->assertOk()->json();
        $this->assertSame([], $ask['options']['allowCredentials'] ?? []);
        $signedIn = $this->postJson('/api/auth/passkey', ['challenge' => $ask['challenge'], 'response' => $device->get($ask['options'], (string) $user->id)], ['X-Nevela-Origin' => self::ORIGIN])->assertCreated();
        $signedIn->assertJsonPath('user.email', 'ada@example.com')->assertJsonStructure(['token']);
        $this->assertNotNull(Passkey::first()->last_used_at);

        // Renamed and removed by its owner.
        $id = $added->json('id');
        $this->patchJson("/api/auth/passkeys/{$id}", ['name' => 'Laptop'], $headers)->assertOk()->assertJsonPath('name', 'Laptop');
        $this->deleteJson("/api/auth/passkeys/{$id}", [], $headers)->assertNoContent();
        $ask = $this->postJson('/api/auth/passkey/options', [], ['X-Nevela-Origin' => self::ORIGIN])->json();
        $this->postJson('/api/auth/passkey', ['challenge' => $ask['challenge'], 'response' => $device->get($ask['options'], (string) $user->id)], ['X-Nevela-Origin' => self::ORIGIN])->assertStatus(401);
    }

    public function test_a_passkey_sign_in_is_refused_when_anything_about_it_is_off(): void
    {
        $user = $this->user();
        $headers = $this->signedIn($user);
        $device = new SoftwareAuthenticator('localhost', self::ORIGIN);
        $start = $this->postJson('/api/auth/passkeys/options', [], $headers)->json();
        $this->postJson('/api/auth/passkeys', ['challenge' => $start['challenge'], 'response' => $device->create($start['options'])], $headers)->assertCreated();
        $this->app['auth']->forgetGuards();
        $origin = ['X-Nevela-Origin' => self::ORIGIN];
        $attempt = function (callable $tamper) use ($device, $user, $origin) {
            $ask = $this->postJson('/api/auth/passkey/options', [], $origin)->json();
            $response = $tamper($device->get($ask['options'], (string) $user->id), $ask);

            return $this->postJson('/api/auth/passkey', ['challenge' => $ask['challenge'], 'response' => $response], $origin);
        };

        // A signature from a different key.
        $other = new SoftwareAuthenticator('localhost', self::ORIGIN);
        $attempt(fn ($response, $ask) => ['id' => $response['id']] + $other->get($ask['options'], (string) $user->id))->assertStatus(401);
        // The ceremony ran on another site, which signed our challenge.
        $phishing = new SoftwareAuthenticator('localhost', 'https://evil-localhost', $device);
        $attempt(fn ($response, $ask) => $phishing->get($ask['options'], (string) $user->id))->assertStatus(401);
        // An answer to a different challenge.
        $attempt(fn ($response, $ask) => $device->get(['challenge' => Passkeys::encode(random_bytes(32))] + $ask['options'], (string) $user->id))->assertStatus(401);
        // The device claims the passkey is someone else's.
        $attempt(fn ($response) => ['userHandle' => Passkeys::encode('someone-else')] + $response)->assertStatus(401);
        // And untampered, it works.
        $attempt(fn ($response) => $response)->assertCreated();

        config(['nevela.auth.passkeys' => false]);
        $this->postJson('/api/auth/passkey/options', [], $origin)->assertNotFound();
    }

    public function test_the_profile_has_a_name_and_a_picture_that_is_optimised_like_any_image(): void
    {
        if (! ImageOptimizer::available()) {
            $this->markTestSkipped('PHP\'s GD extension is not installed.');
        }
        $user = $this->user();
        $headers = $this->signedIn($user);

        $this->patchJson('/api/auth/me', ['name' => 'Ada Okafor'], $headers)->assertOk()->assertJsonPath('user.name', 'Ada Okafor')->assertJsonPath('user.image', null);

        $image = imagecreatetruecolor(1600, 1200);
        imagefilledellipse($image, 800, 600, 900, 700, imagecolorallocate($image, 111, 0, 255));
        ob_start();
        imagejpeg($image, null, 90);
        $bytes = (string) ob_get_clean();
        $response = $this->call('PUT', '/api/auth/avatar?name=me.jpg', [], [], [], ['CONTENT_TYPE' => 'image/jpeg', 'HTTP_ACCEPT' => 'application/json', 'HTTP_AUTHORIZATION' => $headers['Authorization']], $bytes)->assertCreated();

        // The "avatar" profile: a 400×400 square, with an 80×80 thumbnail.
        $response->assertJsonPath('user.avatarFile.width', 400)->assertJsonPath('user.avatarFile.height', 400)->assertJsonPath('user.avatarFile.renditions.thumb.width', 80);
        $key = $response->json('user.avatar');
        $this->assertStringStartsWith('users/avatar/', $key);
        $this->assertSame($response->json('user.avatarFile.renditions.thumb.url'), $response->json('user.image'));
        Storage::disk('public')->assertExists($key);
        $this->get("/api/_nevela/files/{$key}")->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/auth/me', $headers)->assertJsonPath('user.avatar', $key);

        // Not a picture, someone else's picture, and removing it.
        $this->call('PUT', '/api/auth/avatar?name=x.png', [], [], [], ['CONTENT_TYPE' => 'image/png', 'HTTP_ACCEPT' => 'application/json', 'HTTP_AUTHORIZATION' => $headers['Authorization']], 'plain text')->assertStatus(422);
        $other = User::factory()->create(['password' => Hash::make(self::PASSWORD)]);
        $this->app['auth']->forgetGuards();
        $this->patchJson('/api/auth/me', ['avatar' => $key], $this->signedIn($other))->assertStatus(422);
        $this->app['auth']->forgetGuards();
        $this->patchJson('/api/auth/me', ['avatar' => null], $headers)->assertOk()->assertJsonPath('user.avatar', null);
    }

    public function test_devices_are_listed_with_the_browser_they_signed_in_from_and_can_be_signed_out(): void
    {
        $user = $this->user();
        // The dashboard speaks for the browser, and proves it is the dashboard with the shared secret.
        config(['nevela.auth.proxy_secret' => 'shared-with-the-dashboard']);
        $phone = $this->postJson('/api/auth/token', ['email' => $user->email, 'password' => self::PASSWORD], ['X-Nevela-User-Agent' => 'Mozilla/5.0 (iPhone) Safari/605', 'X-Nevela-Ip' => '203.0.113.9', 'X-Nevela-Proxy-Secret' => 'shared-with-the-dashboard'])->json('token');
        $this->app['auth']->forgetGuards();
        // Someone calling the API directly can send the same headers, and is not believed.
        $this->postJson('/api/auth/token', ['email' => $user->email, 'password' => self::PASSWORD], ['X-Nevela-User-Agent' => 'Trusted Laptop', 'X-Nevela-Ip' => '198.51.100.7', 'X-Nevela-Proxy-Secret' => 'a guess']);
        $this->assertSame(0, \Illuminate\Support\Facades\DB::table('personal_access_tokens')->where('ip_address', '198.51.100.7')->orWhere('user_agent', 'Trusted Laptop')->count());
        \Illuminate\Support\Facades\DB::table('personal_access_tokens')->whereNull('user_agent')->orWhere('user_agent', 'Symfony')->delete();
        $this->app['auth']->forgetGuards();
        $laptop = $this->signedIn($user);

        $list = $this->getJson('/api/auth/sessions', $laptop)->assertOk()->assertJsonCount(2, 'data');
        $rows = collect($list->json('data'));
        $this->assertSame('203.0.113.9', $rows->firstWhere('userAgent', 'Mozilla/5.0 (iPhone) Safari/605')['ipAddress']);
        $this->assertSame($list->json('current'), $rows->firstWhere('current', true)['id']);
        $this->app['auth']->forgetGuards();
        $this->assertSame($list->json('current'), $this->getJson('/api/auth/me', $laptop)->json('session.id'));

        $this->app['auth']->forgetGuards();
        $this->deleteJson('/api/auth/sessions', [], $laptop)->assertOk()->assertJsonPath('revoked', 1);
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/auth/me', ['Authorization' => "Bearer {$phone}"])->assertUnauthorized();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/auth/me', $laptop)->assertOk();

        // Someone else's device can't be signed out by guessing its id.
        $stranger = User::factory()->create(['password' => Hash::make(self::PASSWORD)]);
        $this->app['auth']->forgetGuards();
        $theirs = $this->signedIn($stranger);
        $this->app['auth']->forgetGuards();
        $this->deleteJson('/api/auth/sessions/'.$list->json('current'), [], $theirs)->assertNoContent();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/auth/me', $laptop)->assertOk();
    }

    public function test_only_so_many_codes_are_emailed_in_an_hour(): void
    {
        $this->user();

        // Each code allows five guesses, so the number of codes is what limits guessing.
        for ($sent = 1; $sent <= 6; $sent++) {
            $this->postJson('/api/auth/email-code', ['email' => 'ada@example.com'])->assertOk();
        }
        $this->assertCount(6, AuthMail::$outbox);
        // The seventh request gets the same answer, and no email.
        $this->postJson('/api/auth/email-code', ['email' => 'ada@example.com'])->assertOk()->assertJson(['sent' => true]);
        $this->assertCount(6, AuthMail::$outbox);
    }

    public function test_guessing_passwords_is_slowed_down(): void
    {
        $this->user();

        for ($try = 1; $try <= 10; $try++) {
            $this->postJson('/api/auth/token', ['email' => 'ada@example.com', 'password' => "guess {$try}"])->assertStatus(401);
        }
        // The eleventh in a minute is turned away before the password is even looked at.
        $this->postJson('/api/auth/token', ['email' => 'ada@example.com', 'password' => self::PASSWORD])->assertStatus(429);
    }

    public function test_the_sign_in_methods_are_published_and_account_pages_need_a_token(): void
    {
        $this->getJson('/api/auth/config')->assertOk()->assertJson(['registration' => false, 'passkeys' => true, 'twoFactor' => ['authenticator' => true, 'email' => true]]);

        foreach (['/api/auth/me', '/api/auth/sessions', '/api/auth/passkeys'] as $path) {
            $this->getJson($path)->assertUnauthorized();
        }
        $this->postJson('/api/auth/two-factor/enable', ['password' => 'x'])->assertUnauthorized();
        $this->postJson('/api/auth/passkeys/options')->assertUnauthorized();
    }
}

/**
 * A passkey device in software: an EC key pair that answers WebAuthn requests the way a
 * phone or a security key does, in the same binary formats.
 */
final class SoftwareAuthenticator
{
    private \OpenSSLAsymmetricKey $key;

    private string $credentialId;

    private int $counter = 0;

    /** @param self|null $sameKeyAs  Another device whose key and id to share (a copy of it) */
    public function __construct(private string $rpId, private string $origin, ?self $sameKeyAs = null)
    {
        $this->key = $sameKeyAs?->key ?? self::newKey();
        $this->credentialId = $sameKeyAs?->credentialId ?? random_bytes(32);
    }

    private static function newKey(): \OpenSSLAsymmetricKey
    {
        $options = ['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1'];
        $key = @openssl_pkey_new($options);
        if ($key === false) {
            // PHP on Windows often has no openssl.cnf to read, and refuses to make a key
            // without one. Any minimal file will do.
            $config = tempnam(sys_get_temp_dir(), 'openssl');
            file_put_contents($config, "[req]\ndistinguished_name = dn\n[dn]\n");
            $key = openssl_pkey_new($options + ['config' => $config]);
            @unlink($config);
        }
        if ($key === false) {
            throw new \RuntimeException('OpenSSL could not create a test key: '.openssl_error_string());
        }

        return $key;
    }

    /** @param array<string, mixed> $options @return array<string, mixed> */
    public function create(array $options): array
    {
        $ec = openssl_pkey_get_details($this->key)['ec'];
        $x = str_pad($ec['x'], 32, "\0", STR_PAD_LEFT);
        $y = str_pad($ec['y'], 32, "\0", STR_PAD_LEFT);
        // A COSE key: EC2, ES256, P-256.
        $cose = "\xA5\x01\x02\x03\x26\x20\x01\x21\x58\x20".$x."\x22\x58\x20".$y;
        // Flags: user present, user verified, attested credential data included.
        $authData = hash('sha256', $this->rpId, true)."\x45".pack('N', 0).str_repeat("\0", 16).pack('n', strlen($this->credentialId)).$this->credentialId.$cose;
        $attestation = "\xA3\x63fmt\x64none\x67attStmt\xA0\x68authData\x58".chr(strlen($authData)).$authData;

        return [
            'id' => Passkeys::encode($this->credentialId),
            'clientDataJSON' => Passkeys::encode($this->clientData('webauthn.create', $options['challenge'])),
            'attestationObject' => Passkeys::encode($attestation),
            'transports' => ['internal'],
        ];
    }

    /** @param array<string, mixed> $options @return array<string, mixed> */
    public function get(array $options, string $userHandle): array
    {
        $clientData = $this->clientData('webauthn.get', $options['challenge']);
        $authData = hash('sha256', $this->rpId, true)."\x05".pack('N', ++$this->counter);
        openssl_sign($authData.hash('sha256', $clientData, true), $signature, $this->key, OPENSSL_ALGO_SHA256);

        return [
            'id' => Passkeys::encode($this->credentialId),
            'clientDataJSON' => Passkeys::encode($clientData),
            'authenticatorData' => Passkeys::encode($authData),
            'signature' => Passkeys::encode($signature),
            'userHandle' => Passkeys::encode($userHandle),
        ];
    }

    private function clientData(string $type, string $challenge): string
    {
        return (string) json_encode(['type' => $type, 'challenge' => $challenge, 'origin' => $this->origin, 'crossOrigin' => false], JSON_UNESCAPED_SLASHES);
    }
}
