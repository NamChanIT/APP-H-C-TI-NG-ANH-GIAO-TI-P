import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

export default function config(phase) {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
    poweredByHeader: false,
    experimental: { cpus: 2 }
  };
}
