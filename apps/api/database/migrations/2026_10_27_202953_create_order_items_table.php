<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Generated once by Nevela. Later descriptor changes need a new migration of your own.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('product_id')->index()->constrained('products');
            $table->integer('quantity');
            $table->decimal('price', 12, 2);
            $table->foreignUuid('order_id')->index()->constrained('orders');
            $table->timestamps();
            // When a record was deleted. Until it is removed for good it sits in the trash.
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
    }
};
