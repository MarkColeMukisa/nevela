<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Gives Categories a trash: a deleted record is kept, hidden, and can be restored
// for a while (config/nevela.php, trash.days). Generated once by Nevela.
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('categories') && ! Schema::hasColumn('categories', 'deleted_at')) {
            Schema::table('categories', function (Blueprint $table) {
                $table->softDeletes();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('categories', 'deleted_at')) {
            Schema::table('categories', function (Blueprint $table) {
                $table->dropSoftDeletes();
            });
        }
    }
};
