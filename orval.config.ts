import { defineConfig } from 'orval';

export default defineConfig({
  eamata: {
    input: {
      target:
      'https://petstore3.swagger.io/api/v3/openapi.json',
        // 'https://em-be.dev.api.eu.eamata.com/api/master/api-docs',
      override: {
        transformer: './orval-transformer.cjs',
      },
    },
    output: {
      target: './src/sdk',
      client: 'react-query',
      httpClient: 'axios',
      mode: 'tags-split',
    //   prettier: true,
      override: {
        mutator: {
          path: './src/api/axios-instance.ts',
          name: 'customAxios',
        },
      },
    },
  },
});