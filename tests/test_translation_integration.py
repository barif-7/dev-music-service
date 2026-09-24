"""Exercise the live translation paths against a real, temporary SQLite file."""

import json
import subprocess
import sys
from unittest.mock import Mock

import pytest

from models import LyricsLine, LyricsResponse
from services.lyrics_localization_service import LyricsLocalizationService
from services.lyrics_service import LyricsService
from services.translation_cache import reset_translation_cache_for_tests


def restart_cache():
    """Discard both process caches and the connection, leaving only the file."""
    LyricsService._localized_cache.clear()
    LyricsService._localized_expiry.clear()
    reset_translation_cache_for_tests()


@pytest.fixture
def localizer(monkeypatch):
    def translate(segments, locale, song_context=None):
        return [dict(segment, localized_text=f"{segment['text']}-{locale}") for segment in segments]

    call = Mock(side_effect=translate)
    monkeypatch.setattr(LyricsLocalizationService, "_call_localizer", call)
    monkeypatch.setenv("LYRICS_LOCALIZE_BACKGROUND_FILL", "false")
    return call


def window(items, locale="es", **kwargs):
    return LyricsService.localize_window("Title", "Artist", None, 120, locale, items, **kwargs)


def test_window_reuses_persisted_lines_after_restart(localizer, tmp_path):
    assert window([(0, "hello"), (1, "world")]) == {0: "hello-es", 1: "world-es"}
    assert (tmp_path / "translation-cache.sqlite3").is_file()
    restart_cache()

    # An overlapping window hits SQLite for index 1 and translates only index 2.
    assert window([(1, "world"), (2, "again")]) == {1: "world-es", 2: "again-es"}
    assert localizer.call_count == 2
    assert localizer.call_args.args[0] == [
        {"index": 2, "text": "again", "start_ms": 8000, "end_ms": 12000},
    ]


def test_fresh_process_reads_persisted_translation_without_localizer(localizer):
    window([(4, "hello")])
    script = """
import json
from services.lyrics_service import LyricsService
from services.lyrics_localization_service import LyricsLocalizationService
def unavailable(*args, **kwargs):
    raise AssertionError('A persisted hit must not contact the localizer')
LyricsLocalizationService._call_localizer = unavailable
print(json.dumps(LyricsService.localize_window('Title', 'Artist', None, 120, 'es', [(4, 'hello')])))
"""
    result = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, check=True)
    assert json.loads(result.stdout) == {"4": "hello-es"}


@pytest.mark.parametrize("field,value", [
    ("title", "Other title"), ("artist", "Other artist"), ("album", "Other album"), ("duration", 240),
])
def test_tracks_do_not_share_translations(localizer, field, value):
    window([(0, "hello")])
    restart_cache()
    kwargs = dict(title="Title", artist="Artist", album=None, duration=120, locale="es", items=[(0, "hello")])
    kwargs[field] = value
    LyricsService.localize_window(**kwargs)
    assert localizer.call_count == 2


@pytest.mark.parametrize("restart", [False, True])
def test_changed_source_invalidates_only_that_line(localizer, restart):
    window([(0, "hello"), (1, "world")])
    if restart:
        restart_cache()
    assert window([(0, "changed"), (1, "world")]) == {0: "changed-es", 1: "world-es"}
    assert [s["index"] for s in localizer.call_args.args[0]] == [0]
    assert localizer.call_count == 2


@pytest.mark.parametrize("restart", [False, True])
@pytest.mark.parametrize("change", [
    "locale", "timing", "section", "bpm", "mood", "singability", "repetition", "source_locale", "localizer",
])
def test_changed_translation_inputs_do_not_reuse_cache(localizer, monkeypatch, change, restart):
    items = [(2, "hello", 100, 900)]
    window(items)
    if restart:
        restart_cache()
    kwargs = {}
    if change == "locale":
        kwargs["locale"] = "fr"
    elif change == "timing":
        items = [(2, "hello", 100, 1900)]
    elif change == "section":
        kwargs["section"] = "chorus"
    elif change == "bpm":
        kwargs["bpm"] = 90
    elif change == "mood":
        kwargs["mood"] = ["happy"]
    elif change == "singability":
        kwargs["preserve_singability"] = False
    elif change == "repetition":
        kwargs["preserve_repetition"] = False
    elif change == "source_locale":
        monkeypatch.setenv("LYRICS_SOURCE_LOCALE", "en")
    else:
        monkeypatch.setenv("CAPTION_LOCALIZER_URL", "http://127.0.0.1:9998")
    window(items, **kwargs)
    assert localizer.call_count == 2


