import type { NextConfig } from 'next';
const config: NextConfig = { serverExternalPackages: ['@prisma/client','pdfjs-dist'], devIndicators: false, outputFileTracingIncludes: { '/*': ['./comfyui/workflows/*.json'] } };
export default config;
