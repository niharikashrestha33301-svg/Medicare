(() => {
  const scriptUrl = document.currentScript.src;
  const imageBase = new URL('images/', scriptUrl);
  const fallback = new URL('doctor-placeholder.svg', imageBase).href;
  const prepare = image => {
    if (!(image instanceof HTMLImageElement)) return;
    const source = image.getAttribute('src');
    if (source?.startsWith('/images/')) {
      const resolved = new URL(source.slice('/images/'.length), imageBase).href;
      if (image.src !== resolved) image.src = resolved;
    }
  };
  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const previous = image.src;
    prepare(image);
    if (image.src !== previous) return;
    if (image.src !== fallback) image.src = fallback;
  }, true);
  const observe = () => {
    document.querySelectorAll('img').forEach(prepare);
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') prepare(record.target);
        for (const node of record.addedNodes) {
          prepare(node);
          node.querySelectorAll?.('img').forEach(prepare);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  };
  observe();
})();
