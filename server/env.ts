import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
  server: {
    NODE_ENV: z.string().min(1),
    // Optional on purpose: the demo has no secrets to configure. Without a key
    // the AI analyst answers from a canned response instead of calling the API.
    ANTHROPIC_API_KEY: z.string().optional(),
  },
  runtimeEnv: process.env,
})
