<?php

// Loaded with `php -d auto_prepend_file=…/autoload.php`, so the project's phpunit.xml and bootstrap stay untouched.
// The recorder loads only when PHPUnit asks for the extension, after the project's autoloader has loaded PHPUnit.
spl_autoload_register(static function (string $class): void {
    if (str_starts_with($class, 'ToVisual\\Laravel\\')) {
        require_once __DIR__.'/Recorder.php';
    }
});
