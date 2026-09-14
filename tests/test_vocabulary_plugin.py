import json
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from plugins.vocabulary.app import create_app
from plugins.vocabulary.config import VocabularySettings
from plugins.vocabulary.lookup import LocalLookup
from plugins.vocabulary.models import LookupInput, ReviewInput, UsageInput, WordEdit, WordInput
from plugins.vocabulary.store import StoreError, VocabularyStore


@pytest.fixture
def library(tmp_path):
    clock = [1_789_200_000.0]
    store = VocabularyStore(tmp_path / 'words.sqlite3', clock=lambda: clock[0])
    return store, clock


def word(**kwargs):
    return WordInput(word='tentative', meaning='Not yet definite', **kwargs)


def test_save_survives_restart_and_recapture_preserves_schedules(library):
    store, clock = library
    saved = store.save(word(context='Our plans are tentative.'))['word']
    card = store.due()['cards'][0]
    review = ReviewInput(event_id=uuid4(), word_id=saved['id'], mode='production', rating='easy', revision=0)
    store.review(review)
    store.save(word(context='A tentative agreement was reached.'))
    reopened = VocabularyStore(store.path, clock=lambda: clock[0])
    assert reopened.words()['total'] == 1
    assert len(reopened.get(saved['id'])['encounters']) == 2
    assert reopened.due()['cards'] == []
    assert len(reopened.due('recognition')['cards']) == 1
    assert card['word']['context'] == 'Our plans are tentative.'


def test_review_is_idempotent_and_rejects_stale_tabs(library):
    store, clock = library
    saved = store.save(word())['word']
    review = ReviewInput(event_id=uuid4(), word_id=saved['id'], mode='production', rating='easy', revision=0)
    first = store.review(review)
    assert store.review(review) == first
    assert first['due_at'] == clock[0] + 86400
    with pytest.raises(StoreError):
        store.review(review.model_copy(update={'event_id': uuid4()}))
    with pytest.raises(StoreError):
        store.review(review.model_copy(update={'rating': 'forgot'}))
    clock[0] += 86401
    second = store.review(review.model_copy(update={'event_id': uuid4(), 'revision': 1}))
    assert second['due_at'] == clock[0] + 3 * 86400
    assert store.overview()['due']['recognition'] == 1


def test_parallel_review_only_advances_once(library):
    store, _ = library
    saved = store.save(word())['word']
    entry = ReviewInput(event_id=uuid4(), word_id=saved['id'], mode='recognition', rating='forgot', revision=0)
    with ThreadPoolExecutor(max_workers=2) as workers:
        results = list(workers.map(lambda _: store.review(entry), range(2)))
    assert results[0] == results[1]
    assert results[0]['review_count'] == 1


def test_missing_meaning_and_archived_words_are_retained_outside_reviews(library):
    store, _ = library
    saved = store.save(WordInput(word='new word'))['word']
    assert store.due()['cards'] == []
    store.edit(saved['id'], WordEdit(word='new word', meaning='Newly encountered vocabulary', revision=0))
    assert len(store.due()['cards']) == 1
    store.edit(saved['id'], WordEdit(word='new word', meaning='Newly encountered vocabulary', revision=1, archived=True))
    assert store.words(status='archived')['total'] == 1
    assert store.due()['cards'] == []
    store.edit(saved['id'], WordEdit(word='new word', meaning='Newly encountered vocabulary', revision=2))
    assert len(store.due()['cards']) == 1


def test_import_has_no_old_browser_caps_and_is_repeatable(library):
    store, _ = library
    entries = [WordInput(word=f'word {i}', meaning=f'Meaning {i}', provenance='legacy') for i in range(230)]
    assert store.import_entries(entries)['imported'] == 230
    assert store.import_entries(entries)['existing'] == 230
    assert store.words()['total'] == 230
    assert len(store.export()['tables']['words']) == 230


