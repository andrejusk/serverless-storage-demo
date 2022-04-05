import { useState } from 'react'
import { CacheProvider } from '@emotion/react'
import { hydrate } from "react-dom";
import { RemixBrowser } from "@remix-run/react";

import { ClientStyleContext } from './context'
import createEmotionCache from './createEmotionCache';

function ClientCacheProvider({ children }) {
  const [cache, setCache] = useState(createEmotionCache());

  function reset() {
    setCache(createEmotionCache());
  }

  return (
    <ClientStyleContext.Provider value={{ reset }}>
      <CacheProvider value={cache}>{children}</CacheProvider>
    </ClientStyleContext.Provider>
  );
}
hydrate(
  <ClientCacheProvider>
    <RemixBrowser />
  </ClientCacheProvider>,
  document
);
