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
        $this->getJson('/api/auth/config')->assertJsonPath('social', ['google']);
        $this->postJson('/api/auth/oauth/github/start')->assertNotFound()->assertJsonPath('code', 'NOT_ENABLED');

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

    // --- signing in

    public function test_someone_with_an_account_signs_in_by_a_verified_address_and_is_known_by_the_provider_after(): void
    {
        $ada = $this->user(['email_verified_at' => null]);
        $this->atGoogle('first', 'google-ada', 'Ada@Example.com');

        $answer = $this->back($this->start()['state'], 'first')->assertCreated();
        $this->assertNotEmpty($answer->json('token'));
        $this->assertSame('ada@example.com', $answer->json('user.email'));
        $this->assertSame('/dashboard/orders', $answer->json('next'));
        // Google has seen the address work.
        $this->assertNotNull($ada->refresh()->email_verified_at);
        $this->assertSame(1, DB::table('nevela_social_accounts')->where('provider', 'google')->where('provider_id', 'google-ada')->count());

        // Her address at Google changes. She is still she.
        $this->atGoogle('later', 'google-ada', 'ada.new@gmail.com');
        $this->back($this->start()['state'], 'later')->assertCreated()->assertJsonPath('user.email', 'ada@example.com');
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
