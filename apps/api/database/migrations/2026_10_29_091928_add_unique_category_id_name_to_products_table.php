<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Products: the category and name go together once only. Generated once by Nevela.
return new class extends Migration
{
    public function up(): void
    {
        // The trash's records count: the index is over every row.
        $shared = DB::table('products')->select('category_id', 'name')->groupBy('category_id', 'name')->havingRaw('count(*) > 1')->get()->count();
        if ($shared > 0) {
            throw new \RuntimeException("Some products have the category and name of another (".($shared === 1 ? 'one group' : "{$shared} groups")."). Change or delete all but one of each, the trash's too, and migrate again.");
        }
        Schema::table('products', function (Blueprint $table) {
            $table->unique(['category_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropUnique(['category_id', 'name']);
        });
    }
};
