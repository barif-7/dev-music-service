import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Download, Plus, RefreshCw } from 'lucide-react';
import WordEditor, { SpeakWord } from './WordEditor';
import './vocabulary.css';

const date = value => new Date(value * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const promptFor = card => {
  const meaning = card.word.meaning || card.word.translation;
  const escaped = card.word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return meaning.replace(new RegExp(escaped, 'gi'), '_____');
};

export default function VocabularyWorkspace({ request, onClose }) {
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('view') === 'library' ? 'library' : 'today');
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState(null);
  const [words, setWords] = useState([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState(null);
  const [queue, setQueue] = useState(null);
  const [reviewMode, setReviewMode] = useState('production');
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [completed, setCompleted] = useState(0);
  const [sentence, setSentence] = useState('');
  const [usageKind, setUsageKind] = useState('conversation');
  const [version, setVersion] = useState(0);
  const pendingEvent = useRef(null);
  const current = queue?.[0];
  const refresh = useCallback(async () => {
    setOverview(await request('overview'));
    setVersion(value => value + 1);
  }, [request]);

  useEffect(() => {
    if (!window.BroadcastChannel) return;
    const channel = new BroadcastChannel('phase-vocabulary');
    channel.onmessage = () => refresh().catch(err => setError(err.message));
    return () => channel.close();
  }, [refresh]);

  const initialize = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await request('init');
      setOverview(result.overview);
      setNotice(result.migration?.warning || (result.migration?.imported ? `Imported ${result.migration.imported} saved words.` : ''));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => { initialize(); }, [initialize]);

  useEffect(() => {
    if (tab !== 'library') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await request('list', { q: query, status, limit: 30, offset });
        if (!cancelled) { setWords(result.words); setTotal(result.total); setError(''); }
      } catch (err) { if (!cancelled) setError(err.message); }
      finally { if (!cancelled) setLoading(false); }
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tab, query, status, offset, version, request]);

  async function run(action) {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  function switchTab(next) { setTab(next); setDetail(null); setError(''); }
  function startReview() {
    run(async () => {
      const result = await request('due', { mode: reviewMode, limit: 10 });
      setQueue(result.cards); setCompleted(0); setRevealed(false); setAnswer('');
      pendingEvent.current = null;
    });
  }
  function rate(rating) {
    run(async () => {
      const payload = { word_id: current.word_id, mode: current.mode, rating, revision: current.revision };
      const signature = JSON.stringify(payload);
      if (pendingEvent.current?.signature !== signature) pendingEvent.current = { signature, id: crypto.randomUUID() };
      await request('review', { ...payload, event_id: pendingEvent.current.id });
      pendingEvent.current = null;
      setQueue(items => items.slice(1)); setCompleted(value => value + 1); setRevealed(false); setAnswer('');
      await refresh();
    });
  }
  function openWord(word) {
    run(async () => { setDetail(await request('get', { id: word.id })); setSentence(''); });
  }
  function archive() {
    run(async () => {
      await request('edit', { ...detail, archived: !detail.archived });
      setDetail(null); await refresh();
    });
  }
  function logUsage(event) {
    event.preventDefault();
    run(async () => {
      const payload = { word_id: detail.id, sentence, kind: usageKind };
      const signature = JSON.stringify(payload);
      if (pendingEvent.current?.signature !== signature) pendingEvent.current = { signature, id: crypto.randomUUID() };
      await request('usage', { ...payload, event_id: pendingEvent.current.id });
      pendingEvent.current = null;
      setSentence(''); setDetail(await request('get', { id: detail.id })); await refresh();
      setNotice('Usage saved.');
    });
  }
  function exportWords() {
    run(async () => {
      const data = await request('export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'phase-vocabulary.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  return <main className="vocabulary-app">
    <div className="vocab-shell">
      <header className="vocab-header"><div><p className="vocab-eyebrow">Lyric Shader Lab / Learn</p><h1>Words to live with<span>.</span></h1>
        <p className="vocab-subtitle">A little recall. A real conversation. A word that stays.</p></div>
        {onClose && <button className="vocab-button quiet" onClick={onClose}><ArrowLeft size={16} /> Lyrics</button>}</header>
      <nav className="vocab-nav" aria-label="Vocabulary sections">
        <div>{['today', 'library'].map(value => <button key={value} aria-current={tab === value ? 'page' : undefined}
          onClick={() => switchTab(value)}>{value === 'today' ? 'Today' : 'Word library'}</button>)}</div>
        <button className="vocab-button primary" onClick={() => setEditor({})}><Plus size={16} /> Add word</button>
      </nav>
      {error && <div className="vocab-error" role="alert">{error} <button className="vocab-button quiet" disabled={busy} onClick={() => {
        if (tab === 'library') setVersion(value => value + 1);
        else { setQueue(null); initialize(); }
      }}><RefreshCw size={14} /> Retry</button></div>}
      {notice && <p className="vocab-note" role="status">{notice}</p>}
      {loading && <p className="vocab-note" role="status">Opening your words…</p>}
      {tab === 'today' && <>
        <section className="vocab-stats" aria-label="Today's progress">
          <div><strong>{overview?.due?.[reviewMode] ?? '—'}</strong><span>ready to recall</span></div>
          <div><strong>{overview?.reviewed_today ?? '—'}</strong><span>reviews today</span></div>
          <div><strong>{overview?.used_today ?? '—'}</strong><span>words used today</span></div>
        </section>
        {queue === null ? <section className="vocab-feature">
          <div className="vocab-orbit" aria-hidden="true"><BookOpen size={42} strokeWidth={1} /></div>
          <p className="vocab-eyebrow">Your daily practice</p><h2>Find the word.<br />Then make it yours.</h2>
          <p>Try up to ten prompts. Say or type your answer before revealing it, then rate how easily you remembered.</p>
          <label className="vocab-mode">Practice direction<select value={reviewMode} onChange={e => setReviewMode(e.target.value)}>
            <option value="production">Meaning → recall the word</option><option value="recognition">Word → recall the meaning</option></select></label>
          <button className="vocab-button primary" onClick={startReview} disabled={busy || !overview}>Start recall <ArrowRight size={16} /></button>
          {!!overview?.needs_meaning && <button className="vocab-text-button" onClick={() => {
            setStatus('inbox'); switchTab('library');
          }}>{overview.needs_meaning} saved words still need a meaning</button>}
        </section> : current ? <section className="vocab-review" aria-label="Recall practice">
          <div className="vocab-review-top"><p className="vocab-eyebrow">{current.mode === 'production' ? 'Which word fits this meaning?' : 'What does this word mean?'}</p><span>{completed} done · {queue.length} left</span></div>
          <h2>{current.mode === 'production' ? promptFor(current) : current.word.word}</h2>
          {!revealed ? <>
            <label>Your answer<textarea autoFocus rows={2} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Say it aloud, or type it here…" /></label>
            <button className="vocab-button primary" onClick={() => setRevealed(true)}>Reveal answer</button>
          </> : <div className="vocab-reveal">
            {answer && <p className="vocab-note">Your answer: {answer}</p>}
            <h3>{current.word.word}</h3><p>{current.word.meaning || current.word.translation}</p>
            {current.word.personal_sentence || current.word.example ? <blockquote>{current.word.personal_sentence || current.word.example}</blockquote> : null}
            <SpeakWord word={current.word.word} language={current.word.source_language} />
            <p className="vocab-note">How easily did you recall it? Rate your recall before seeing the answer.</p>
            <div className="vocab-ratings">
              <button disabled={busy} onClick={() => rate('forgot')}>Forgot<span>10 minutes</span></button>
              <button disabled={busy} onClick={() => rate('difficult')}>Difficult<span>1 day</span></button>
              <button disabled={busy} onClick={() => rate('easy')}>Easy<span>{[1, 3, 7, 14, 30, 60, 120][Math.min(current.step, 6)]} days</span></button>
            </div>
          </div>}
          <button className="vocab-text-button" onClick={() => setQueue(null)} disabled={busy}>Finish for now</button>
        </section> : <section className="vocab-feature">
          <p className="vocab-eyebrow">A little progress, kept</p><h2>{completed ? `${plural(completed, 'review')} complete.` : 'You’re caught up.'}</h2>
          <p>Pick a word from your library. Use it in a conversation, or practice a sentence aloud and log how you used it.</p>
          <button className="vocab-button primary" onClick={() => switchTab('library')}>Choose a word <ArrowRight size={16} /></button>
          <button className="vocab-text-button" onClick={() => setQueue(null)}>Back to today</button>
        </section>}
        <p className="vocab-footnote">Start with three new words a day. Your two recall directions progress independently.</p>
      </>}
      {tab === 'library' && !detail && <>
        <div className="vocab-filters"><label className="vocab-search">Find a word<input type="search" value={query} onChange={e => { setQuery(e.target.value); setOffset(0); }} placeholder="Search words, meanings, or sources" /></label>
          <label>Show<select value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}><option value="active">Active words</option><option value="inbox">Needs a meaning</option><option value="archived">Archived</option></select></label>
          <button className="vocab-button quiet" disabled={busy} onClick={exportWords}><Download size={16} /> Export</button></div>
        <div className="vocab-word-list">{words.map(word => <button className="vocab-word-row" key={word.id} onClick={() => openWord(word)} disabled={busy}>
          <div><h3>{word.word}</h3><p>{word.meaning || word.translation || 'Add a meaning to start reviewing'}</p>
            <span>{word.source_language.toUpperCase()}{word.source_title ? ` · ${word.source_title}` : ''}</span></div><ArrowRight size={18} /></button>)}</div>
        {!loading && !words.length && <section className="vocab-empty"><BookOpen size={32} /><h2>{query ? 'No matching words yet.' : 'Your next word starts here.'}</h2>
          <p>Save a word from a lyric, a book, or a conversation.</p><button className="vocab-button primary" onClick={() => setEditor({})}>Add your first word</button></section>}
        <div className="vocab-pagination"><span>{plural(total, 'word')}</span><button className="vocab-button quiet" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 30))}>Previous</button>
          <button className="vocab-button quiet" disabled={offset + 30 >= total} onClick={() => setOffset(value => value + 30)}>Next</button></div>
      </>}
      {tab === 'library' && detail && <section className="vocab-detail">
        <button className="vocab-text-button" onClick={() => setDetail(null)}>← All words</button>
        <p className="vocab-eyebrow">{detail.source_language} · saved {date(detail.created_at)}</p>
        <h2>{detail.word}</h2><p className="vocab-definition">{detail.meaning || detail.translation || 'This word is waiting for a meaning.'}</p>
        <SpeakWord word={detail.word} language={detail.source_language} />
        {detail.personal_sentence && <blockquote>{detail.personal_sentence}<cite>Your sentence</cite></blockquote>}
        {detail.example && <blockquote>{detail.example}<cite>Example{detail.provenance === 'local-model' ? ' · local model suggestion' : ''}</cite></blockquote>}
        {detail.collocations?.length > 0 && <p>{detail.collocations.join(' · ')}</p>}
        <div className="vocab-actions"><button className="vocab-button" onClick={() => setEditor(detail)}>Edit word</button><button className="vocab-button quiet" onClick={archive} disabled={busy}>{detail.archived ? 'Restore word' : 'Archive word'}</button></div>
        <div className="vocab-schedules">{detail.cards?.map(card => <p key={card.mode}>{card.mode === 'production' ? 'Recall the word' : 'Recall the meaning'}<span>{plural(card.review_count, 'review')} · {detail.needs_meaning ? 'Needs meaning' : `next ${date(card.due_at)}`}</span></p>)}</div>
        <form className="vocab-usage" onSubmit={logUsage}><h3>Put it into your day</h3><p>Speak a sentence aloud, or record where you used this word. These are your own usage notes.</p>
          <label>Your sentence<textarea required rows={2} maxLength={3000} value={sentence} onChange={e => setSentence(e.target.value)} placeholder={`How did you use “${detail.word}”?`} /></label>
          <div className="vocab-actions"><label>Used in<select value={usageKind} onChange={e => setUsageKind(e.target.value)}><option value="conversation">A conversation</option><option value="writing">My writing</option><option value="practice">Speaking practice</option></select></label>
            <button className="vocab-button primary" disabled={busy || !sentence.trim()} type="submit">Log use</button></div></form>
        {detail.usages?.map(use => <blockquote key={use.id}>{use.sentence}<cite>{use.kind} · {date(use.created_at)}</cite></blockquote>)}
        {!!detail.encounters?.length && <div className="vocab-sources"><h3>Where it found you</h3>{detail.encounters.map((source, index) => <blockquote key={index}>{source.context}<cite>{[source.source_title, source.source_artist].filter(Boolean).join(' · ') || 'Saved context'}</cite></blockquote>)}</div>}
      </section>}
      <footer className="vocab-footer"><span>Saved on this Mac</span><span>{plural(overview?.active || 0, 'word')} growing with you</span></footer>
    </div>
    {editor && <WordEditor initial={editor} request={request} onClose={() => setEditor(null)} onSaved={async word => {
      setEditor(null); setNotice(`“${word.word}” saved.`);
      if (detail?.id === word.id) setDetail(await request('get', { id: word.id }));
      refresh().catch(err => setError(err.message));
    }} />}
  </main>;
}
