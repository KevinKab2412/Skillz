<?php

/**
 * Record a concept trace from a Laravel test run (PHPUnit ≥ 10), from outside the repo under review.
 *
 * Each request a test sends through Laravel's HTTP test helpers ($this->get(), postJson(), …) becomes one step:
 * who called, the action, the params, the status, the response, and a snapshot of the named models' rows right
 * after it. Rows are read without global scopes, so soft-deleted rows stay visible. Steps are grouped by test, so
 * a test name is the step's provenance. The trace shape is in ../tracekit.py.
 *
 * Run it with the project's own vendor/, from the directory that holds its phpunit.xml, on an export of the change
 * (git archive), never on a reviewer's checkout. autoload.php only makes this class loadable; the project's
 * phpunit.xml and bootstrap stay as they are:
 *
 *     composer install --no-interaction
 *     TOVISUAL_OUT=/abs/trace.json TOVISUAL_MODELS='App\Models\Item,App\Models\User' \
 *     php -d auto_prepend_file=<to-visual>/scripts/recorders/laravel/autoload.php \
 *         vendor/bin/phpunit --extension 'ToVisual\Laravel\Recorder' [tests/Feature/SomeTest.php] [--filter …]
 *
 * TOVISUAL_SECRETS adds comma-separated keys to shorten.
 */

namespace ToVisual\Laravel;

use Illuminate\Container\Container;
use Illuminate\Contracts\Http\Kernel as HttpKernel;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Http\Events\RequestHandled;
use Illuminate\Support\Carbon;
use PHPUnit\Event\Code\Test;
use PHPUnit\Event\Test\Errored;
use PHPUnit\Event\Test\ErroredSubscriber;
use PHPUnit\Event\Test\Failed;
use PHPUnit\Event\Test\FailedSubscriber;
use PHPUnit\Event\Test\Prepared;
use PHPUnit\Event\Test\PreparedSubscriber;
use PHPUnit\Event\TestRunner\Finished;
use PHPUnit\Event\TestRunner\FinishedSubscriber;
use PHPUnit\Framework\TestCase;
use PHPUnit\Runner\Extension\Extension;
use PHPUnit\Runner\Extension\Facade;
use PHPUnit\Runner\Extension\ParameterCollection;
use PHPUnit\TextUI\Configuration\Configuration;
use stdClass;
use Stringable;
use WeakMap;

final class Recorder implements Extension
{
    public function bootstrap(Configuration $configuration, Facade $facade, ParameterCollection $parameters): void
    {
        $out = getenv('TOVISUAL_OUT');
        $models = array_values(array_filter(explode(',', (string) getenv('TOVISUAL_MODELS'))));
        foreach ($models as $model) {
            if (! class_exists($model)) {
                fwrite(STDERR, "to-visual: model class {$model} not found (TOVISUAL_MODELS)\n");
                exit(2);
            }
        }
        if (! $out || ! $models) {
            fwrite(STDERR, "to-visual: set TOVISUAL_OUT and TOVISUAL_MODELS\n");
            exit(2);
        }
        $labels = method_exists($configuration, 'cliArguments') ? $configuration->cliArguments() : [];
        if ($configuration->hasFilter()) {
            $labels[] = $configuration->filter();
        }
        $trace = new Trace($out, $models, $labels, (string) getenv('TOVISUAL_SECRETS'));

        $facade->registerSubscribers(
            new class($trace) implements PreparedSubscriber {
                public function __construct(private Trace $trace) {}

                public function notify(Prepared $event): void
                {
                    $this->trace->begin($event->test());
                }
            },
            new class($trace) implements FailedSubscriber {
                public function __construct(private Trace $trace) {}

                public function notify(Failed $event): void
                {
                    $this->trace->failures++;
                }
            },
            new class($trace) implements ErroredSubscriber {
                public function __construct(private Trace $trace) {}

                public function notify(Errored $event): void
                {
                    $this->trace->failures++;
                }
            },
            new class($trace) implements FinishedSubscriber {
                public function __construct(private Trace $trace) {}

                public function notify(Finished $event): void
                {
                    $this->trace->write();
                }
            },
        );
    }
}

final class Trace
{
    private const DATETIME = '/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/';

    public int $failures = 0;

    private array $secrets;

    private array $tests = [];

    private string $test = 'unattributed';

    private WeakMap $seen;

    private string $timezone;

    public function __construct(private string $out, private array $models, private array $labels, string $extra)
    {
        $contract = json_decode(file_get_contents(__DIR__.'/../contract.json'), true);
        $this->secrets = array_flip([...$contract['secret_keys'], ...array_filter(explode(',', $extra))]);
        $this->seen = new WeakMap;
        $this->timezone = date_default_timezone_get(); // Laravel switches it to the app's timezone once booted
    }

    /** After setUp: name the test and hook the app it just created. */
    public function begin(Test $test): void
    {
        $this->test = self::name($test);
        $app = Container::getInstance();
        if (! $app instanceof Application) {
            return;
        }
        // Both hooks, recorded once per request: Event::fake() hides the event, withoutMiddleware() the middleware.
        $app->make(HttpKernel::class)->prependMiddleware(function ($request, $next) {
            $response = $next($request);
            $this->record($request, $response);

            return $response;
        });
        $app['events']->listen(RequestHandled::class, fn (RequestHandled $event) => $this->record($event->request, $event->response));
    }

