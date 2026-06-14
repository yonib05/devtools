# ratelimiter SDK conventions

These conventions are enforced in review. New public surface MUST follow them.

## API design
- Public classes/functions live in `ratelimiter/__init__.py` exports; nothing under a private
  `_internal` path may be re-exported.
- Use LLM-native / domain-native units in public APIs. Time is expressed in **seconds** as
  `float`; never milliseconds in a public signature.
- Extensible callback interfaces MUST be expressed as a `typing.Protocol`, never a bare
  `Callable`, so the signature can grow without breaking callers.
- Breaking changes to an existing public signature require a `BREAKING:` note in the PR body.

## Typing & style
- Use PEP 585/604 builtins generics (`list[x]`, `x | None`); do NOT use `typing.List`,
  `typing.Optional`, `typing.Union`.
- Structured logging only: `logger.debug("field=<%s> | message", value)` — fields first,
  `<>`-wrapped, `%s` lazy args (never f-strings in logging calls).

## Testing
- Every public behavior change ships with a test that asserts the whole returned object,
  not field-by-field.
