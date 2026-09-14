import { useHostScene } from '@/lib/base44/useHostSurface';
import { directVocabulary, embeddedVocabulary } from '@/lib/vocabulary/client';
import VocabularyWorkspace from '@/components/vocabulary/VocabularyWorkspace';

function EmbeddedVocabulary() {
  const scene = useHostScene();
  if (!scene) return <main className="vocabulary-app" aria-busy="true" />;
  return <VocabularyWorkspace request={embeddedVocabulary} />;
}

export default function VocabularySurface() {
  const embedded = window.parent !== window && new URLSearchParams(window.location.search).get('standalone') !== '1';
  return embedded ? <EmbeddedVocabulary /> : <VocabularyWorkspace request={directVocabulary} />;
}
