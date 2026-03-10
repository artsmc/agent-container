import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@iexcel/auth-client',
    '@iexcel/api-client',
    '@iexcel/shared-types',
  ],
  sassOptions: {
    implementation: 'sass-embedded',
    additionalData: `@use '${path.resolve(__dirname, '../../packages/ui-tokens/index.scss')}' as tokens;`,
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
}

export default nextConfig
