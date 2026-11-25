<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Nevela\Laravel\Nevela;
use Nevela\Laravel\Support\Field;
use Tests\TestCase;

/**
 * What the dashboard and the phone each do with the API is written down in
 * scripts/parity.json, a line per route. This makes sure nothing is left off it: a route
 * added to Nevela fails here until someone says whether the dashboard, the phone or both
 * use it, and why one has none. scripts/parity.test.mjs checks each line against the apps.
 *
 * Only in this repository: new apps are made without this folder.
 */
class ParityTest extends TestCase
{
    /** @return array{routes: array<string, mixed>, kinds: array<string, mixed>} */
    private function manifest(): array
    {
        $file = base_path('../../scripts/parity.json');
        $this->assertFileExists($file);

        return json_decode((string) file_get_contents($file), true, flags: JSON_THROW_ON_ERROR);
    }

    /**
     * Nevela's routes as the list names them: "METHOD address", without the prefix. A
     * resource's own create-read-update-delete routes are left out; its others (_bulk,
     * _stats…) are named once for every resource, as {slug}.
     *
     * @return list<string>
     */
    private function routes(): array
    {
        $prefix = trim((string) config('nevela.prefix', 'api'), '/');
        $slugs = array_map(fn ($descriptor) => $descriptor->slug, Nevela::all());
        $found = [];
        foreach (Route::getRoutes() as $route) {
            $uri = trim($route->uri(), '/');
            if (! str_starts_with($uri, $prefix.'/')) {
                continue;
            }
            $address = substr($uri, strlen($prefix) + 1);
            $parts = explode('/', $address);
            if ($address === 'user') {
                continue; // Laravel's own example route, in routes/api.php
            }
            if (in_array($parts[0], $slugs, true)) {
                if (! collect($parts)->contains(fn ($part) => str_starts_with($part, '_'))) {
                    continue;
                }
                $parts[0] = '{slug}';
                if (isset($parts[1]) && str_starts_with($parts[1], '{')) {
                    $parts[1] = '{id}';
                }
                $address = implode('/', $parts);
            }
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $found[] = "{$method} {$address}";
            }
        }

        return array_values(array_unique($found));
    }

    public function test_every_route_says_whether_the_dashboard_the_phone_or_both_use_it(): void
    {
        $listed = array_keys($this->manifest()['routes']);
        $missing = array_values(array_diff($this->routes(), $listed));

        $this->assertSame([], $missing, 'Add these to scripts/parity.json: "both", or which side uses them and why the other has none.');
    }

    public function test_every_line_names_a_route_there_is(): void
    {
        $routes = $this->routes();
        $stale = array_values(array_diff(array_keys($this->manifest()['routes']), $routes));

        $this->assertSame([], $stale, 'scripts/parity.json lists routes there are no longer: take them out.');
    }

    public function test_every_kind_of_field_says_whether_the_phone_can_fill_it(): void
    {
        $kinds = array_keys($this->manifest()['kinds']);
        sort($kinds);
        $known = Field::KINDS;
        sort($known);

        $this->assertSame($known, $kinds, 'scripts/parity.json lists the kinds of field (Field::KINDS), each "both" or why the phone can\'t fill it.');
    }
}