@pytest.mark.parametrize("timed", [False, True])
def test_eager_background_and_windows_share_durable_entries(localizer, monkeypatch, timed):
    lines = [
        LyricsLine(text=text, start_time_ms=index * 6000 if timed else None,
                   end_time_ms=(index + 1) * 6000 if timed else None)
        for index, text in enumerate(["one", "two", "three"])
    ]
    response = LyricsResponse(title="Title", artist="Artist", duration=120, lines=lines)
    monkeypatch.setattr(LyricsService, "get_lyrics", Mock(return_value=response))
    monkeypatch.setenv("LYRICS_LOCALIZE_WINDOW", "1")
    monkeypatch.setenv("LYRICS_LOCALIZE_BACKGROUND_FILL", "true")

    # Run the real background body synchronously to avoid racing test teardown.
    class InlineThread:
        def __init__(self, target, args, daemon):
            self.target, self.args = target, args

        def start(self):
            self.target(*self.args)

    monkeypatch.setattr("services.lyrics_service.threading.Thread", InlineThread)
    eager = LyricsService.get_localized_lyrics("Title", "Artist", None, 120, "es")
    assert eager.lines[0].localized_text == "one-es"
    assert localizer.call_count == 3
    assert not LyricsService._localized_inflight
    restart_cache()

    # Request only a later window, then the eager response, with the same entries.
    items = [(i, line.text, line.start_time_ms, line.end_time_ms) for i, line in enumerate(lines)]
    assert window(items[1:]) == {1: "two-es", 2: "three-es"}
    eager = LyricsService.get_localized_lyrics("Title", "Artist", None, 120, "es")
    assert [line.localized_text for line in eager.lines] == ["one-es", "two-es", "three-es"]
    assert localizer.call_count == 3


def test_window_entries_are_available_to_eager_path(localizer, monkeypatch):
    window([(0, "hello")])
    restart_cache()
    response = LyricsResponse(title="Title", artist="Artist", lines=[LyricsLine(text="hello")])
    monkeypatch.setattr(LyricsService, "get_lyrics", Mock(return_value=response))
    eager = LyricsService.get_localized_lyrics("Title", "Artist", None, 120, "es")
    assert eager.lines[0].localized_text == "hello-es"
    assert localizer.call_count == 1


@pytest.mark.parametrize("failure", ["unwritable", "corrupt"])
def test_cache_initialization_failure_keeps_translation_working(localizer, tmp_path, monkeypatch, failure):
    if failure == "unwritable":
        data_dir = tmp_path / "a-file"
        data_dir.write_text("not a directory")
        monkeypatch.setenv("DMS_DATA_DIR", str(data_dir))
    else:
        (tmp_path / "translation-cache.sqlite3").write_bytes(b"not a SQLite database")
    assert window([(0, "hello")]) == {0: "hello-es"}
    assert window([(0, "hello")]) == {0: "hello-es"}
    assert localizer.call_count == 1


def test_failed_and_partial_localization_retries_missing_lines(localizer):
    localizer.side_effect = [
        TimeoutError("localizer unavailable"),
        [{"index": 0, "localized_text": "hola"}],
        [{"index": 1, "localized_text": "mundo"}],
    ]
    items = [(0, "hello"), (1, "world")]
    assert window(items) == {}
    assert window(items) == {0: "hola"}
    restart_cache()
    assert window(items) == {0: "hola", 1: "mundo"}
    assert [s["index"] for s in localizer.call_args.args[0]] == [1]


def test_foreground_duplicates_and_unrequested_output_do_not_pollute_cache(localizer):
    localizer.side_effect = [
        [{"index": 9, "localized_text": "unexpected"}],
        [{"index": 0, "localized_text": "hola"}],
    ]
    assert window([(0, "hello"), (0, "ignored duplicate")]) == {}
    assert len(localizer.call_args.args[0]) == 1
    assert window([(0, "hello")]) == {0: "hola"}
