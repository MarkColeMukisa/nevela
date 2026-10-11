<?php

namespace Tests;

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Nevela\Laravel\Console\GenerateCommand;
use Nevela\Laravel\Generator\ResourceGenerator;
use Nevela\Laravel\Generator\Writer;
use Nevela\Laravel\Nevela;
use Nevela\Laravel\Support\Descriptor;
use Nevela\Laravel\Support\Naming;

/**
 * Resources for one test class, beside the example shop's, without adding them to it.
 *
 * The descriptors are generated from, as `nevela generate` would, into a temporary
 * folder. The code is loaded from there, its migrations are run and its routes added, so
 * a test calls a generated controller over HTTP as an app would have it.
 *
 * A class can be loaded once in a process, so every test class using this names its
 * resources differently from every other's.
 */
trait GeneratesResources
{
    /** Where the generated code is. Written once per process. */
    private static ?string $dir = null;

    /**
     * @param  callable(list<Descriptor>): list<Descriptor>  $describe  Given the shop's resources, the ones to add. Called once, with the database there to read.
     */
    protected function resources(callable $describe): void
    {
        $first = self::$dir === null;
        self::$dir ??= sys_get_temp_dir().DIRECTORY_SEPARATOR.'nevela-test-'.bin2hex(random_bytes(4));
        config(['nevela.descriptors_path' => self::$dir.DIRECTORY_SEPARATOR.'descriptors']);
        Nevela::forget();
        if ($first) {
            $this->generate($describe);
        }
        $all = Nevela::all();
        $generator = new ResourceGenerator;
        foreach ($all as $descriptor) {
            // What `php artisan migrate` would run: the trash for a table that was there,
            // and the table itself for a resource that is new.
            if ($descriptor->adopted) {
                $this->assertTrue(GenerateCommand::needsTrashMigration([], false, Schema::hasColumn($descriptor->table, 'deleted_at'), true));
                $this->migrate($generator->trashMigration($descriptor));
            } elseif (! Schema::hasTable($descriptor->table)) {
                $this->migrate($generator->migration($descriptor, $all));
            }
            if (method_exists($model = "App\\Models\\{$descriptor->name}", 'forgetTrash')) {
                $model::forgetTrash();
            }
        }
        $new = array_values(array_filter($all, fn (Descriptor $d) => ! in_array($d->name, ['Category', 'Product'], true)));
        Route::prefix('api')->middleware(config('nevela.middleware'))->group($this->file($generator->routes($new)->contents));
    }

    /** @param callable(list<Descriptor>): list<Descriptor> $describe */
    private function generate(callable $describe): void
    {
        $dir = self::$dir;
        $shop = array_map(fn (string $file) => Descriptor::fromJson((string) file_get_contents($file)), glob(base_path('nevela/resources/*.json')));
        $made = $describe($shop);
        $all = [...$shop, ...$made];

        mkdir($dir.'/descriptors', 0775, true);
        foreach ($all as $descriptor) {
            file_put_contents($dir.'/descriptors/'.Naming::kebab($descriptor->name).'.json', $descriptor->toJson());
        }

        $generator = new ResourceGenerator;
        $files = [];
        foreach ($made as $descriptor) {
            array_push($files, ...$generator->forResource($descriptor, '2026_10_11_000000', $all));
        }
        foreach ((new Writer(['api' => $dir.'/api', 'web' => $dir.'/web']))->write($files) as $row) {
            $this->assertSame('created', $row['status'], $row['path']);
            if (str_ends_with($row['path'], '.php') && ! str_contains($row['path'], 'migrations')) {
                require_once $row['path'];
            }
        }
    }

    private function migrate(string $migration): void
    {
        (require $this->file($migration))->up();
    }

    /** Generated code that isn't a class, in a file to be loaded from: a migration, the routes. */
    private function file(string $php): string
    {
        $path = self::$dir.DIRECTORY_SEPARATOR.'loaded'.DIRECTORY_SEPARATOR.sha1($php).'.php';
        if (! is_file($path)) {
            is_dir(dirname($path)) || mkdir(dirname($path), 0775, true);
            file_put_contents($path, $php);
        }

        return $path;
    }

    private function descriptor(string $name): Descriptor
    {
        return Nevela::resource($name);
    }
}