def test_usage_is_self_reported_and_practice_does_not_inflate_real_use(library):
    store, _ = library
    saved = store.save(word())['word']
    event = UsageInput(event_id=uuid4(), word_id=saved['id'], sentence='Our plans are tentative.', kind='practice')
    assert store.usage(event) == store.usage(event)
    assert store.overview()['used_today'] == 0
    store.usage(event.model_copy(update={'event_id': uuid4(), 'kind': 'conversation'}))
    assert store.overview()['used_today'] == 1


def test_api_validation_and_cross_origin_writes(library):
    store, _ = library
    with TestClient(create_app(store=store)) as client:
        assert client.get('/health').json()['storage'] == 'sqlite'
        assert client.post('/v1/words', json={'word': '  '}).status_code == 422
        assert client.post('/v1/words', json={'word': 'tentative'}, headers={'Origin': 'https://external.test'}).status_code == 403
        assert client.get('/v1/due?mode=unknown').status_code == 422
        assert client.get('/v1/words/anything').status_code == 422
        assert client.post('/v1/words', json=word().model_dump()).status_code == 200


@pytest.mark.asyncio
async def test_local_lookup_same_language_is_cached_by_context(library):
    store, _ = library
    calls = []

    def respond(request):
        calls.append(request)
        return httpx.Response(200, json={'response': '{"meaning":"Not yet definite","example":"Our plans are tentative."}'})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        lookup = LocalLookup(VocabularySettings(), store, client)
        entry = LookupInput(word='tentative')
        assert (await lookup.lookup(entry))['state'] == 'available'
        assert (await lookup.lookup(entry))['cached'] is True
        await lookup.lookup(entry.model_copy(update={'context': 'a tentative voice'}))
    assert len(calls) == 2
    assert all(r.url.host == '127.0.0.1' for r in calls)


@pytest.mark.asyncio
async def test_lookup_asks_ollama_for_a_schema_it_can_build_a_grammar_from(library):
    # A length bound in `format` expands into that many GBNF repetition rules and
    # kills the model runner, so the request carries none -- see lookup._grammar_safe.
    store, _ = library
    sent = []

    def respond(request):
        sent.append(json.loads(request.content))
        return httpx.Response(200, json={'response': '{"meaning":"Not yet definite"}'})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        lookup = LocalLookup(VocabularySettings(), store, client)
        assert (await lookup.lookup(LookupInput(word='tentative')))['state'] == 'available'

    def keys(node):
        if isinstance(node, dict):
            return set(node) | {key for value in node.values() for key in keys(value)}
        if isinstance(node, list):
            return {key for item in node for key in keys(item)}
        return set()
    assert not keys(sent[0]['format']) & {'maxLength', 'minLength', 'maxItems', 'minItems'}
    assert sent[0]['format']['required'] == ['meaning']
    assert sent[0]['format']['properties']['collocations']['type'] == 'array'


@pytest.mark.asyncio
async def test_lookup_still_enforces_the_bounds_the_grammar_dropped(library):
    store, _ = library

    def overlong(request):
        return httpx.Response(200, json={'response': json.dumps({'meaning': 'x' * 3001})})
    async with httpx.AsyncClient(transport=httpx.MockTransport(overlong)) as client:
        lookup = LocalLookup(VocabularySettings(), store, client)
        assert (await lookup.lookup(LookupInput(word='tentative')))['state'] == 'unavailable'


@pytest.mark.asyncio
async def test_local_lookup_outage_leaves_manual_capture_working(library):
    store, _ = library

    def fail(request):
        raise httpx.ConnectError('offline')
    async with httpx.AsyncClient(transport=httpx.MockTransport(fail)) as client:
        lookup = LocalLookup(VocabularySettings(), store, client)
        assert (await lookup.lookup(LookupInput(word='tentative')))['state'] == 'unavailable'
    assert store.save(word())['created']


def test_local_inference_rejects_cloud_endpoint():
    with pytest.raises(ValueError):
        VocabularySettings(ollama_url='https://api.example.com')
