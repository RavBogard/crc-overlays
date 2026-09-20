# Makes `tests` an importable package so `unittest discover` can find every test_*.py file
# rather than each one having to be named in package.json. Wave 1 of the 2026-09-19 audit found
# two test files that had never run once because they sat outside a hardcoded glob; naming
# modules by hand is how that happens, so `npm run test:py` discovers them instead.
