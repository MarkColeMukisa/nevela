<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The table Nevela generates for the same fields. run.sh compares the two databases'
// tables before measuring anything, and stops if they differ.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('sku')->unique();
            $table->text('description')->nullable();
            $table->decimal('price', 12, 2);
            $table->integer('stock');
            $table->boolean('active')->default(false);
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
