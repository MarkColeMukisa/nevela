<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Joiner;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Forms\ConfirmAddress;
use Nevela\Laravel\Forms\FormGuard;
use Nevela\Laravel\Forms\OwnerDigest;
use Nevela\Laravel\Forms\PublicMail;
use Nevela\Laravel\Support\Descriptor;
use Tests\GeneratesResources;
use Tests\TestCase;

/** "We got your message": what an app sends to the address a form was given. */
class Receipt extends Mailable
{
    public function build(): self
    {
        return $this->subject('We got your message')->html('<p>Thank you. We will write back.</p>');
    }
}

/** And what it sends its owner. */
class Notice extends Mailable
{
    public function __construct(public string $about = 'A new enquiry') {}

    public function build(): self
    {
        return $this->subject($this->about)->html('<p>Someone wrote in.</p>');
    }
}

/**
 * A public form with "protect" and "confirm", over HTTP with nobody signed in: a contact
 * form with every check on, a list people join by proving their address, and a form with
 * neither, which is as it was before there were any.
 */
class FormProtectionTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    private const NOT_A_PERSON = "We couldn't confirm you're not a robot. Please try again.";

    protected function setUp(): void
    {
        parent::setUp();
        Access::reset();
        Mail::fake();
        // Whatever keys this machine's .env has are not the test's: each test says what it has.
        config(['nevela.public.turnstile.secret' => null, 'nevela.public.turnstile.hostnames' => null, 'nevela.auth.web_url' => 'http://localhost:3000']);
        // No DNS to ask in a test: every domain takes mail but this one.
        FormGuard::$takesMail = fn (string $domain) => $domain !== 'nomail.test';
        $this->resources(fn () => [
            Descriptor::fromArray([
                'name' => 'Contact',
                'fields' => ['name' => ['kind' => 'string'], 'email' => ['kind' => 'string', 'format' => 'email'], 'subject' => ['kind' => 'string'], 'message' => ['kind' => 'text']],
                'public' => ['create' => [
                    'fields' => ['name', 'email', 'subject', 'message'],
                    'protect' => ['turnstile' => true, 'honeypot' => true, 'minSeconds' => 3, 'email' => 'email'],
                ]],
            ]),
            Descriptor::fromArray([
                'name' => 'Joiner',
                'fields' => ['email' => ['kind' => 'string', 'format' => 'email', 'unique' => true], 'source' => ['kind' => 'string', 'default' => 'website']],
                'public' => ['create' => ['fields' => ['email'], 'confirm' => 'email']],
            ]),
            Descriptor::fromArray(['name' => 'Jotting', 'fields' => ['title' => ['kind' => 'string']], 'public' => ['read' => ['fields' => ['title']], 'create' => ['fields' => ['title']]]]),
        ]);
        // What an app does when a message arrives: write back, and tell its owner.
        Event::listen('eloquent.created: '.Contact::class, function (Contact $contact) {
            PublicMail::toVisitor($contact->email, new Receipt);
            PublicMail::toOwner(new Notice, line: $contact->subject);
        });
    }

    protected function tearDown(): void
    {
        FormGuard::$takesMail = null;
        parent::tearDown();
    }

    private function signIn(): void
    {
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
    }

    /** What the form was handed when it was shown, a few seconds ago. */
    private function form(int $secondsAgo = 5): array
    {
        $form = $this->getJson('/api/public/_nevela/form/contacts')->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json();
        $this->travel($secondsAgo)->seconds();

        return $form;
    }

    /**
     * A message as a person sends it: filled in, some seconds after the form was shown.
     *
     * @param  array<string, mixed>  $over
     */
    private function send(array $over = [], string $from = '203.0.113.7')
    {
        $form = $this->form();

        return $this->withServerVariables(['REMOTE_ADDR' => $from])->postJson('/api/public/contacts', $over + [
            'name' => 'Amara', 'email' => 'amara@example.com', 'subject' => 'Training', 'message' => 'When is the next intake?', '_form' => $form['token'],
        ]);
    }

    /**
     * Cloudflare's yes: a check solved on a site, for a form.
     *
     * @param  array<string, mixed>  $over
     */
    private function yes(string $hostname = 'localhost', string $action = 'contacts', array $over = [])
    {
        return Http::response($over + ['success' => true, 'hostname' => $hostname, 'action' => $action]);
    }

    private function turnstile(mixed ...$answers): void
    {
        config(['nevela.public.turnstile.secret' => 'the-secret']);
        Http::fake(['challenges.cloudflare.com/*' => Http::sequence($answers)]);
    }

    /** @return array<string, int> What was turned away, by reason */
    private function blocked(): array
    {
        return DB::table('nevela_form_blocks')->where('resource', 'Contact')->pluck('count', 'reason')->map(fn ($n) => (int) $n)->all();
    }

    // --- a form with no "protect" is as it was

    public function test_a_form_without_protect_is_as_it_was(): void
    {
        $created = $this->postJson('/api/public/jottings', ['title' => 'Buy milk'])->assertStatus(201)->json();
        $this->assertSame(['id', 'title'], array_keys($created));

        // It has no token to hand out, and what a protected form sends is to it an unknown field.
        $this->getJson('/api/public/_nevela/form/jottings')->assertNotFound();
        $this->postJson('/api/public/jottings', ['title' => 'Buy bread', '_form' => 'x'])->assertStatus(422)->assertJsonPath('issues.0.path', '_form');
        $this->assertSame(0, DB::table('nevela_form_blocks')->count());
    }

    // --- what a person sends goes through

    public function test_a_person_filling_the_form_in_is_let_through(): void
    {
        $form = $this->getJson('/api/public/_nevela/form/contacts')->assertOk()->json();
        $this->assertSame(['token', 'honeypot', 'minSeconds', 'turnstile', 'action'], array_keys($form));
        // Not a field of the form, and something a bot would fill in.
        $this->assertSame('website', $form['honeypot']);
        $this->assertSame(3, $form['minSeconds']);
        // No secret key in development: the robot check is skipped, and the form is told so.
        $this->assertFalse($form['turnstile']);
        $this->assertNull($form['action']);

        $response = $this->send(['website' => ''])->assertStatus(201);
        $this->assertSame('', $response->getContent());
        $this->assertSame(1, DB::table('contacts')->count());
        $this->assertSame([], $this->blocked());
        Mail::assertQueued(Receipt::class, 1);
        Mail::assertQueued(Notice::class, 1);
    }

    // --- each check, on its own

    public function test_a_filled_honeypot_stores_nothing_sends_nothing_and_is_told_it_worked(): void
    {
        $response = $this->send(['website' => 'https://spam.test'])->assertStatus(201);

        $this->assertSame('', $response->getContent());
        $this->assertSame(0, DB::table('contacts')->count());
        Mail::assertNothingQueued();
        $this->assertSame(['honeypot' => 1], $this->blocked());
    }

    public function test_a_form_with_no_token_or_one_it_was_not_handed_is_quietly_dropped(): void
    {
        $form = $this->form();
        $message = ['name' => 'Amara', 'email' => 'amara@example.com', 'subject' => 'Training', 'message' => 'Hello'];

        $this->postJson('/api/public/contacts', $message)->assertStatus(201);
        $this->postJson('/api/public/contacts', $message + ['_form' => 'made-up.token'])->assertStatus(201);
        // Tampered with: an earlier time than it was signed for.
        $this->postJson('/api/public/contacts', $message + ['_form' => substr($form['token'], 0, -1).(str_ends_with($form['token'], 'a') ? 'b' : 'a')])->assertStatus(201);

        $this->assertSame(0, DB::table('contacts')->count());
        $this->assertSame(['forged' => 3], $this->blocked());
        Mail::assertNothingQueued();
    }

    public function test_a_form_sent_back_sooner_than_a_person_could_is_quietly_dropped(): void
    {
        $form = $this->form(secondsAgo: 1);

        $this->postJson('/api/public/contacts', ['name' => 'Bot', 'email' => 'bot@example.com', 'subject' => 'x', 'message' => 'x', '_form' => $form['token']])
            ->assertStatus(201)
            // Whoever is building the form is told why nothing arrived (the app is in debug in a test).
            ->assertHeader('X-Nevela-Blocked', 'too_fast');

        $this->assertSame(0, DB::table('contacts')->count());
        $this->assertSame(['too_fast' => 1], $this->blocked());
    }

    public function test_a_form_left_open_for_hours_is_asked_to_try_again(): void
    {
        $form = $this->form(secondsAgo: 3 * 60 * 60);

        $this->postJson('/api/public/contacts', ['name' => 'Amara', 'email' => 'amara@example.com', 'subject' => 'x', 'message' => 'x', '_form' => $form['token']])
            ->assertStatus(422)->assertJsonPath('error', self::NOT_A_PERSON)->assertJsonPath('code', 'EXPIRED');

        $this->assertSame(0, DB::table('contacts')->count());
        // With the token the form asks for after every attempt, the same message goes through.
        $this->send()->assertStatus(201);
        $this->assertSame(1, DB::table('contacts')->count());
    }

    public function test_the_robot_check_is_made_by_this_server_and_a_token_is_good_once(): void
    {
        $this->turnstile($this->yes(), Http::response(['success' => false, 'error-codes' => ['timeout-or-duplicate']]));
        $form = $this->getJson('/api/public/_nevela/form/contacts')->json();
        $this->assertTrue($form['turnstile']);
        // What the widget is rendered with, so the check is known to be this form's.
        $this->assertSame('contacts', $form['action']);

        // Nothing from Cloudflare came with it.
        $this->send()->assertStatus(422)->assertJsonPath('error', self::NOT_A_PERSON)->assertJsonPath('code', 'ROBOT');
        Http::assertNothingSent();

        $this->send(['_turnstile' => 'a-token'])->assertStatus(201);
        Http::assertSent(fn ($request) => $request->url() === 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
            && $request['secret'] === 'the-secret' && $request['response'] === 'a-token' && $request['remoteip'] === '203.0.113.7');

        // The same token again, as a form that didn't reset its widget would send it.
        $this->send(['_turnstile' => 'a-token', 'subject' => 'Again'])->assertStatus(422)->assertJsonPath('error', self::NOT_A_PERSON);

        $this->assertSame(1, DB::table('contacts')->count());
        $this->assertSame(['robot' => 2], $this->blocked());
    }

    public function test_a_token_is_good_once_here_even_when_cloudflare_would_take_it_again(): void
    {
        // Seen with a real widget: the same token, sent three times, answered yes three times.
        // So Cloudflare's answers here are all yes, but for one check solved somewhere else.
        $this->turnstile($this->yes(), $this->yes(), $this->yes('evil.example'), $this->yes());

        $this->send(['_turnstile' => 'the-same-token'])->assertStatus(201);
        $this->send(['_turnstile' => 'the-same-token', 'email' => 'kofi@example.com'])->assertStatus(422)->assertJsonPath('code', 'ROBOT');
        // Refused from memory: Cloudflare was asked once.
        Http::assertSentCount(1);
        // Another token is another check.
        $this->send(['_turnstile' => 'another-token', 'email' => 'kofi@example.com'])->assertStatus(201);
        Http::assertSentCount(2);

        // One that was refused was never taken: sent again, it is Cloudflare's to answer.
        $this->send(['_turnstile' => 'a-third-token', 'email' => 'ama@example.com'])->assertStatus(422)->assertJsonPath('code', 'HOSTNAME');
        $this->send(['_turnstile' => 'a-third-token', 'email' => 'ama@example.com'])->assertStatus(201);
        $this->assertSame(3, DB::table('contacts')->count());
    }

    public function test_a_check_solved_somewhere_else_or_for_another_form_is_not_this_forms(): void
    {
        $this->turnstile($this->yes('evil.example'), $this->yes('localhost', 'joiners'), $this->yes('localhost', ''), $this->yes('127.0.0.1'));

        // A real person passed a real check, for this widget, on a site that isn't this one.
        $this->send(['_turnstile' => 'a-token'])->assertStatus(422)->assertJsonPath('error', self::NOT_A_PERSON)->assertJsonPath('code', 'HOSTNAME');
        // Here, and for another form, or for none.
        $this->send(['_turnstile' => 'a-token'])->assertStatus(422)->assertJsonPath('code', 'ROBOT');
        $this->send(['_turnstile' => 'a-token'])->assertStatus(422)->assertJsonPath('code', 'ROBOT');
        $this->assertSame(0, DB::table('contacts')->count());

        // Where a form is built, the machine it is built on counts as here.
        $this->send(['_turnstile' => 'a-token'])->assertStatus(201);
        $this->assertSame(1, DB::table('contacts')->count());
        $this->assertSame(['hostname' => 1, 'robot' => 2], $this->blocked());
        // Longer than any token Cloudflare makes: not one, and Cloudflare isn't asked.
        Http::fake();
        $this->send(['_turnstile' => str_repeat('a', 2049)])->assertStatus(422)->assertJsonPath('code', 'ROBOT');
    }

    public function test_on_a_live_site_a_check_solved_on_someones_own_machine_is_refused(): void
    {
        config(['nevela.auth.web_url' => 'https://kianrover.com']);
        $this->app->detectEnvironment(fn () => 'production');
        $this->turnstile($this->yes('localhost'), $this->yes('notkianrover.com'), $this->yes('kianrover.com'), $this->yes('www.kianrover.com'));

        // The widget lists localhost beside the site, so the form can be built. That is not the site.
        $this->assertSame(['kianrover.com'], FormGuard::hostnames());
        $this->send(['_turnstile' => 'a-token'])->assertStatus(422)->assertJsonPath('code', 'HOSTNAME');
        $this->send(['_turnstile' => 'a-token'])->assertStatus(422)->assertJsonPath('code', 'HOSTNAME');
        // The site, and a name under it, as on the widget.
        $this->send(['_turnstile' => 'a-token'])->assertStatus(201);
        $this->send(['_turnstile' => 'b-token', 'email' => 'kofi@example.com'])->assertStatus(201);
        $this->assertSame(2, DB::table('contacts')->count());

        // Said outright, it is those sites and no others. localhost is still not one of them.
        config(['nevela.public.turnstile.hostnames' => ' Shop.Example , localhost, kianrover.com']);
        $this->assertSame(['shop.example', 'kianrover.com'], FormGuard::hostnames());
    }

    public function test_cloudflares_test_keys_pass_where_a_form_is_built_and_never_on_a_live_site(): void
    {
        $testing = fn () => Http::response(['success' => true, 'hostname' => 'example.com', 'metadata' => ['result_with_testing_key' => true]]);
        $this->turnstile($testing(), $testing());

        $this->send(['_turnstile' => 'XXXX.DUMMY.TOKEN.XXXX'])->assertStatus(201);

        config(['nevela.auth.web_url' => 'https://kianrover.com']);
        $this->app->detectEnvironment(fn () => 'production');
        $this->send(['_turnstile' => 'XXXX.DUMMY.TOKEN.XXXX', 'email' => 'kofi@example.com'])->assertStatus(503)->assertJsonPath('code', 'UNCONFIGURED');
        $this->assertSame(1, DB::table('contacts')->count());
    }

    public function test_a_live_site_that_was_never_told_its_own_address_refuses_everyone_and_says_why(): void
    {
        // The secret is there. The site's address is still the one a new app starts with.
        config(['nevela.public.turnstile.secret' => 'the-secret']);
        Http::fake();
        $this->app->detectEnvironment(fn () => 'production');

        $this->assertSame([], FormGuard::hostnames());
        $this->assertFalse($this->getJson('/api/public/_nevela/form/contacts')->json('turnstile'));
        $this->send(['_turnstile' => 'a-token'])->assertStatus(503)->assertJsonPath('code', 'UNCONFIGURED');
        $this->artisan('nevela:status')->expectsOutputToContain('no site to accept a check from')->assertFailed();
    }

    public function test_cloudflare_not_answering_is_not_a_yes(): void
    {
        $this->turnstile(Http::response('Bad gateway', 502), fn () => throw new \Illuminate\Http\Client\ConnectionException('timed out'));

        foreach ([1, 2] as $attempt) {
            $this->send(['_turnstile' => 'a-token'])->assertStatus(503)->assertJsonPath('error', "We couldn't check the form just now. Please try again in a moment.");
        }
        $this->assertSame(0, DB::table('contacts')->count());
        $this->assertSame(['unreachable' => 2], $this->blocked());
    }

    public function test_in_production_a_form_that_asks_for_the_check_and_has_no_secret_refuses_everyone(): void
    {
        Http::fake();
        $this->app->detectEnvironment(fn () => 'production');

        $this->assertFalse($this->getJson('/api/public/_nevela/form/contacts')->json('turnstile'));
        $this->send()->assertStatus(503)->assertJsonPath('code', 'UNCONFIGURED');
        $this->assertSame(0, DB::table('contacts')->count());

        // And the person who can fix it is told what is wrong.
        $this->artisan('nevela:status')->expectsOutputToContain('TURNSTILE_SECRET_KEY is not set, so the form for Contact answers 503 to everyone')->assertFailed();
    }

    public function test_an_address_nobody_can_be_written_to_at_is_refused_on_its_field(): void
    {
        $this->send(['email' => 'someone@mailinator.com'])->assertStatus(422)->assertJsonPath('error', 'Validation failed.')
            ->assertJsonPath('issues.0.path', 'email')->assertJsonPath('issues.0.message', 'Use an address you keep. This one is from a throwaway service.');
        // A subdomain of one is one too.
        $this->send(['email' => 'someone@mail.mailinator.com'])->assertStatus(422)->assertJsonPath('issues.0.path', 'email');
        $this->send(['email' => 'someone@nomail.test'])->assertStatus(422)->assertJsonPath('issues.0.path', 'email')
            ->assertJsonPath('issues.0.message', "This address's domain doesn't receive email. Check the spelling.");
        // What isn't an address at all is the form's own rule to report, with everything else that is wrong.
        $this->send(['email' => 'not an address'])->assertStatus(422)->assertJsonPath('issues.0.path', 'email');

        $this->assertSame(0, DB::table('contacts')->count());
        $this->assertSame(['disposable' => 2, 'undeliverable' => 1], $this->blocked());
    }

    public function test_one_address_is_counted_however_many_places_it_is_sent_from(): void
    {
        // Ten a minute for a visitor, and each of these is a different one.
        for ($i = 1; $i <= 10; $i++) {
            $this->send(['subject' => "Message {$i}"], "198.51.100.{$i}")->assertStatus(201);
        }
        $this->send(['subject' => 'Message 11'], '198.51.100.11')->assertStatus(429)->assertJsonPath('code', 'THROTTLED');
        // Someone else, from the same place as the last, is not held up by it.
        $this->send(['email' => 'kofi@example.com'], '198.51.100.11')->assertStatus(201);

        $this->assertSame(11, DB::table('contacts')->count());
        $this->assertSame(['throttled' => 1], $this->blocked());
    }

    public function test_what_was_turned_away_is_counted_for_whoever_may_see_the_resource(): void
    {
        $this->send(['website' => 'x']);
        $this->send(['website' => 'y']);
        $this->send(['email' => 'someone@mailinator.com']);
        $this->send();

        $this->getJson('/api/_nevela/forms/contacts')->assertUnauthorized();
        $this->signIn();
        $form = $this->getJson('/api/_nevela/forms/contacts')->assertOk()->json();

        $this->assertSame(['turnstile' => true, 'honeypot' => true, 'minSeconds' => 3, 'email' => 'email'], $form['protect']);
        // Asked for, and with no secret key in development nothing is making it.
        $this->assertSame('skipped', $form['robotCheck']);
        $this->assertSame(3, $form['blocked']['total']);
        $this->assertSame([
            ['reason' => 'honeypot', 'label' => 'filled the hidden field', 'count' => 2],
            ['reason' => 'disposable', 'label' => 'throwaway address', 'count' => 1],
        ], $form['blocked']['reasons']);
        // A resource with no public form has nothing to report.
        $this->getJson('/api/_nevela/forms/products')->assertNotFound();
    }

    // --- the mail a form causes

    public function test_an_address_is_written_to_once_an_hour_and_every_record_is_saved(): void
    {
        $this->travelTo(now()->startOfDay()->addHours(12));
        $this->send(['subject' => 'First'])->assertStatus(201);
        $this->send(['subject' => 'Second'], '203.0.113.8')->assertStatus(201);

        $this->assertSame(2, DB::table('contacts')->count());
        Mail::assertQueued(Receipt::class, 1);
        Mail::assertQueued(Receipt::class, fn (Receipt $mail) => $mail->hasTo('amara@example.com'));
        // The address itself is not kept: only something to count it by.
        $this->assertSame([PublicMail::fingerprint('amara@example.com')], DB::table('nevela_public_mail')->where('kind', 'visitor')->pluck('recipient')->all());

        // Three in a day, across every form, and no more.
        $tomorrow = now()->startOfDay()->addDay();
        $sent = [];
        foreach ([2, 4, 6, 8] as $hours) {
            $this->travelTo($tomorrow->copy()->addHours($hours));
            $sent[] = PublicMail::toVisitor('Amara@Example.com', new Receipt);
        }
        $this->assertSame([true, true, false, false], $sent);
        Mail::assertQueued(Receipt::class, 3);
    }

    public function test_mail_asked_for_while_a_record_is_being_saved_waits_for_the_save(): void
    {
        DB::transaction(function () {
            $this->assertTrue(PublicMail::toVisitor('amara@example.com', new Receipt));
            // Not yet: nothing is counted or queued inside the transaction it was called in.
            Mail::assertNothingQueued();
            $this->assertSame(0, DB::table('nevela_public_mail')->count());
        });
        Mail::assertQueued(Receipt::class, 1);
        $this->assertSame(1, DB::table('nevela_public_mail')->count());

        // A save that is rolled back sends nothing.
        try {
            DB::transaction(function () {
                PublicMail::toOwner(new Notice);
                throw new \RuntimeException('The save failed.');
            });
        } catch (\RuntimeException) {
        }
        Mail::assertNotQueued(Notice::class);
        $this->assertSame(0, DB::table('nevela_public_mail')->where('kind', 'owner')->count());

        // With no transaction it happens at once, and says whether it went.
        $this->assertFalse(PublicMail::toVisitor('amara@example.com', new Receipt));
        $this->assertTrue(PublicMail::toOwner(new Notice));
    }

    public function test_the_owner_gets_ten_notices_in_an_hour_and_one_email_for_the_rest(): void
    {
        Notification::fake();
        $this->travelTo(now()->startOfHour()->addMinutes(5));

        $sent = 0;
        for ($i = 1; $i <= 24; $i++) {
            $this->travel(1)->minutes();
            $sent += PublicMail::toOwner(new Notice("Enquiry {$i}"), line: "Message {$i} *with* stars", url: "http://localhost:3000/dashboard/contacts/{$i}") ? 1 : 0;
        }
        $this->assertSame(10, $sent);
        Mail::assertQueued(Notice::class, 10);
        Mail::assertQueued(Notice::class, fn (Notice $mail) => $mail->hasTo('hello@example.com'));
        $since = now()->startOfHour()->addMinutes(16)->format('H:i');

        $this->artisan('nevela:digest')->expectsOutputToContain('Sent one email naming 14 notice(s)')->assertSuccessful();

        Notification::assertSentOnDemandTimes(OwnerDigest::class, 1);
        Notification::assertSentOnDemand(OwnerDigest::class, function (OwnerDigest $digest, array $channels, object $notifiable) use ($since) {
            $body = implode("\n", array_map('strval', $digest->toMail($notifiable)->introLines));

            return count($digest->held) === 14
                && $digest->subject() === "14 more enquiries since {$since}"
                && $notifiable->routes['mail'] === 'hello@example.com'
                && $digest->held[0] === ['subject' => 'Enquiry 11', 'line' => 'Message 11 *with* stars', 'url' => 'http://localhost:3000/dashboard/contacts/11']
                // What a visitor typed is words, not formatting.
                && str_contains($body, '**Enquiry 11**: Message 11 \*with\* stars ([open](http://localhost:3000/dashboard/contacts/11))')
                && str_contains($body, 'Enquiry 24');
        });
        // Named once: there is nothing left for the next hour's.
        $this->assertSame(0, DB::table('nevela_owner_digest')->count());
        $this->artisan('nevela:digest')->expectsOutputToContain('No notices are waiting.')->assertSuccessful();
        Notification::assertSentOnDemandTimes(OwnerDigest::class, 1);
    }

    // --- proving an address

    /** @return array{id: string, key: string} What the link in the email carries */
    private function linkTo(string $address): array
    {
        $mail = Mail::queued(ConfirmAddress::class, fn (ConfirmAddress $mail) => $mail->hasTo($address))->last();
        $this->assertNotNull($mail, "no link was sent to {$address}");
        $this->assertStringStartsWith('http://localhost:3000/confirm?', $mail->url);
        parse_str((string) parse_url($mail->url, PHP_URL_QUERY), $query);
        $this->assertSame('joiners', $query['list']);

        return ['id' => $query['id'], 'key' => $query['key']];
    }

    public function test_a_seeded_list_is_confirmed_as_it_is_made(): void
    {
        $this->artisan('nevela:seed', ['name' => 'Joiner', '--count' => 5])->assertSuccessful();

        // Nobody was there to ask: they count, as someone added in the dashboard does.
        $this->assertSame(0, DB::table('joiners')->whereNull('confirmed_at')->count());
        $this->assertSame(5, Joiner::confirmed()->count());
    }

    public function test_someone_joining_a_list_is_unconfirmed_until_they_follow_their_link(): void
    {
        $response = $this->postJson('/api/public/joiners', ['email' => 'Kofi@Example.com'])->assertStatus(201);
        $this->assertSame('', $response->getContent());
        $row = DB::table('joiners')->first();
        $this->assertSame('kofi@example.com', $row->email);
        $this->assertNull($row->confirmed_at);
        Mail::assertQueued(ConfirmAddress::class, 1);

        // In the dashboard they are listed, and marked. They are not counted or exported.
        $this->signIn();
        $this->assertNull($this->getJson('/api/joiners')->assertOk()->assertJsonPath('meta.total', 1)->json('data.0.confirmedAt'));
        $this->getJson('/api/joiners?filter[confirmed]=true')->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson('/api/joiners?filter[confirmed]=false')->assertOk()->assertJsonPath('meta.total', 1);
        $this->getJson('/api/joiners?filter[confirmed]=perhaps')->assertStatus(400);
        $this->getJson('/api/joiners/_stats')->assertOk()->assertJsonPath('total', 0);
        $this->getJson('/api/joiners/_insights')->assertOk()->assertJsonPath('total', 0);
        $this->assertSame(0, Joiner::confirmed()->count());

        // A link that wasn't sent opens nothing.
        $link = $this->linkTo('kofi@example.com');
        $this->postJson("/api/public/_nevela/confirm/joiners/{$link['id']}/".str_repeat('0', 64))->assertNotFound();
        $this->assertNull(DB::table('joiners')->value('confirmed_at'));

        $this->postJson("/api/public/_nevela/confirm/joiners/{$link['id']}/{$link['key']}")->assertOk()->assertJsonPath('confirmed', true);
        $this->assertNotNull(DB::table('joiners')->value('confirmed_at'));
        // Followed twice, as a mail program that opens links does: still confirmed, and no error.
        $this->postJson("/api/public/_nevela/confirm/joiners/{$link['id']}/{$link['key']}")->assertOk();

        $this->assertNotNull($this->getJson('/api/joiners?filter[confirmed]=true')->assertJsonPath('meta.total', 1)->json('data.0.confirmedAt'));
        $this->getJson('/api/joiners/_stats')->assertJsonPath('total', 1);
        $this->assertSame(1, Joiner::confirmed()->count());
    }

    public function test_joining_twice_answers_as_the_first_time_and_says_nothing_of_who_is_on_the_list(): void
    {
        $first = $this->postJson('/api/public/joiners', ['email' => 'kofi@example.com'])->assertStatus(201);
        // Still waiting: asked again, and not written to again within the hour.
        $second = $this->postJson('/api/public/joiners', ['email' => 'KOFI@example.com'])->assertStatus(201);
        $this->assertSame($first->getContent(), $second->getContent());
        $this->assertSame(1, DB::table('joiners')->count());
        Mail::assertQueued(ConfirmAddress::class, 1);

        // Later, the link goes again: the first may have been lost.
        $this->travel(2)->hours();
        $this->postJson('/api/public/joiners', ['email' => 'kofi@example.com'])->assertStatus(201);
        Mail::assertQueued(ConfirmAddress::class, 2);

        // On the list for good: the same answer, and nothing sent.
        $link = $this->linkTo('kofi@example.com');
        $this->postJson("/api/public/_nevela/confirm/joiners/{$link['id']}/{$link['key']}")->assertOk();
        $this->travel(2)->hours();
        $third = $this->postJson('/api/public/joiners', ['email' => 'kofi@example.com'])->assertStatus(201);
        $this->assertSame($first->getContent(), $third->getContent());
        $this->assertSame(1, DB::table('joiners')->count());
        Mail::assertQueued(ConfirmAddress::class, 2);
    }

    public function test_an_address_nobody_confirmed_is_gone_after_two_days(): void
    {
        $this->postJson('/api/public/joiners', ['email' => 'kofi@example.com'])->assertStatus(201);
        $this->postJson('/api/public/joiners', ['email' => 'ama@example.com'])->assertStatus(201);
        $link = $this->linkTo('ama@example.com');
        $this->postJson("/api/public/_nevela/confirm/joiners/{$link['id']}/{$link['key']}")->assertOk();

        $this->travel(47)->hours();
        $this->artisan('nevela:trash')->assertSuccessful();
        $this->assertSame(2, DB::table('joiners')->count());

        $this->travel(2)->hours();
        $this->artisan('nevela:trash')->expectsOutputToContain("Removed 1 Joiner record(s) whose address wasn't confirmed within 48 hours.")->assertSuccessful();
        // Removed, not put in the trash: it was never anyone's record.
        $this->assertSame(['ama@example.com'], DB::table('joiners')->pluck('email')->all());
        // Its link is no good now.
        $stale = $this->linkTo('kofi@example.com');
        $this->postJson("/api/public/_nevela/confirm/joiners/{$stale['id']}/{$stale['key']}")->assertNotFound();
    }

    public function test_someone_added_in_the_dashboard_has_nothing_to_prove(): void
    {
        $this->signIn();

        $created = $this->postJson('/api/joiners', ['email' => 'added@example.com'])->assertStatus(201)->json();

        $this->assertNotNull($created['confirmedAt']);
        Mail::assertNothingQueued();
    }
}
