<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Media\Uploads;
use Tests\TestCase;

/**
 * A picture sent as a form's "file" part, as the phone app sends it (#134). React Native
 * reads the file from disk itself; a body made in JavaScript arrives altered on Android.
 * PHP reads forms only from a POST, so it is a POST with _method=PUT. Every check a raw
 * body meets still applies: what the contents are, what the field takes, the size.
 */
class MultipartUploadsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Storage::fake('local');
        Uploads::forget();
        Access::reset();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
    }

    private function png(): string
    {
        $image = imagecreatetruecolor(400, 300);
        imagefilledellipse($image, 200, 150, 120, 120, imagecolorallocate($image, 30, 120, 200));
        ob_start();
        imagepng($image);

        return (string) ob_get_clean();
    }

    private function send(string $url, UploadedFile $file): TestResponse
    {
        return $this->call('POST', $url, ['_method' => 'PUT'], [], ['file' => $file], ['HTTP_ACCEPT' => 'application/json']);
    }

    public function test_a_picture_sent_as_a_form_is_stored_like_one_sent_as_the_body(): void
    {
        $response = $this->send('/api/_nevela/uploads/Product/image', UploadedFile::fake()->createWithContent('photo.png', $this->png()))->assertSuccessful();

        $key = $response->json('key');
        $this->assertIsString($key);
        Storage::disk('public')->assertExists($key);
        // The name is the one the phone gave the part, when the address names none.
        $response->assertJsonPath('name', 'photo.png');
    }

    public function test_the_address_names_the_file_when_it_says_so(): void
    {
        $this->send('/api/_nevela/uploads/Product/image?name=kettle.png', UploadedFile::fake()->createWithContent('IMG_0001.png', $this->png()))
            ->assertSuccessful()
            ->assertJsonPath('name', 'kettle.png');
    }

    public function test_an_avatar_can_be_sent_as_a_form(): void
    {
        $this->send('/api/auth/avatar', UploadedFile::fake()->createWithContent('me.png', $this->png()))
            ->assertCreated()
            ->assertJsonPath('user.avatar', fn ($key) => str_starts_with((string) $key, 'users/avatar/'));
    }

    public function test_the_contents_decide_whatever_the_part_says_it_is(): void
    {
        $this->send('/api/_nevela/uploads/Product/image', UploadedFile::fake()->createWithContent('photo.png', 'plain text, not a picture'))
            ->assertStatus(422)
            ->assertJsonPath('error', "photo.png doesn't contain image data. It may have been renamed; choose the original file.");
    }

    public function test_a_file_too_large_for_the_field_is_refused(): void
    {
        config(['nevela.uploads.max_bytes' => 100]);
        Uploads::forget();

        $this->send('/api/_nevela/uploads/Product/image', UploadedFile::fake()->createWithContent('photo.png', $this->png()))->assertStatus(413);
    }

    public function test_a_file_larger_than_php_takes_from_a_form_says_which_setting(): void
    {
        // What PHP hands over when the part was over upload_max_filesize: no file, the error.
        $file = new UploadedFile(tempnam(sys_get_temp_dir(), 'nv'), 'huge.png', 'image/png', UPLOAD_ERR_INI_SIZE, true);

        $this->send('/api/_nevela/uploads/Product/image', $file)
            ->assertStatus(413)
            ->assertJsonPath('error', 'huge.png is larger than this server takes from a form (upload_max_filesize is '.ini_get('upload_max_filesize').').');
    }

    public function test_a_raw_body_still_works(): void
    {
        $bytes = $this->png();
        $this->call('PUT', '/api/_nevela/uploads/Product/image?name=kettle.png', [], [], [], [
            'CONTENT_TYPE' => 'image/png',
            'CONTENT_LENGTH' => strlen($bytes),
            'HTTP_ACCEPT' => 'application/json',
        ], $bytes)->assertSuccessful();
    }
}
