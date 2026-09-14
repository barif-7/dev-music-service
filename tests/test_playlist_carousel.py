from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def test_playlist_carousel_assets_are_wired_before_the_service(client):
    page = client.get("/")
    playlist = client.get("/static/gallery/playlist.js")

    assert page.status_code == playlist.status_code == 200
    assert 'id="playlistCarousel"' in page.text
    assert 'id="nbQueue"' in page.text
    assert '/static/css/playlist.css' in page.text
    assert page.text.index('/static/gallery/playlist.js') < page.text.index('/static/gallery/service.js')
    assert "class PlaylistSet" in playlist.text
    assert "class PlaylistAdvanceRule" in playlist.text
    assert "class PlaylistCarousel" in playlist.text


def test_playlist_feeds_search_results_and_advances_before_looping():
    search = (ROOT / "static/gallery/search.js").read_text()
    service = (ROOT / "static/gallery/service.js").read_text()

    assert "phasePlaylist.replace(results" in search
    assert service.index("new PlaylistAdvanceRule") < service.index("new LoopTrackRule")
    assert "playPlaylistOffset" in service
    assert "playlistMode" in service
