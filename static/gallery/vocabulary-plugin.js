/* One host adapter shared by the lyrics reader and launcher plugin. */
window.VocabularyPlugin = (() => {
  let client;
  return {
    async request(payload) {
      client ||= import('/static/gallery/vocabulary-api.mjs');
      return (await client).vocabularyRequest(payload?.operation || 'save', payload?.payload || payload);
    },
    open() { return window.AppsLauncher?.open('vocabulary'); },
  };
})();
