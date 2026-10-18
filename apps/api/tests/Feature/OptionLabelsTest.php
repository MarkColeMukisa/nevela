<?php

namespace Tests\Feature;

use App\Models\Brief;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Support\Descriptor;
use Tests\GeneratesResources;
use Tests\TestCase;

/**
 * An enum's labels from the app's side: a generated model says what its value is called,
 * in the descriptor's words, for an email or a PDF. The API still stores and sends the value.
 */
class OptionLabelsTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Access::reset();
        $this->resources(fn () => [
            Descriptor::fromArray([
                'name' => 'Brief',
                'fields' => [
                    'title' => ['kind' => 'string'],
                    'timeline' => [
                        'kind' => 'enum',
                        'options' => ['asap', 'month', 'quarter', 'flexible'],
                        'optionLabels' => ['asap' => 'As soon as possible', 'quarter' => 'In 1 to 3 months'],
                    ],
                    'quote' => ['kind' => 'float', 'format' => 'money', 'currency' => 'UGX', 'required' => false],
                ],
            ]),
        ]);
    }

    public function test_a_record_says_what_its_value_is_called_and_the_api_keeps_the_value(): void
    {
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);

        $id = $this->postJson('/api/briefs', ['title' => 'A school site', 'timeline' => 'quarter', 'quote' => 4500000])->assertCreated()->assertJsonPath('timeline', 'quarter')->json('id');
        // A label is not a value: what is sent and stored is the value.
        $this->postJson('/api/briefs', ['title' => 'Another', 'timeline' => 'In 1 to 3 months'])->assertStatus(422)->assertJsonPath('issues.0.path', 'timeline');

        $brief = Brief::query()->findOrFail($id);
        $this->assertSame('In 1 to 3 months', $brief->optionLabel('timeline'));
        $brief->timeline = 'flexible';
        $this->assertSame('Flexible', $brief->optionLabel('timeline'));

        $this->expectExceptionMessage('Brief has no enum field "title"');
        $brief->optionLabel('title');
    }
}
