import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * The intake photo step promises that an oversized photo comes back as
       * copy on step 2 ("Photo is too large — try again"), and `setPhoto`
       * enforces a 1 MiB ceiling to make that true.
       *
       * Next's own default Server Action body limit is also 1 MB, and it is
       * applied to the RAW multipart body before the action runs — boundaries,
       * part headers and the `room` field included. So with the default, a
       * photo at or near the ceiling is refused by the framework with a 413 and
       * the participant gets an error page instead of the step: the use case's
       * `too-large` branch could never fire through the form.
       *
       * Raising the framework limit puts the ceiling back where the product
       * decision lives (`src/lib/use-cases/set-photo.ts`). 4mb leaves room for
       * a phone that cannot re-encode on device — the client downscale is a
       * courtesy, not a control — while still refusing a body big enough to be
       * an attack. Anything between 1 MiB and 4 MB reaches `setPhoto` and is
       * rejected there, as copy, on step 2.
       *
       * (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`
       * documents both the default and the multipart overhead.)
       */
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
