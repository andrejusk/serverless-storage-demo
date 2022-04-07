// https://chakra-ui.com/guides/getting-started/remix-guide
import createCache from "@emotion/cache";

export default function createEmotionCache() {
  return createCache({ key: "css" });
}
