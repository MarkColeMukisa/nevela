<?php

namespace App\Nevela\Actions\DocVisit {
    use App\Models\DocVisit;

    class Confirm
    {
        public function handle(DocVisit $booking, array $input): ?string
        {
            $booking->update(['status' => 'confirmed']);

            return "Confirmed {$booking->guest}.";
        }
    }

    class Remind
    {
        public function handle(array $input): ?string
        {
            return 'Reminders sent.';
        }
    }
}

namespace Tests\Feature {
    use App\Models\Category;
    use App\Models\DocVisit;
    use App\Models\DocVenue;
    use App\Models\Product;
    use App\Models\User;
    use Illuminate\Foundation\Testing\RefreshDatabase;
    use Illuminate\Http\UploadedFile;
    use Illuminate\Routing\Route as LaravelRoute;
    use Illuminate\Support\Facades\Route;
    use Illuminate\Support\Facades\Storage;
    use Illuminate\Testing\TestResponse;
    use Laravel\Sanctum\Sanctum;
    use Nevela\Laravel\Access\Access;
    use Nevela\Laravel\Access\Permissions;
    use Nevela\Laravel\Nevela;
    use Nevela\Laravel\Support\Descriptor;
    use Tests\GeneratesResources;
    use Tests\TestCase;

    /**
     * GET _nevela/openapi.json, held to what the app really does: every route the
     * descriptors make is in it and nothing else is, and what the API answers fits the
     * schemas it gives, which say every key a record has and no other.
     */
    class OpenApiTest extends TestCase
    {
        use GeneratesResources, RefreshDatabase;

        /** @var array<string, mixed> */
        private array $doc;

        protected function setUp(): void
        {
            parent::setUp();
            Storage::fake('public');
            Storage::fake('local');
            $this->resources(fn () => [
                Descriptor::fromArray([
                    'name' => 'DocVenue',
                    'id' => 'int',
                    'fields' => [
                        'name' => ['kind' => 'string'],
                        'country' => ['kind' => 'string', 'format' => 'country', 'required' => false],
                        'stars' => ['kind' => 'int', 'format' => 'rating', 'required' => false],
                        'colour' => ['kind' => 'string', 'format' => 'color', 'required' => false],
                        'opensAt' => ['kind' => 'string', 'format' => 'time', 'required' => false],
                        'extras' => ['kind' => 'json', 'required' => false],
                        'plan' => ['kind' => 'file', 'accept' => ['pdf'], 'private' => true, 'required' => false],
                    ],
                    'public' => ['read' => ['fields' => ['name', 'stars']]],
                ]),
                Descriptor::fromArray([
                    'name' => 'DocVisit',
                    'fields' => [
                        'docVenueId' => ['kind' => 'belongsTo', 'target' => 'DocVenue'],
                        'guest' => ['kind' => 'string'],
                        'email' => ['kind' => 'string', 'format' => 'email', 'required' => false],
                        'day' => ['kind' => 'date'],
                        'startsAt' => ['kind' => 'datetime', 'required' => false],
                        'status' => ['kind' => 'enum', 'options' => ['pending', 'confirmed', 'cancelled'], 'default' => 'pending'],
                        'amount' => ['kind' => 'float', 'format' => 'money', 'required' => false],
                        'paid' => ['kind' => 'boolean'],
                        'note' => ['kind' => 'text', 'format' => 'rich', 'required' => false],
                    ],
                    'actions' => [
                        'confirm' => ['on' => 'record', 'when' => ['status' => 'pending'], 'many' => true, 'confirm' => 'Confirm this booking?'],
                        'remind' => ['on' => 'collection', 'fields' => ['message' => ['kind' => 'text']]],
                    ],
                ]),
                Descriptor::fromArray([
                    'name' => 'DocEnquiry',
                    'fields' => [
                        'name' => ['kind' => 'string'],
                        'email' => ['kind' => 'string', 'format' => 'email'],
                        'photo' => ['kind' => 'file', 'accept' => ['image'], 'required' => false],
                    ],
                    'public' => ['read' => ['fields' => ['name', 'photo']], 'create' => ['fields' => ['name', 'email', 'photo']]],
                ]),
            ]);
            Access::reset();
            Permissions::forget();
            $user = User::factory()->create();
            $this->assertTrue(Access::grant($user, 'ADMIN'));
            Sanctum::actingAs($user->refresh());

            $this->doc = $this->getJson('/api/_nevela/openapi.json')->assertOk()->json();
        }

