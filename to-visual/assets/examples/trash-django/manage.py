#!/usr/bin/env python3
"""A tiny Django app with a trash concept: the to-visual recorder's public example."""
import os
import sys

if __name__ == "__main__":
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "trashdemo.settings")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)
