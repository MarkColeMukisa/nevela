<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Nevela\Laravel\Nevela;
use Nevela\Laravel\Support\DashboardUpdate;
use Phar;
use PharData;
use Tests\TestCase;

/**
 * `nevela upgrade` on an app from before packages/shared: the folder's files it hasn't got are
 * added and the ones it has are left alone, and a next.config.ts the app made its own is kept,
 * with the lines it now needs named.
 */
class SharedFolderUpgradeTest extends TestCase
{
    private string $root;

    protected function setUp(): void
    {
        parent::setUp();
        $this->root = sys_get_temp_dir().'/nevela-shared-'.bin2hex(random_bytes(4));
        mkdir("{$this->root}/apps/web", 0775, true);
        mkdir("{$this->root}/packages/shared", 0775, true);
        mkdir("{$this->root}/templates", 0775, true);
        config(['nevela.web_path' => "{$this->root}/apps/web"]);
        // The newest release is this one: nothing is asked of Packagist.
        Http::fake(['*' => Http::response(['packages' => ['nevela/laravel' => [['version' => Nevela::VERSION]]]])]);
    }

    protected function tearDown(): void
    {
        putenv('NEVELA_TEMPLATE_DIR');
        $this->remove($this->root);
        parent::tearDown();
    }

    /** create-nevela-<version>.tgz as npm has it: package/template/web and package/template/shared. */
    private function template(array $web, array $shared): void
    {
        $tar = "{$this->root}/templates/t.tar";
        $archive = new PharData($tar);
        foreach ($web as $path => $contents) {
            $archive->addFromString("package/template/web/{$path}", $contents);
        }
        foreach ($shared as $path => $contents) {
            $archive->addFromString("package/template/shared/{$path}", $contents);
        }
        $archive->compress(Phar::GZ);
        unset($archive);
        rename("{$tar}.gz", "{$this->root}/templates/create-nevela-".Nevela::VERSION.'.tgz');
        putenv("NEVELA_TEMPLATE_DIR={$this->root}/templates");
    }

    public function test_an_older_app_gets_the_shared_files_it_lacks_and_is_told_about_its_own_next_config(): void
    {
        $oldConfig = "export default {};\n";
        $newConfig = "const project = '../..';\nexport default { turbopack: { root: project }, outputFileTracingRoot: project };\n";
        $this->template(
            ['next.config.ts' => $newConfig, 'package.json' => '{"name":"web"}'],
            ['brand.ts' => "export const brand = { name: \"Nevela\" };\n", 'layout.ts' => "export const layout = { tabs: \"shop\" };\n"],
        );
        // The app is on an older template, and has made next.config.ts its own.
        file_put_contents("{$this->root}/apps/web/next.config.ts", "export default { reactStrictMode: true };\n");
        file_put_contents("{$this->root}/apps/web/package.json", '{"name":"my-shop-web"}');
        file_put_contents("{$this->root}/apps/web/.nevela.json", json_encode(['template' => '0.1.0', 'files' => ['next.config.ts' => DashboardUpdate::hash($oldConfig)]]));
        // Its brand is already there, with its own name.
        file_put_contents("{$this->root}/packages/shared/brand.ts", "export const brand = { name: \"My Shop\" };\n");

        Artisan::call('nevela:upgrade', ['--check' => true, '--skip-package' => true]);
        $output = preg_replace('/\s+/', ' ', Artisan::output());

        $this->assertStringContainsString('packages/shared/layout.ts', $output);
        $this->assertStringNotContainsString('packages/shared/brand.ts', $output);
        $this->assertStringContainsString('next.config.ts is yours, so it was kept', $output);
        $this->assertStringContainsString('turbopack: { root: path.join(__dirname, "..", "..") }', $output);
        // --check changes nothing.
        $this->assertFileDoesNotExist("{$this->root}/packages/shared/layout.ts");
        $this->assertStringContainsString('My Shop', (string) file_get_contents("{$this->root}/packages/shared/brand.ts"));
    }

    public function test_an_app_whose_next_config_the_update_replaces_is_not_warned(): void
    {
        $oldConfig = "export default {};\n";
        $this->template(['next.config.ts' => "export default { turbopack: { root: '../..' }, outputFileTracingRoot: '../..' };\n"], ['layout.ts' => "export const layout = {};\n"]);
        // Untouched since the old template: the update replaces it, turbopack and all.
        file_put_contents("{$this->root}/apps/web/next.config.ts", $oldConfig);
        file_put_contents("{$this->root}/apps/web/.nevela.json", json_encode(['template' => '0.1.0', 'files' => ['next.config.ts' => DashboardUpdate::hash($oldConfig)]]));

        Artisan::call('nevela:upgrade', ['--check' => true, '--skip-package' => true]);

        $this->assertStringNotContainsString('so it was kept', preg_replace('/\s+/', ' ', Artisan::output()));
    }

    public function test_the_brand_an_older_app_gets_keeps_its_own_name_and_tagline(): void
    {
        $site = "export const site = {\n  name: \"My \\\"Shop\\\"\",\n  tagline: \"Fresh \$5 juice\",\n  description: \"…\",\n};\n";
        $brand = "export const brand = {\n  name: \"Nevela\",\n  /** One line. */\n  tagline: \"The fastest way to run your business\",\n};\n";

        $this->assertSame(
            "export const brand = {\n  name: \"My \\\"Shop\\\"\",\n  /** One line. */\n  tagline: \"Fresh \$5 juice\",\n};\n",
            \Nevela\Laravel\Console\UpdateCommand::brandFrom($site, $brand),
        );
        // Single quotes, escape and all, are kept as written.
        $this->assertStringContainsString("  name: 'Bob\\'s Bar',\n", \Nevela\Laravel\Console\UpdateCommand::brandFrom("  name: 'Bob\\'s Bar',\n", $brand));
        // A site.ts that no longer says them leaves the template's as they are.
        $this->assertSame($brand, \Nevela\Laravel\Console\UpdateCommand::brandFrom("export const site = { name: brand.name };\n", $brand));
    }

    public function test_a_config_sets_its_root_only_with_both_settings(): void
    {
        $sets = fn (string $config) => \Nevela\Laravel\Console\UpdateCommand::setsRoot($config);

        $this->assertTrue($sets("turbopack: { root: project },\n  outputFileTracingRoot: project,"));
        $this->assertFalse($sets("turbopack: {},\n  outputFileTracingRoot: project,"));
        $this->assertFalse($sets('turbopack: { root: project },'));
        $this->assertTrue($sets((string) file_get_contents(base_path('../web/next.config.ts'))), 'the template sets it');
    }

    private function remove(string $dir): void
    {
        if (! is_dir($dir)) {
            return;
        }
        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST) as $item) {
            $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
        }
        @rmdir($dir);
    }
}