        public function test_it_is_openapi_3_1_and_every_reference_in_it_leads_somewhere(): void
        {
            $this->assertSame('3.1.0', $this->doc['openapi']);
            $this->assertSame(url('api'), $this->doc['servers'][0]['url']);
            array_walk_recursive($this->doc, function ($value, $key) {
                if ($key === '$ref') {
                    $this->assertNotNull($this->resolve($value), "{$value} leads nowhere");
                }
            });
            $ids = [];
            foreach ($this->operations() as [$method, $path, $operation]) {
                $this->assertArrayNotHasKey($operation['operationId'], $ids, "{$method} {$path}: operationId used twice");
                $ids[$operation['operationId']] = true;
            }
        }

        public function test_it_needs_a_signed_in_person_like_the_descriptors_do(): void
        {
            $this->app['auth']->forgetGuards();
            $this->withHeader('Authorization', '')->getJson('/api/_nevela/openapi.json')->assertUnauthorized();
        }

        public function test_every_route_the_descriptors_make_is_in_it_and_nothing_else(): void
        {
            // A resource's routes, by their addresses: its own, its public ones, and a public form's helpers.
            $patterns = [];
            foreach (Nevela::all() as $d) {
                $slug = preg_quote($d->slug, '#');
                $name = preg_quote($d->name, '#');
                $patterns[] = "#^api/(public/)?{$slug}(/|$)#";
                $patterns[] = "#^api/public/_nevela/(form|confirm)/{$slug}(/|$)#";
                $patterns[] = "#^api/public/_nevela/uploads/{$name}/#";
            }
            $generated = [];
            foreach (Route::getRoutes()->getRoutes() as $route) {
                /** @var LaravelRoute $route */
                if (array_filter($patterns, fn (string $pattern) => preg_match($pattern, $route->uri()) === 1) === []) {
                    continue;
                }
                foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                    $generated[] = $method.' '.preg_replace('/\{[a-z_]+\}/', '{id}', preg_replace('#^api#', '', $route->uri()));
                }
            }
            $documented = [];
            foreach ($this->operations() as [$method, $path, $operation]) {
                // A form's upload is a POST that Laravel turns into the PUT it names.
                $real = isset($operation['requestBody']['content']['multipart/form-data']) ? 'PUT' : $method;
                $this->assertNotNull($this->route($real, $path), "{$method} {$path} is in the document but the app has no such route");
                $documented[] = $real.' '.preg_replace('/\{[a-z]+\}/', '{id}', $path);
            }
            sort($generated);
            $missing = array_values(array_diff(array_unique($generated), $documented));
            $this->assertSame([], $missing, 'routes the descriptors make that the document leaves out');
            $this->assertContains('GET /public/doc-venues', $documented);
            $this->assertContains('POST /doc-visits/{id}/_actions/confirm', $documented);
            $this->assertContains('POST /doc-visits/_actions/confirm', $documented);
            $this->assertContains('POST /doc-visits/_actions/remind', $documented);
        }

        public function test_what_a_create_needs_is_what_the_generated_request_requires(): void
        {
            $input = $this->doc['components']['schemas']['DocVisitInput'];
            // A default, a yes/no left alone (a no) and an optional field aren't needed.
            $this->assertSame(['docVenueId', 'guest', 'day'], $input['required']);
            $this->assertArrayNotHasKey('updatedAt', $input['properties']);
            $this->assertArrayHasKey('updatedAt', $this->doc['components']['schemas']['DocVisitReplace']['properties']);
            $this->assertArrayNotHasKey('required', $this->doc['components']['schemas']['DocVisitPatch']);
            $this->assertSame(['customer', 'status'], $this->doc['components']['schemas']['OrderInput']['required']);
            // A line's link to its order is set by saving it with the order.
            $this->assertArrayNotHasKey('orderId', $this->doc['components']['schemas']['OrderItemLine']['properties']);

            // Each required field, left out, is refused for itself; the ones not listed aren't.
            $refused = $this->postJson('/api/doc-visits', [])->assertUnprocessable();
            $this->assertEqualsCanonicalizing($input['required'], array_column($refused->json('issues'), 'path'));
            $this->check('post', '/doc-visits', $refused);
        }

