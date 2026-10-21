<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/** A file. Deleting moves it to the trash (trashed_at is set); emptying removes it for good. */
class Item extends Model
{
    use SoftDeletes;

    const DELETED_AT = 'trashed_at';

    public $timestamps = false;

    protected $fillable = ['name', 'size'];
}
