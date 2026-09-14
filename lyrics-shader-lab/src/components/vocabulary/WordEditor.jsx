import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Volume2, X } from 'lucide-react';

export function SpeakWord({ word, language }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const update = () => setAvailable(window.speechSynthesis.getVoices().some(voice =>
      voice.localService && voice.lang.toLowerCase().split('-')[0] === language?.split('-')[0]));
    update();
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, [language]);
  const speak = () => {
    const voice = window.speechSynthesis.getVoices().find(item =>
      item.localService && item.lang.toLowerCase().split('-')[0] === language?.split('-')[0]);
    if (!voice) return;
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };
  return <button className="vocab-button quiet" type="button" onClick={speak} disabled={!available}
    title={available ? 'Hear this word' : 'No installed voice for this language'}><Volume2 size={16} /> Hear word</button>;
}

export default function WordEditor({ initial, request, onSaved, onClose, autoLookup = false }) {
  const [draft, setDraft] = useState({ word: '', source_language: 'en', definition_language: 'en',
    meaning: '', translation: '', example: '', personal_sentence: '', context: '', collocations: [], ...initial });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const form = useRef(null);
  const set = (key, value) => {
    generation.current++;
    setDraft(current => ({ ...current, [key]: value, ...(key === 'meaning' ? { provenance: 'manual' } : {}) }));
  };
  async function lookup() {
    const sequence = ++generation.current;
    setBusy('lookup'); setError(''); setNotice('');
    try {
      const result = await request('lookup', draft);
      if (sequence !== generation.current) return;
      if (result.state === 'available') {
        const { state: _state, cached: _cached, ...definition } = result;
        setDraft(current => ({ ...current, ...definition }));
        setNotice('Suggested by your local model. Check the meaning and edit it before saving.');
      } else setNotice(result.reason || 'Add a meaning yourself to start reviewing.');
    } catch (err) { if (sequence === generation.current) setError(err.message); }
    finally { setBusy(''); }
  }
  useEffect(() => {
    const previous = document.activeElement;
    form.current?.querySelector('input')?.focus();
    if (autoLookup && initial?.word) lookup();
    return () => { generation.current++; previous?.focus?.(); };
    // A captured word is frozen when the dialog opens, even as playback continues.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function save(event) {
    event.preventDefault(); setBusy('save'); setError('');
    try {
      const result = await request(draft.id ? 'edit' : 'save', draft);
      onSaved?.(result.word || result);
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  function keydown(event) {
    if (event.key === 'Escape' && !busy) onClose();
    if (event.key !== 'Tab') return;
    const nodes = Array.from(form.current.querySelectorAll('button:not(:disabled), input, textarea, select'));
    if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
    if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
  }
  return <div className="vocab-modal" role="dialog" aria-modal="true" aria-labelledby="word-editor-title" onKeyDown={keydown}>
    <form className="vocab-editor" ref={form} onSubmit={save}>
      <header><div><p className="vocab-eyebrow">Your vocabulary</p><h2 id="word-editor-title">{draft.id ? 'Make it yours' : 'Save a word'}</h2></div>
        <button type="button" className="vocab-icon" onClick={onClose} disabled={busy === 'save'} aria-label="Close word editor"><X size={20} /></button></header>
      <label>Word or phrase<input required maxLength={120} value={draft.word} onChange={e => set('word', e.target.value)} /></label>
      <div className="vocab-pair">
        <label>Word language<input required maxLength={35} value={draft.source_language} onChange={e => set('source_language', e.target.value)} placeholder="en, fr, ur…" /></label>
        <label>Explain in<input required maxLength={35} value={draft.definition_language} onChange={e => set('definition_language', e.target.value)} placeholder="en" /></label>
      </div>
      {draft.context && <blockquote>{draft.context}<cite>{[draft.source_title, draft.source_artist].filter(Boolean).join(' · ')}</cite></blockquote>}
      <div className="vocab-actions"><button type="button" className="vocab-button" onClick={lookup} disabled={!!busy || !draft.word.trim()}>
        {busy === 'lookup' && <LoaderCircle size={16} className="animate-spin" />} {busy === 'lookup' ? 'Looking up…' : 'Suggest a meaning'}</button>
        <SpeakWord word={draft.word} language={draft.source_language} /></div>
      {notice && <p className="vocab-note" role="status">{notice}</p>}
      <label>Meaning<textarea rows={2} maxLength={3000} value={draft.meaning} onChange={e => set('meaning', e.target.value)} placeholder="What does it mean here? You can add this later." /></label>
      {draft.source_language !== draft.definition_language && <label>Translation<input maxLength={500} value={draft.translation} onChange={e => set('translation', e.target.value)} /></label>}
      <label>Example sentence<textarea rows={2} maxLength={2000} value={draft.example} onChange={e => set('example', e.target.value)} /></label>
      <label>Your own sentence<textarea rows={2} maxLength={2000} value={draft.personal_sentence} onChange={e => set('personal_sentence', e.target.value)} placeholder="Connect it to something in your life." /></label>
      {!initial?.context && <label>Where you found it<textarea rows={2} maxLength={3000} value={draft.context} onChange={e => set('context', e.target.value)} placeholder="Paste a sentence from reading or conversation." /></label>}
      {draft.collocations?.length > 0 && <p className="vocab-note">Common phrases: {draft.collocations.join(' · ')}</p>}
      {draft.register_label && <p className="vocab-note">Usage: {draft.register_label}</p>}
      {error && <p className="vocab-error" role="alert">{error}</p>}
      <footer><p className="vocab-note">{draft.meaning || draft.translation ? 'Ready for recall practice.' : 'Saved words without a meaning wait in your inbox.'}</p>
        <button type="submit" className="vocab-button primary" disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save word'}</button></footer>
    </form>
  </div>;
}
