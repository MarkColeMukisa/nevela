<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The app's SQLite connection as Nevela leaves it: waiting for writes instead of answering
 * "database is locked" (Support\SqliteDefaults, applied as the app starts).
 */
class SqliteSettingsTest extends TestCase
{
    public function test_the_app_s_sqlite_connection_waits_for_writes_and_lets_readers_through(): void
    {
        $sqlite = config('database.connections.sqlite');

        $this->assertSame(5000, $sqlite['busy_timeout']);
        $this->assertSame('wal', $sqlite['journal_mode']);
        $this->assertSame('normal', $sqlite['synchronous']);
        $this->assertSame('IMMEDIATE', $sqlite['transaction_mode']);
    }
}
