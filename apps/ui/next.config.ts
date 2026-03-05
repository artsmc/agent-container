import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  sassOptions: {
    implementation: 'sass-embedded',
    additionalData: `@use '${path.resolve(__dirname, '../../packages/ui-tokens/index.scss')}' as tokens;`,
  },
}

export default nextConfig
