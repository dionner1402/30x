import type { NextConfig } from 'next';
import path from 'node:path';

const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';

/**
 * Producción: https://dgartech.com/30x-EzAllow
 * Local: deja NEXT_PUBLIC_BASE_PATH vacío.
 * Nota: forzar string (no spread condicional) para que Next lo aplique en `next start`.
 */
const rawBase = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');
// Default vacío en local; en build de dgartech el script exporta NEXT_PUBLIC_BASE_PATH.
const basePath = rawBase;

console.log('[next.config] NEXT_PUBLIC_BASE_PATH=', JSON.stringify(basePath || '(none)'));

const nextConfig: NextConfig = {
  ...(basePath
    ? { basePath, assetPrefix: basePath }
    : {}),
  transpilePackages: ['@ezallow/shared'],
  outputFileTracingRoot: path.join(__dirname, '../..'),
  async rewrites() {
    // Con basePath, Next antepone el prefijo al `source` automáticamente.
    return [
      {
        source: '/backend/health',
        destination: `${apiOrigin}/health`,
      },
      {
        source: '/backend/v1/:path*',
        destination: `${apiOrigin}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
