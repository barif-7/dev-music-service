from __future__ import annotations

import re
import unicodedata

from rapidfuzz import fuzz

# Strip release qualifiers / version tags that don't affect identity.
# Order matters: parenthetical/bracket forms first, then trailing dash variants.
_PARENS_NOISE = re.compile(
    r"""\s*[\(\[]\s*
        (?:
            remaster(?:ed)?(?:[^)\]]*)? |
            feat(?:uring|\.|\s)[^)\]]* |
            ft\.?\s[^)\]]* |
            with\s[^)\]]* |
            deluxe(?:[^)\]]*)? |
            expanded(?:[^)\]]*)? |
            anniversary(?:[^)\]]*)? |
            edit(?:ion)?(?:[^)\]]*)? |
            mono(?:[^)\]]*)? |
            stereo(?:[^)\]]*)? |
            live(?:[^)\]]*)? |
            acoustic(?:[^)\]]*)? |
            instrumental(?:[^)\]]*)? |
            radio\s*edit(?:[^)\]]*)? |
            single\s*version(?:[^)\]]*)? |
            album\s*version(?:[^)\]]*)? |
            bonus(?:[^)\]]*)? |
            \d{4}\s*(?:remaster|version|mix)[^)\]]* |
            from\s+["'][^)\]]+
        )
        \s*[\)\]]
    """,
    re.IGNORECASE | re.VERBOSE,
)

_TRAILING_DASH_NOISE = re.compile(
    r"""\s*[-–—]\s*
        (?:
            remaster(?:ed)?(?:.*)? |
            \d{4}\s*(?:remaster|version|mix).* |
            single$ |
            ep$ |
            live(?:\s.*)?$ |
            acoustic(?:\s.*)?$ |
            radio\s*edit(?:\s.*)?$ |
            single\s*version(?:\s.*)?$ |
            album\s*version(?:\s.*)?$ |
            mono(?:\s.*)?$ |
            stereo(?:\s.*)?$
        )\s*$
    """,
    re.IGNORECASE | re.VERBOSE,
)

_NON_WORD = re.compile(r"[^\w\s]", re.UNICODE)
_WHITESPACE = re.compile(r"\s+")


def normalize(value: str | None) -> str:
    """Normalize a title or artist for matching: strip accents, version tags,
    punctuation, and collapse whitespace. Returns lowercased string."""
    if not value:
        return ""

    # Decompose accents → ASCII
    stripped = unicodedata.normalize("NFKD", value)
    stripped = "".join(c for c in stripped if not unicodedata.combining(c))

    # Strip parenthetical/bracket version tags
    stripped = _PARENS_NOISE.sub("", stripped)
    # Strip trailing " - Remastered ..." style suffixes
    stripped = _TRAILING_DASH_NOISE.sub("", stripped)
    # Collapse remaining punctuation to spaces
    stripped = _NON_WORD.sub(" ", stripped)
    stripped = _WHITESPACE.sub(" ", stripped).strip().lower()
    return stripped


def fuzzy_score(query: str | None, candidate: str | None) -> float:
    """Return a 0-100 fuzzy match score between two strings after normalization.
    Uses rapidfuzz WRatio which handles partial / token-order variants well."""
    q = normalize(query)
    c = normalize(candidate)
    if not q or not c:
        return 0.0
    return float(fuzz.WRatio(q, c))


def combined_score(query: str, title: str | None, artist: str | None) -> float:
    """Match score for an "artist title" query against (title, artist) fields.
    Tries both a combined "artist title" candidate and individual fields,
    keeps the best per-side score, weighted toward title."""
    q = normalize(query)
    if not q:
        return 0.0

    title_score = fuzzy_score(q, title) if title else 0.0
    artist_score = fuzzy_score(q, artist) if artist else 0.0

    combined = f"{artist} {title}".strip() if artist and title else (title or artist or "")
    combined_match = fuzzy_score(q, combined) if combined else 0.0

    # Weighted blend: title carries more identity than artist.
    return max(combined_match, 0.65 * title_score + 0.35 * artist_score)
