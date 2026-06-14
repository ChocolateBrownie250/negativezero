"""Shared SQLite FTS5 helpers.

The MATCH operator parses its right-hand side as an FTS5 query, so raw user
input containing FTS5 syntax characters (`"`, `*`, `(`, `:`, `+`, ...) would
either change the query semantics or raise a syntax error that surfaces as a
500. `build_fts_query` turns arbitrary input into a syntactically valid query
that searches for every typed token.
"""


def build_fts_query(q: str) -> str:
    """Convert raw user input into an FTS5 MATCH query.

    Each whitespace-separated token is wrapped as an FTS5 phrase (`"..."`)
    and internal double quotes are doubled per FTS5 escape rules. Tokens
    are joined with the implicit AND. This way arbitrary user input —
    including stray `"`, `*`, `(`, `:`, or `+` — becomes a syntactically
    valid query that searches for every typed token. Returns "" if the
    input has no non-whitespace characters; callers should treat that as
    "no search filter".
    """
    tokens = q.split()
    if not tokens:
        return ""
    return " ".join('"' + tok.replace('"', '""') + '"' for tok in tokens)
