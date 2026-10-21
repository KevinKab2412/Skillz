<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Each test is one operational principle of the trash concept (Jackson, ch. 4). */
class TrashTest extends TestCase
{
    use RefreshDatabase;

    private function create(string $name, int $size): int
    {
        return $this->postJson('/items/', ['name' => $name, 'size' => $size])->json('id');
    }

    public function test_deleted_item_can_be_restored(): void
    {
        $report = $this->create('report.pdf', 120);
        $this->postJson("/items/{$report}/delete/")->assertStatus(200);
        $this->assertSame([], $this->getJson('/items/')->json('items'));
        $this->postJson("/items/{$report}/restore/")->assertStatus(200);
        $this->assertSame(['report.pdf'], $this->getJson('/items/')->json('items'));
    }

    public function test_emptying_the_trash_removes_items_for_good(): void
    {
        $draft = $this->create('draft.txt', 10);
        $this->create('notes.txt', 20);
        $this->postJson("/items/{$draft}/delete/");
        $this->assertSame(1, $this->postJson('/trash/empty/')->json('removed'));
        $this->postJson("/items/{$draft}/restore/")->assertStatus(404);
        $this->assertSame(['notes.txt'], $this->getJson('/items/')->json('items'));
    }

    public function test_deleting_does_not_free_space_until_the_trash_is_emptied(): void
    {
        $movie = $this->create('movie.mov', 4000);
        $this->postJson("/items/{$movie}/delete/");
        $this->assertSame(4000, $this->getJson('/usage/')->json('used'));
        $this->postJson('/trash/empty/');
        $this->assertSame(0, $this->getJson('/usage/')->json('used'));
    }
}
