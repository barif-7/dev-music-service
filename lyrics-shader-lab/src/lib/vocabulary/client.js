import { hostSurface } from '@/lib/base44/hostSurface';
import { vocabularyRequest } from '../../../../static/gallery/vocabulary-api.mjs';

export const directVocabulary = vocabularyRequest;
export const embeddedVocabulary = (operation, payload = {}) =>
  hostSurface.request('vocabulary', { operation, payload }, { timeout: 110000 });

export function captureWord(word, line, track, sourceLanguage, targetLanguage) {
  return {
    word,
    source_language: sourceLanguage && sourceLanguage !== 'auto' ? sourceLanguage : 'en',
    definition_language: targetLanguage || (sourceLanguage && sourceLanguage !== 'auto' ? sourceLanguage : 'en'),
    context: line?.text || '',
    source_title: track?.title || '',
    source_artist: track?.artist || '',
    source_url: track?.webpage_url || '',
    source_time: Number.isFinite(line?.time) ? line.time : null,
  };
}
