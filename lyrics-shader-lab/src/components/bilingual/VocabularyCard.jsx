import WordEditor from '@/components/vocabulary/WordEditor';
import '@/components/vocabulary/vocabulary.css';

export default function VocabularyCard({ capture, request, onSave, onClose }) {
  return <WordEditor initial={capture} request={request} onSaved={onSave} onClose={onClose} autoLookup />;
}
