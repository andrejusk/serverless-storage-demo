import React from "react";
import type { AppProps } from "next/app";

import { ChakraProvider } from "@chakra-ui/react";

/**
 * Next.js App override
 * https://nextjs.org/docs/advanced-features/custom-app
 */
export const App: React.FC<AppProps> = ({ Component, pageProps }) => {
  return (
    <React.StrictMode>
      <ChakraProvider>
        <Component {...pageProps} />
      </ChakraProvider>
    </React.StrictMode>
  );
};

export default App;