        public function test_what_the_api_answers_fits_the_document(): void
        {
            // The shop: a list, a create with an image uploaded first, a record with its lines.
            $category = Category::create(['name' => 'Kitchen', 'slug' => 'kitchen']);
            $this->check('get', '/categories', $this->getJson('/api/categories')->assertOk());
            $png = UploadedFile::fake()->image('kettle.png', 40, 40);
            $image = $this->call('PUT', '/api/_nevela/uploads/Product/image?name=kettle.png', [], [], [], ['CONTENT_TYPE' => 'image/png', 'HTTP_ACCEPT' => 'application/json'], (string) file_get_contents($png->getRealPath()));
            $this->check('put', '/_nevela/uploads/Product/image', $image->assertCreated());
            $form = $this->call('POST', '/api/_nevela/uploads/Product/gallery', ['_method' => 'PUT'], [], ['file' => UploadedFile::fake()->image('side.png', 30, 30)], ['HTTP_ACCEPT' => 'application/json']);
            $this->check('post', '/_nevela/uploads/Product/gallery', $form->assertCreated());
            $product = $this->postJson('/api/products', [
                'name' => 'Kettle', 'sku' => 'K-1', 'price' => 49.5, 'categoryId' => $category->id, 'active' => true, 'kind' => 'stock',
                'image' => $image->json('key'), 'gallery' => [$form->json('key')],
            ]);
            $this->check('post', '/products', $product->assertCreated());
            $this->check('get', '/products/{id}', $this->getJson('/api/products/'.$product->json('id'))->assertOk());
            $this->check('get', '/products', $this->getJson('/api/products?sort=-price&filter[active]=true&q=kett')->assertOk());
            $this->check('get', '/products', $this->getJson('/api/products?sort=colour')->assertStatus(400));
            $this->check('get', '/products/_stats', $this->getJson('/api/products/_stats?field=kind')->assertOk());
            $this->check('get', '/products/_insights', $this->getJson('/api/products/_insights?unit=week')->assertOk());
            $order = $this->postJson('/api/orders', ['customer' => 'Ada', 'status' => 'pending', 'items' => [['productId' => $product->json('id'), 'quantity' => 2, 'price' => 49.5]]]);
            $this->check('post', '/orders', $order->assertCreated());
            $this->check('get', '/orders/{id}', $this->getJson('/api/orders/'.$order->json('id'))->assertOk());
            $this->check('get', '/order-items', $this->getJson('/api/order-items')->assertOk());
            $this->check('post', '/categories/_bulk', $this->postJson('/api/categories/_bulk', ['items' => [['name' => 'Garden', 'slug' => 'garden']]])->assertCreated());
            $this->check('post', '/categories/_bulk', $this->postJson('/api/categories/_bulk', ['items' => [['name' => 'No slug']]])->assertUnprocessable());

            // An integer id, a private file, the formats; a change, and one made too late.
            $venue = DocVenue::create(['name' => 'Hall', 'country' => 'UG', 'stars' => 4, 'colour' => '#aabbcc', 'opens_at' => '09:00', 'extras' => ['parking' => true]]);
            $plan = $this->call('PUT', '/api/_nevela/uploads/DocVenue/plan?name=plan.pdf', [], [], [], ['CONTENT_TYPE' => 'application/pdf', 'HTTP_ACCEPT' => 'application/json'], "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
            $this->check('put', '/_nevela/uploads/DocVenue/plan', $plan->assertCreated());
            $changed = $this->patchJson("/api/doc-venues/{$venue->id}", ['plan' => $plan->json('key')]);
            $this->check('patch', '/doc-venues/{id}', $changed->assertOk());
            $this->assertIsString($changed->json('id'));
            $read = $changed->json('updatedAt');
            $this->travel(2)->seconds();
            $this->patchJson("/api/doc-venues/{$venue->id}", ['name' => 'Big hall'])->assertOk();
            $this->check('put', '/doc-venues/{id}', $this->putJson("/api/doc-venues/{$venue->id}", ['name' => 'Old', 'updatedAt' => $read])->assertConflict());
            $this->check('get', '/doc-venues', $this->getJson('/api/doc-venues')->assertOk());

            // Every kind of value, an action on one and on several, and one on the list.
            $booking = $this->postJson('/api/doc-visits', ['docVenueId' => $venue->id, 'guest' => 'Grace', 'day' => '2026-12-01', 'startsAt' => '2026-12-01T18:00:00Z', 'amount' => 120, 'note' => '<p>Window <b>table</b></p>']);
            $this->check('post', '/doc-visits', $booking->assertCreated());
            $second = DocVisit::create(['doc_venue_id' => $venue->id, 'guest' => 'Lin', 'day' => '2026-12-02', 'status' => 'pending', 'paid' => false]);
            $this->check('post', '/doc-visits/{id}/_actions/confirm', $this->postJson('/api/doc-visits/'.$booking->json('id').'/_actions/confirm')->assertOk());
            $this->check('post', '/doc-visits/{id}/_actions/confirm', $this->postJson('/api/doc-visits/'.$booking->json('id').'/_actions/confirm')->assertConflict());
            $this->check('post', '/doc-visits/_actions/confirm', $this->postJson('/api/doc-visits/_actions/confirm', ['ids' => [$booking->json('id'), $second->id]])->assertOk());
            $this->check('post', '/doc-visits/_actions/remind', $this->postJson('/api/doc-visits/_actions/remind', ['input' => ['message' => 'See you soon']])->assertOk());
            $this->check('post', '/doc-visits/_actions/remind', $this->postJson('/api/doc-visits/_actions/remind', ['input' => []])->assertUnprocessable());
            $this->check('delete', '/doc-visits/{id}', $this->deleteJson("/api/doc-visits/{$second->id}")->assertNoContent());
            $this->check('get', '/doc-visits/{id}', $this->getJson("/api/doc-visits/{$second->id}")->assertNotFound());

            // Signed out: the public list and record, a form with a photo.
            $this->app['auth']->forgetGuards();
            $this->check('get', '/public/doc-venues', $this->getJson('/api/public/doc-venues')->assertOk());
            // Its model's publicQuery is as generated, letting nothing through until the app says what may be.
            $this->check('get', '/public/doc-venues/{id}', $this->getJson("/api/public/doc-venues/{$venue->id}")->assertNotFound());
            $me = UploadedFile::fake()->image('me.png', 20, 20);
            $photo = $this->call('PUT', '/api/public/doc-enquiries/_uploads/photo?name=me.png', [], [], [], ['CONTENT_TYPE' => 'image/png', 'HTTP_ACCEPT' => 'application/json'], (string) file_get_contents($me->getRealPath()));
            $this->check('put', '/public/doc-enquiries/_uploads/photo', $photo->assertCreated());
            $sent = $this->postJson('/api/public/doc-enquiries', ['name' => 'Kim', 'email' => 'kim@example.com', 'photo' => $photo->json('key')]);
            $this->check('post', '/public/doc-enquiries', $sent->assertCreated());
            $this->check('post', '/public/doc-enquiries', $this->postJson('/api/public/doc-enquiries', ['name' => 'Kim'])->assertUnprocessable());
        }

        // --- reading the document

        /** @return list<array{string, string, array<string, mixed>}> */
        private function operations(): array
        {
            $all = [];
            foreach ($this->doc['paths'] as $path => $item) {
                foreach (['get', 'post', 'put', 'patch', 'delete'] as $method) {
                    if (isset($item[$method])) {
                        $all[] = [strtoupper($method), $path, $item[$method]];
                    }
                }
            }

            return $all;
        }

        /** The app's route a documented address and method lead to, if any. */
        private function route(string $method, string $path): ?LaravelRoute
        {
            $sample = '/api'.preg_replace('/\{[a-z]+\}/', '1', $path);
            try {
                return Route::getRoutes()->match(\Illuminate\Http\Request::create($sample, $method));
            } catch (\Throwable) {
                return null;
            }
        }

        private function resolve(string $ref): mixed
        {
            $node = $this->doc;
            foreach (explode('/', substr($ref, 2)) as $part) {
                if (! is_array($node) || ! array_key_exists($part, $node)) {
                    return null;
                }
                $node = $node[$part];
            }

            return $node;
        }

        /** What the document says this answer is, and that the answer is that. */
        private function check(string $method, string $path, TestResponse $response): void
        {
            $operation = $this->doc['paths'][$path][$method] ?? null;
            $this->assertNotNull($operation, "{$method} {$path} isn't in the document");
            $status = (string) $response->getStatusCode();
            $answer = $operation['responses'][$status] ?? null;
            $this->assertNotNull($answer, "{$method} {$path} answered {$status}, which the document doesn't list: ".$response->getContent());
            if (isset($answer['$ref'])) {
                $answer = $this->resolve($answer['$ref']);
            }
            $schema = $answer['content']['application/json']['schema'] ?? null;
            if ($schema === null) {
                $this->assertSame('', (string) $response->getContent(), "{$method} {$path} {$status} has a body the document doesn't describe");

                return;
            }
            $problems = $this->problems($response->json(), $schema, '$');
            $this->assertSame([], $problems, "{$method} {$path} {$status} doesn't fit the document: ".$response->getContent());
        }

        /**
         * Where a value doesn't fit a schema: the part of JSON Schema the document uses.
         *
         * @param  array<string, mixed>  $schema
         * @return list<string>
         */
        private function problems(mixed $value, array $schema, string $at): array
        {
            if (isset($schema['$ref'])) {
                return $this->problems($value, $this->resolve($schema['$ref']), $at);
            }
            if (isset($schema['oneOf'])) {
                $fits = array_filter($schema['oneOf'], fn (array $one) => $this->problems($value, $one, $at) === []);

                return count($fits) === 1 ? [] : ["{$at}: fits ".count($fits).' of oneOf'];
            }
            if (isset($schema['type'])) {
                $types = (array) $schema['type'];
                $is = match (true) {
                    $value === null => 'null',
                    is_bool($value) => 'boolean',
                    is_int($value) => 'integer',
                    is_float($value) => 'number',
                    is_string($value) => 'string',
                    is_array($value) && array_is_list($value) && ($value !== [] || ! in_array('object', $types, true)) => 'array',
                    default => 'object',
                };
                $ok = in_array($is, $types, true) || ($is === 'integer' && in_array('number', $types, true));
                if (! $ok) {
                    return ["{$at}: is {$is}, not ".implode('|', $types)];
                }
            }
            $problems = [];
            if (isset($schema['enum']) && ! in_array($value, $schema['enum'], true)) {
                $problems[] = "{$at}: ".json_encode($value).' is not one of '.json_encode($schema['enum']);
            }
            if (is_string($value)) {
                if (isset($schema['pattern']) && ! preg_match('/'.str_replace('/', '\/', $schema['pattern']).'/u', $value)) {
                    $problems[] = "{$at}: \"{$value}\" doesn't match {$schema['pattern']}";
                }
                $format = $schema['format'] ?? null;
                $bad = match ($format) {
                    'uuid' => ! preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $value),
                    'date' => ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value),
                    'date-time' => ! preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/', $value),
                    'email' => ! filter_var($value, FILTER_VALIDATE_EMAIL),
                    'uri' => ! filter_var($value, FILTER_VALIDATE_URL),
                    default => false,
                };
                if ($bad) {
                    $problems[] = "{$at}: \"{$value}\" is not a {$format}";
                }
            }
            if ((is_int($value) || is_float($value)) && ((isset($schema['minimum']) && $value < $schema['minimum']) || (isset($schema['maximum']) && $value > $schema['maximum']))) {
                $problems[] = "{$at}: {$value} is out of range";
            }
            if (is_array($value) && array_is_list($value) && isset($schema['items']) && ($value !== [] || ! isset($schema['properties']))) {
                foreach ($value as $i => $one) {
                    array_push($problems, ...$this->problems($one, $schema['items'], "{$at}[{$i}]"));
                }
            }
            if (is_array($value) && (! array_is_list($value) || $value === []) && ! isset($schema['items'])) {
                foreach ($schema['required'] ?? [] as $key) {
                    if (! array_key_exists($key, $value)) {
                        $problems[] = "{$at}: has no \"{$key}\"";
                    }
                }
                foreach ($value as $key => $one) {
                    $property = $schema['properties'][$key] ?? null;
                    $extra = $schema['additionalProperties'] ?? null;
                    if ($property !== null) {
                        array_push($problems, ...$this->problems($one, $property, "{$at}.{$key}"));
                    } elseif ($extra === false) {
                        $problems[] = "{$at}: has \"{$key}\", which the document doesn't list";
                    } elseif (is_array($extra)) {
                        array_push($problems, ...$this->problems($one, $extra, "{$at}.{$key}"));
                    }
                }
            }

            return $problems;
        }
    }
}