    private static function name(Test $test): string
    {
        if (! $test->isTestMethod()) {
            return $test->name();
        }
        $class = substr(strrchr('\\'.$test->className(), '\\'), 1);
        if (str_starts_with($test->methodName(), '__pest_evaluable_')) {
            return $class.' › '.$test->testDox()->prettifiedMethodName();
        }
        $data = $test->testData()->hasDataFromDataProvider() ? '['.$test->testData()->dataFromDataProvider()->dataSetName().']' : '';

        return $class.'.'.$test->methodName().$data;
    }

    public function record($request, $response): void
    {
        if (isset($this->seen[$request])) {
            return;
        }
        $this->seen[$request] = true;
        [$method, $path] = self::sent($request);
        $body = json_decode((string) $response->getContent());
        $input = $request->all();
        $auth = $request->headers->get('Authorization');
        $step = [
            'caller' => ['client' => 1, 'auth' => $auth ? explode(' ', $auth, 2)[0] : 'none'],
            'method' => $method,
            'path' => $path,
            'params' => $input === [] ? null : $this->clean($input),
            'status' => $response->getStatusCode(),
            'response' => is_array($body) || $body instanceof stdClass ? $this->clean($body) : null,
            'state' => $this->snapshot(),
        ];
        $location = $response->headers->get('Location') ?? ($body instanceof stdClass && is_string($body->location ?? null) ? $body->location : null);
        if ($location) {
            $step['redirect'] = $this->redirect($location);
        }
        $this->tests[$this->test][] = $step;
    }

    /** The method and path as the test wrote them: Laravel trims a trailing slash before the request exists. */
    private static function sent($request): array
    {
        foreach (debug_backtrace(DEBUG_BACKTRACE_PROVIDE_OBJECT) as $frame) {
            if (($frame['function'] ?? '') === 'call' && ($frame['object'] ?? null) instanceof TestCase && isset($frame['args'][1])) {
                $path = parse_url((string) $frame['args'][1], PHP_URL_PATH) ?: '/';

                return [strtoupper($frame['args'][0]), str_starts_with($path, '/') ? $path : '/'.$path];
            }
        }

        return [$request->getMethod(), $request->getPathInfo()];
    }

    private function snapshot(): stdClass
    {
        $now = Carbon::now();
        $state = new stdClass;
        foreach ($this->models as $class) {
            $model = new $class;
            $rows = $model->newQueryWithoutScopes()->toBase()->orderBy($model->getKeyName())->get();
            $state->{class_basename($class)} = $rows->map(fn ($row) => $this->row((array) $row, $now))->all();
        }

        return $state;
    }

    private function row(array $attributes, Carbon $now): stdClass
    {
        $row = new stdClass;
        foreach ($attributes as $key => $value) {
            $row->$key = match (true) {
                $value === null => null,
                isset($this->secrets[$key]) => self::short($value),
                is_string($value) && preg_match(self::DATETIME, $value) === 1 => self::relative(Carbon::parse($value), $now),
                default => $value,
            };
        }

        return $row;
    }

    private function clean(mixed $value): mixed
    {
        if (is_array($value) && array_is_list($value)) {
            return array_map(fn ($v) => $this->clean($v), $value);
        }
        if (is_array($value) || $value instanceof stdClass) {
            $out = new stdClass;
            foreach ($value as $key => $v) {
                $out->$key = isset($this->secrets[$key]) && $v !== null && $v !== '' ? self::short($v) : $this->clean($v);
            }

            return $out;
        }
        if (is_scalar($value) || $value === null) {
            return $value;
        }

        return $value instanceof Stringable ? (string) $value : get_debug_type($value);
    }

    private function redirect(string $location): array
    {
        $parts = parse_url($location);
        $to = isset($parts['scheme']) ? $parts['scheme'].'://' : '';
        $to .= ($parts['host'] ?? '').(isset($parts['port']) ? ':'.$parts['port'] : '').($parts['path'] ?? '');
        parse_str($parts['query'] ?? '', $query);

        return ['to' => $to, 'query' => $this->clean((object) array_filter($query, fn ($v) => $v !== ''))];
    }

    private static function short(mixed $value): string
    {
        $s = is_scalar($value) ? (string) $value : json_encode($value);

        return mb_strlen($s) <= 8 ? $s : mb_substr($s, 0, 6).'…';
    }

    private static function relative(Carbon $value, Carbon $now): string
    {
        return sprintf('%+.0fs', (float) $value->format('U.u') - (float) $now->format('U.u'));
    }

    public function write(): void
    {
        $trace = [
            'meta' => ['stack' => 'laravel', 'models' => $this->models, 'labels' => $this->labels,
                'recorded_at' => (new \DateTimeImmutable('now', new \DateTimeZone($this->timezone)))->format('Y-m-d\TH:i:s'), 'failures' => $this->failures],
            'tests' => (object) $this->tests,
        ];
        $flags = JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE;
        file_put_contents($this->out, json_encode($trace, $flags)."\n");
        $steps = array_sum(array_map('count', $this->tests));
        fwrite(STDERR, sprintf("recorded %d steps across %d tests -> %s\n", $steps, count($this->tests), $this->out));
    }
}
