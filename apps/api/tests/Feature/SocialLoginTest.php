<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Socialite\Two\User as ProviderUser;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Access\ClosedAccounts;
use Nevela\Laravel\Auth\Social;
use Nevela\Laravel\Auth\Totp;
use Nevela\Laravel\Models\TwoFactor;
use Tests\TestCase;

/**
 * Signing in with Google or GitHub, as the dashboard's server does it: it asks where to
 * send the browser, and hands back the code the provider returned. The provider itself is
 * stood in for (Social::$fake), since a test has no Google to ask.
 */
class SocialLoginTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:3000';

    /** Who each code stands for at the provider. @var array<string, array<string, mixed>> */
    private array $people = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Cache::flush();
        Access::reset();
        config([
            'nevela.auth.social.enabled' => true,
            'nevela.auth.social.google' => ['client_id' => 'google-id', 'client_secret' => 'google-secret'],
            'nevela.auth.social.github' => ['client_id' => 'github-id', 'client_secret' => 'github-secret'],
            'nevela.auth.registration' => false,
        ]);
        Social::$fake = function (string $provider, string $code): ProviderUser {
            $person = $this->people[$code] ?? throw new \RuntimeException('The provider refused the code.');

            return (new ProviderUser)->setRaw($person['raw'] ?? [])->map([
                'id' => $person['id'],
                'email' => $person['email'] ?? null,
                'name' => $person['name'] ?? null,
                'nickname' => $person['nickname'] ?? null,
            ]);
        };
    }

    protected function tearDown(): void
    {
        Social::$fake = null;
        parent::tearDown();
    }

    /** A person at Google, by the code that will stand for them. */
    private function atGoogle(string $code, string $id, ?string $email, bool $verified = true, string $name = 'Ada Lovelace'): void
    {
        $this->people[$code] = ['id' => $id, 'email' => $email, 'name' => $name, 'raw' => ['sub' => $id, 'email' => $email, 'email_verified' => $verified]];
    }

    /** @return array{url: string, state: string} */
    private function start(string $provider = 'google', array $body = [], array $headers = []): array
    {
        return $this->postJson("/api/auth/oauth/{$provider}/start", $body + ['next' => '/dashboard/orders'], ['X-Nevela-Origin' => self::ORIGIN] + $headers)->assertOk()->json();
    }

    private function back(string $state, string $code, string $provider = 'google', array $headers = [])
    {
        $this->app['auth']->forgetGuards();

        return $this->postJson("/api/auth/oauth/{$provider}/callback", ['state' => $state, 'code' => $code], ['X-Nevela-Origin' => self::ORIGIN] + $headers);
    }

    private function user(array $attributes = []): User
    {
        return User::factory()->create($attributes + ['email' => 'ada@example.com', 'password' => Hash::make('a password of hers')]);
    }

    // --- the switch, and the keys

    public function test_the_switch_and_the_keys_decide_which_buttons_there_are(): void
    {
        $this->getJson('/api/auth/config')->assertOk()->assertJsonPath('social', ['google', 'github']);

        // A provider with no keys isn't offered, and can't be started.
        config(['nevela.auth.social.github' => ['client_id' => '', 'client_secret' => '']]);
        $this->getJson('/api/auth/config')->assertJsonPath('social', ['google'])->assertJsonPath('socialNeedsKeys', false);
        $this->postJson('/api/auth/oauth/github/start')->assertNotFound()->assertJsonPath('code', 'NOT_ENABLED');

        // Switched on with no keys at all: the sign-in page is told, so it can say so. Not in production.
        $google = config('nevela.auth.social.google');
        config(['nevela.auth.social.google' => ['client_id' => '', 'client_secret' => '']]);
        $this->getJson('/api/auth/config')->assertJsonPath('social', [])->assertJsonPath('socialNeedsKeys', true);
        $this->app['env'] = 'production';
        $this->getJson('/api/auth/config')->assertJsonPath('socialNeedsKeys', false);
        $this->app['env'] = 'testing';
        config(['nevela.auth.social.google' => $google]);

        // Switched off, there is none, whatever keys there are.
        config(['nevela.auth.social.enabled' => false]);
        $this->getJson('/api/auth/config')->assertJsonPath('social', []);
        $this->postJson('/api/auth/oauth/google/start')->assertNotFound()->assertJsonPath('code', 'NOT_ENABLED');
        $this->postJson('/api/auth/oauth/google/callback', ['state' => 'x', 'code' => 'y'])->assertNotFound();
        // And a provider Nevela doesn't know is no provider.
        config(['nevela.auth.social.enabled' => true]);
        $this->postJson('/api/auth/oauth/myspace/start')->assertNotFound();
    }

    public function test_the_browser_is_sent_to_the_provider_with_our_state_and_back_to_the_dashboard(): void
    {
        $started = $this->start();

        $url = parse_url($started['url']);
        parse_str($url['query'], $query);
        $this->assertSame('accounts.google.com', $url['host']);
        $this->assertSame('google-id', $query['client_id']);
        $this->assertSame($started['state'], $query['state']);
        // The provider sends the browser to the dashboard, whose server hands the code on.
        $this->assertSame(self::ORIGIN.'/api/auth/oauth/google/callback', $query['redirect_uri']);
        $this->assertStringContainsString('email', $query['scope']);

        $github = parse_url($this->start('github')['url']);
        $this->assertSame('github.com', $github['host']);
    }

    // --- from a mobile app

    private const APP = 'juice-me://oauth';

    /** The secret an app keeps while its browser is away, and which proves it is the app that started the sign-in. */
    private const VERIFIER = 'Zr3pLm9Qx1vTkYw7bN2cHdEfGaJuIoSt5RhVn8MqXe0';

    /** An app starts a sign-in with Google, as the one called juice-me. @return array{url: string, state: string} */
    private function appStarts(array $app = [], string $verifier = self::VERIFIER): array
    {
        config(['nevela.auth.social.app_redirects' => ['juice-me://'], 'app.url' => 'https://api.example.com']);

        return $this->postJson('/api/auth/oauth/google/start', ['app' => $app + ['redirect' => self::APP, 'challenge' => Social::appChallenge($verifier)]])->assertOk()->json();
    }

    /** The provider sends the browser back to the API, which asks it who this is and hands the browser to the app. */
    private function providerReturns(string $state, string $code)
    {
        return $this->get('/api/auth/oauth/google/app?state='.$state.'&code='.$code);
    }

    private function appFinishes(string $state, ?string $verifier = self::VERIFIER)
    {
        $this->app['auth']->forgetGuards();

        return $this->postJson('/api/auth/oauth/google/callback', array_filter(['state' => $state, 'appVerifier' => $verifier], fn ($value) => $value !== null));
    }

    public function test_an_app_has_the_provider_send_the_browser_back_to_the_apis_own_address(): void
    {
        $started = $this->appStarts();

        parse_str((string) parse_url($started['url'], PHP_URL_QUERY), $query);
        // Not the dashboard's: the API hands the browser on to the app. This is the address to register with Google.
        $this->assertSame('https://api.example.com/api/auth/oauth/google/app', $query['redirect_uri']);
        $this->assertSame($started['state'], $query['state']);
    }

    public function test_an_app_is_only_sent_back_to_an_address_its_owner_listed(): void
    {
        config(['nevela.auth.social.app_redirects' => ['juice-me://', 'https://shop.example.com']]);

        foreach (['juice-me://oauth', 'juice-me://', 'https://shop.example.com', 'https://shop.example.com/open', 'https://shop.example.com?x=1'] as $allowed) {
            $this->assertSame($allowed, Social::appRedirect($allowed), $allowed);
        }
        foreach ([
            'https://evil.example/steal',
            'https://shop.example.com.evil.test/x',   // starts with an entry, and isn't it
            'https://shop.example.com@evil.test/x',
            'juice-me.evil://x',
            'javascript://juice-me://x',
            'juice-me://oauth#fragment',
            "juice-me://oauth\n",
            'juice-me://oauth path',
            'juice-me:oauth',
            '',
            str_repeat('a', 600),
            ['juice-me://oauth'],
            null,
        ] as $refused) {
            $this->assertNull(Social::appRedirect($refused), print_r($refused, true));
        }

        // Asked for on the way in, nothing is started.
        $this->postJson('/api/auth/oauth/google/start', ['app' => ['redirect' => 'https://evil.example/steal', 'challenge' => Social::appChallenge(self::VERIFIER)]])
            ->assertStatus(422)->assertJsonPath('code', 'APP_REDIRECT');
        $this->postJson('/api/auth/oauth/google/start', ['app' => ['redirect' => self::APP, 'challenge' => 'short']])->assertStatus(422);
    }

    public function test_expo_gos_own_address_is_allowed_only_while_developing(): void
    {
        $expo = 'exp://192.168.1.10:8081/--/oauth';
        config(['nevela.auth.social.app_redirects' => []]);

        $this->assertNull(Social::appRedirect($expo));
        $this->app['env'] = 'local';
        $this->assertSame($expo, Social::appRedirect($expo));
        $this->assertNull(Social::appRedirect('https://evil.example/x'));
    }

    public function test_the_provider_returns_to_the_api_which_asks_who_it_is_and_hands_only_the_state_to_the_app(): void
    {
        $this->atGoogle('the-code', 'google-grace', 'grace@gmail.com');
        $started = $this->appStarts();

        $response = $this->providerReturns($started['state'], 'the-code');

        // Only the app's own address, from when it started, and only the state: the code was used up here.
        $response->assertStatus(302);
        $this->assertSame('juice-me://oauth?state='.$started['state'], $response->headers->get('Location'));
        $this->assertSame('grace@gmail.com', \Nevela\Laravel\Auth\Challenges::get('oauth', $started['state'])['profile']['email']);

        // Coming back again with another code doesn't put somebody else's account in its place.
        $this->atGoogle('mallory-code', 'google-mallory', 'mallory@gmail.com');
        $this->providerReturns($started['state'], 'mallory-code')->assertStatus(302);
        $this->assertSame('grace@gmail.com', \Nevela\Laravel\Auth\Challenges::get('oauth', $started['state'])['profile']['email']);

        // Said no at Google: the app is told, and says so.
        $no = $this->appStarts();
        $denied = $this->get('/api/auth/oauth/google/app?state='.$no['state'].'&error=access_denied&redirect=https://evil.example');
        $this->assertSame('juice-me://oauth?state='.$no['state'].'&error=access_denied', $denied->headers->get('Location'));

        // A code Google doesn't accept, or none at all.
        $refused = $this->appStarts();
        $this->assertSame('juice-me://oauth?state='.$refused['state'].'&error=failed', $this->providerReturns($refused['state'], 'a-code-nobody-issued')->headers->get('Location'));
        $none = $this->appStarts();
        $this->assertSame('juice-me://oauth?state='.$none['state'].'&error=failed', $this->get('/api/auth/oauth/google/app?state='.$none['state'])->headers->get('Location'));
    }

    public function test_the_apis_address_sends_nobody_anywhere_for_a_sign_in_an_app_did_not_start(): void
    {
        // Not started at all, and started by the dashboard: neither has an address to go to.
        $this->get('/api/auth/oauth/google/app?state=nonsense&code=x')->assertStatus(400);
        $this->get('/api/auth/oauth/google/app?state='.$this->start()['state'].'&code=x')->assertStatus(400);

        config(['nevela.auth.social.enabled' => false]);
        $this->get('/api/auth/oauth/google/app?state=nonsense&code=x')->assertNotFound();
    }

    public function test_the_app_finishes_the_sign_in_with_the_secret_it_started_with(): void
    {
        config(['nevela.auth.registration' => true]);
        $this->atGoogle('newcomer', 'google-grace', 'grace@gmail.com', name: 'Grace Hopper');
        $started = $this->appStarts();

        // Before Google has come back there is nothing to finish.
        $this->appFinishes($started['state'])->assertUnauthorized()->assertJsonPath('code', 'OAUTH_STATE');
        $this->providerReturns($started['state'], 'newcomer');

        // Someone who got hold of the state, but not the secret.
        $this->appFinishes($started['state'], null)->assertUnauthorized()->assertJsonPath('code', 'OAUTH_STATE');
        $this->appFinishes($started['state'], 'not the secret')->assertUnauthorized()->assertJsonPath('code', 'OAUTH_STATE');
        $this->assertSame(0, User::query()->count());

        // Their guesses didn't use the sign-in up.
        $this->appFinishes($started['state'])->assertCreated()
            ->assertJsonPath('user.email', 'grace@gmail.com')->assertJsonPath('user.roles', ['USER'])->assertJsonStructure(['token', 'refreshToken']);

        // And once is once.
        $this->appFinishes($started['state'])->assertUnauthorized()->assertJsonPath('code', 'OAUTH_STATE');
    }

    public function test_a_code_taken_off_the_phone_signs_nobody_in(): void
    {
        config(['nevela.auth.registration' => true]);
        $attackersSecret = 'an-attackers-own-secret-an-attackers-own-secret';
        $this->atGoogle('victim', 'google-victim', 'victim@gmail.com');
        $victim = $this->appStarts();
        $this->providerReturns($victim['state'], 'victim');

        // Whoever took the redirect off the phone has the state, and the code Google sent. They start a
        // sign-in of their own, with a secret of their own, and try each of what they took with it.
        $attacker = $this->appStarts(verifier: $attackersSecret);
        $this->appFinishes($victim['state'], $attackersSecret)->assertUnauthorized()->assertJsonPath('code', 'OAUTH_STATE');
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/auth/oauth/google/callback', ['state' => $attacker['state'], 'code' => 'victim', 'appVerifier' => $attackersSecret])
            ->assertUnauthorized()->assertJsonPath('code', 'OAUTH_STATE');
        $this->assertSame(0, User::query()->count());

        // The app it was for still finishes it.
        $this->appFinishes($victim['state'])->assertCreated()->assertJsonPath('user.email', 'victim@gmail.com');
    }

    public function test_an_account_with_a_second_step_still_owes_it_to_an_app(): void
    {
        $user = User::factory()->create(['email' => 'ada@gmail.com', 'email_verified_at' => now()]);
        TwoFactor::query()->create(['user_id' => (string) $user->getKey(), 'secret' => Totp::secret(), 'enabled_at' => now(), 'totp_confirmed_at' => now()]);
        $this->atGoogle('ada', 'google-ada', 'ada@gmail.com');
        $started = $this->appStarts();
        $this->providerReturns($started['state'], 'ada');

        $this->appFinishes($started['state'])->assertOk()->assertJsonPath('twoFactor', true)->assertJsonMissingPath('token');
    }

    public function test_a_sign_in_the_dashboard_started_needs_no_secret(): void
    {
        $this->atGoogle('ada', 'google-ada', 'ada@gmail.com');
        User::factory()->create(['email' => 'ada@gmail.com', 'email_verified_at' => now()]);

        $this->back($this->start()['state'], 'ada')->assertCreated();
    }

    // --- signing in

    public function test_someone_with_an_account_signs_in_by_a_verified_address_and_is_known_by_the_provider_after(): void
    {
        $ada = $this->user(['email_verified_at' => null]);
        $this->atGoogle('first', 'google-ada', 'Ada@Example.com');

        $answer = $this->back($this->start()['state'], 'first')->assertCreated();
        $this->assertNotEmpty($answer->json('token'));
        // (Nobody had proved her address, so her old password was retired: see the test below.)
        $this->assertSame('ada@example.com', $answer->json('user.email'));
        $this->assertSame('/dashboard/orders', $answer->json('next'));
        // Google has seen the address work.
        $this->assertNotNull($ada->refresh()->email_verified_at);
        $this->assertSame(1, DB::table('nevela_social_accounts')->where('provider', 'google')->where('provider_id', 'google-ada')->count());

        // Her address at Google changes. She is still she.
        $this->atGoogle('later', 'google-ada', 'ada.new@gmail.com');
        $this->back($this->start()['state'], 'later')->assertCreated()->assertJsonPath('user.email', 'ada@example.com');
    }

    public function test_an_account_nobody_had_proved_the_address_of_is_handed_over_without_its_password(): void
    {
        // Someone signed up with Ada's address before she did, with a password of their own.
        $squatter = $this->user(['email_verified_at' => null, 'password' => Hash::make('the squatters password')]);
        $theirs = $squatter->createToken('their laptop')->plainTextToken;
        $this->atGoogle('ada', 'google-ada', 'ada@example.com');

        $this->back($this->start()['state'], 'ada')->assertCreated()->assertJsonPath('user.email', 'ada@example.com');

        // Google proved the address is Ada's. What wasn't proved stops working.
        $this->assertFalse(Hash::check('the squatters password', $squatter->refresh()->password));
        $this->postJson('/api/auth/token', ['email' => 'ada@example.com', 'password' => 'the squatters password'])->assertUnauthorized();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/auth/me', ['Authorization' => "Bearer {$theirs}"])->assertUnauthorized();
        $this->assertNotNull($squatter->email_verified_at);
    }

    public function test_an_account_whose_address_was_proved_keeps_its_password(): void
    {
        $ada = $this->user(['email_verified_at' => now()]);
        $this->atGoogle('ada', 'google-ada', 'ada@example.com');

        $this->back($this->start()['state'], 'ada')->assertCreated();

        $this->assertTrue(Hash::check('a password of hers', $ada->refresh()->password));
    }

    public function test_an_account_removed_for_good_takes_its_connections_with_it(): void
    {
        $ada = $this->user(['email_verified_at' => now()]);
        $this->atGoogle('ada', 'google-ada', 'ada@example.com');
        $this->back($this->start()['state'], 'ada')->assertCreated();
        $this->assertSame(1, DB::table('nevela_social_accounts')->count());

        ClosedAccounts::close($ada);
        ClosedAccounts::remove($ada);

        $this->assertSame(0, DB::table('nevela_social_accounts')->count());
        // A connection left from before (an account deleted another way) is cleared when it is found, not followed.
        DB::table('nevela_social_accounts')->insert(['id' => (string) \Illuminate\Support\Str::uuid(), 'user_id' => '999999', 'provider' => 'google', 'provider_id' => 'google-ada', 'email' => null, 'created_at' => now(), 'updated_at' => now()]);
        $grace = $this->user(['email' => 'ada@example.com', 'email_verified_at' => now()]);
        $this->back($this->start()['state'], 'ada')->assertCreated()->assertJsonPath('user.id', (string) $grace->id);
        $this->assertSame([(string) $grace->id], DB::table('nevela_social_accounts')->pluck('user_id')->all());
    }

    public function test_an_address_the_provider_has_not_verified_is_not_matched_to_an_account(): void
    {
        $this->user();
        $this->atGoogle('unverified', 'google-someone', 'ada@example.com', verified: false);

        $this->back($this->start()['state'], 'unverified')->assertStatus(422)->assertJsonPath('code', 'EMAIL_NOT_VERIFIED');
        $this->assertSame(0, DB::table('nevela_social_accounts')->count());
    }

    public function test_without_registration_nobody_new_gets_in(): void
    {
        $this->atGoogle('stranger', 'google-stranger', 'stranger@gmail.com');

        $this->back($this->start()['state'], 'stranger')->assertForbidden()->assertJsonPath('code', 'NO_ACCOUNT');
        $this->assertSame(0, User::query()->count());
    }

    public function test_with_registration_a_new_address_gets_an_account_like_anyone_who_signs_up(): void
    {
        config(['nevela.auth.registration' => true]);
        $this->atGoogle('newcomer', 'google-grace', 'grace@gmail.com', name: 'Grace Hopper');

        // With the role anyone who signs up starts with.
        $this->back($this->start()['state'], 'newcomer')->assertCreated()->assertJsonPath('user.email', 'grace@gmail.com')->assertJsonPath('user.roles', ['USER']);

        $grace = User::query()->where('email', 'grace@gmail.com')->firstOrFail();
        $this->assertSame('Grace Hopper', $grace->name);
        $this->assertNotNull($grace->email_verified_at);
        // A password nobody knows: "Forgot password" sets one.
        $this->assertFalse(Hash::check('', $grace->password));
    }

    public function test_an_address_that_was_closed_or_blocked_gets_no_new_account(): void
    {
        config(['nevela.auth.registration' => true]);
        $closed = $this->user(['email' => 'closed@gmail.com']);
        ClosedAccounts::close($closed);
        $this->atGoogle('closed', 'google-closed', 'closed@gmail.com');

        $this->back($this->start()['state'], 'closed')->assertForbidden()->assertJsonPath('code', 'ACCOUNT_CLOSED');
        $this->assertSame(1, User::query()->where('email', 'closed@gmail.com')->count());
    }

    public function test_an_account_with_two_factor_still_owes_its_second_step(): void
    {
        $ada = $this->user();
        TwoFactor::query()->create(['user_id' => (string) $ada->id, 'secret' => Totp::secret(), 'totp_confirmed_at' => now(), 'enabled_at' => now(), 'backup_codes' => []]);
        $this->atGoogle('first', 'google-ada', 'ada@example.com');

        $answer = $this->back($this->start()['state'], 'first')->assertOk();

        $this->assertTrue($answer->json('twoFactor'));
        $this->assertNull($answer->json('token'));
        $this->assertSame(['totp', 'email'], $answer->json('methods'));
        $this->assertSame('/dashboard/orders', $answer->json('next'));
    }

    public function test_a_state_is_good_once_and_for_its_own_provider(): void
    {
        $this->user();
        $this->atGoogle('first', 'google-ada', 'ada@example.com');
        $state = $this->start()['state'];

        $this->back($state, 'first', 'github')->assertUnauthorized()->assertJsonPath('code', 'OAUTH_STATE');
        $state = $this->start()['state'];
        $this->back($state, 'first')->assertCreated();
        $this->back($state, 'first')->assertUnauthorized()->assertJsonPath('code', 'OAUTH_STATE');
        // One this app never made.
        $this->back('made-up', 'first')->assertUnauthorized()->assertJsonPath('code', 'OAUTH_STATE');
    }

    public function test_a_provider_that_refuses_or_shares_no_address_is_said_so(): void
    {
        $this->back($this->start()['state'], 'a-code-the-provider-refuses')->assertUnauthorized()->assertJsonPath('code', 'OAUTH_FAILED')->assertJsonPath('next', '/dashboard/orders');

        $this->atGoogle('no-address', 'google-private', null);
        $this->back($this->start()['state'], 'no-address')->assertStatus(422)->assertJsonPath('code', 'NO_EMAIL');

        // Cancelled on the provider's page.
        $state = $this->start()['state'];
        $this->postJson('/api/auth/oauth/google/callback', ['state' => $state, 'error' => 'access_denied'])->assertUnauthorized()->assertJsonPath('code', 'OAUTH_DENIED');
    }

    // --- connecting one to an account

    public function test_someone_signed_in_connects_and_disconnects_a_provider(): void
    {
        $ada = $this->user();
        $token = $ada->createToken('test')->plainTextToken;
        $bearer = ['Authorization' => "Bearer {$token}"];

        // Not signed in, there is nobody to connect it to.
        $this->postJson('/api/auth/oauth/github/start', ['link' => true])->assertUnauthorized();

        $this->people['gh'] = ['id' => '4242', 'email' => 'ada@users.noreply.github.com', 'nickname' => 'ada'];
        $started = $this->start('github', ['link' => true, 'next' => '/dashboard/account/security'], $bearer);
        $this->back($started['state'], 'gh', 'github')->assertOk()->assertJsonPath('linked', true)->assertJsonPath('next', '/dashboard/account/security');

        $this->app['auth']->forgetGuards();
        $connected = $this->getJson('/api/auth/social', $bearer)->assertOk()->json('data');
        $this->assertSame(['github'], array_column($connected, 'provider'));

        // Signed out, GitHub signs her in, though the address there is another one.
        $this->back($this->start('github')['state'], 'gh', 'github')->assertCreated()->assertJsonPath('user.email', 'ada@example.com');

        // That GitHub account can't be connected to someone else as well.
        $grace = $this->user(['email' => 'grace@example.com']);
        $graceBearer = ['Authorization' => 'Bearer '.$grace->createToken('test')->plainTextToken];
        $this->app['auth']->forgetGuards();
        $this->back($this->start('github', ['link' => true], $graceBearer)['state'], 'gh', 'github')->assertStatus(409)->assertJsonPath('code', 'ALREADY_LINKED');

        $this->app['auth']->forgetGuards();
        $this->deleteJson('/api/auth/social/'.$connected[0]['id'], [], $bearer)->assertNoContent();
        $this->assertSame([], $this->getJson('/api/auth/social', $bearer)->json('data'));
        // Someone else's, or nonsense, is nothing to delete.
        $this->deleteJson('/api/auth/social/nobody', [], $bearer)->assertNoContent();
    }
}
