<?php

// A tutorial's cover, made small enough to ship in every new app: scripts/tutorial-posts.mjs runs it.
//
//   php scripts/tutorial-cover.php <from.webp> <to.webp> <width> <most bytes>
//
// Scaled to the width, then saved as WebP at the best quality that stays within the bytes.

[$from, $to, $width, $most] = array_slice($argv, 1) + [null, null, 800, 61440];
if (! function_exists('imagewebp')) {
    fwrite(STDERR, "PHP's GD extension, with WebP, is needed to make covers smaller.\n");
    exit(1);
}
$source = imagecreatefromstring((string) file_get_contents($from));
if ($source === false) {
    fwrite(STDERR, "{$from} isn't a picture GD can read.\n");
    exit(1);
}
$width = (int) $width;
$height = (int) round(imagesy($source) * $width / imagesx($source));
$image = imagecreatetruecolor($width, $height);
imagecopyresampled($image, $source, 0, 0, 0, 0, $width, $height, imagesx($source), imagesy($source));

foreach ([85, 80, 75, 70, 65, 60, 55, 50, 45, 40] as $quality) {
    imagewebp($image, $to, $quality);
    clearstatcache(true, $to);
    if (filesize($to) <= (int) $most) {
        echo "{$width}x{$height}, quality {$quality}, ".round(filesize($to) / 1024).' KB';
        exit(0);
    }
}
fwrite(STDERR, "{$to} is still over ".round($most / 1024)." KB at quality 40.\n");
exit(1);
