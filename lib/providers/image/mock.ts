import {measure} from '@/lib/usage/capture';
import {selectedReferences} from './references';
import type { ImageGenerationProvider, ImageRequest } from './base';

const escape = (text: string) => text.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
const colour = (value: string | undefined, fallback: string) => value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;

/** An original, deterministic SVG layout. This is a design placeholder, not AI photography. */
export function renderMockAsset(r: ImageRequest): string {
  const w = r.width, h = r.height, unit = Math.min(w, h);
  const tall = r.kind === 'story', wide = r.kind === 'banner';
  const x = r.kind === 'hero' || wide ? w * .7 : w * .52;
  const bottleH = tall ? h * .41 : h * .62;
  const bottleW = bottleH * .35, y = tall ? h * .45 : h * .23;
  const primary = colour(r.brand.primary_colours[0], '#132936');
  const accent = colour(r.brand.primary_colours[2], '#d9bb8b');
  const brand = escape(r.brandName.toUpperCase());
  const coffee = /coffee|brew/i.test(r.brand.product + r.brandName);
  const subtitle = coffee ? 'COLD BREW' : 'SIGNATURE EDITION';
  const title = escape(r.direction.concept.slice(0, 42));
  const textX = w * .07, titleY = tall ? h * .18 : h * .45;
  const showTitle = ['hero', 'banner', 'story'].includes(r.kind);
  const tilt = r.version > 1 ? 0 : -4;
  const seed = [...JSON.stringify(r.prompt)].reduce((n, c) => (n + c.charCodeAt(0)) % 1000, 0) + r.version;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#090f15"/><stop offset=".58" stop-color="${primary}"/><stop offset="1" stop-color="#50616b"/></linearGradient>
    <radialGradient id="sun"><stop stop-color="${accent}" stop-opacity=".7"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <linearGradient id="glass"><stop stop-color="#111b20"/><stop offset=".23" stop-color="#354348"/><stop offset=".42" stop-color="#182b31"/><stop offset=".8" stop-color="#0a151c"/><stop offset="1" stop-color="#596365"/></linearGradient>
    <linearGradient id="label" x2="1" y2=".25"><stop stop-color="#c9d0cc"/><stop offset=".5" stop-color="#f1eee4"/><stop offset="1" stop-color="#9ca8a6"/></linearGradient>
    <linearGradient id="floor" x2="0" y2="1"><stop stop-color="#748084"/><stop offset="1" stop-color="#26353e"/></linearGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="3" seed="${seed}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".055"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter>
    <filter id="blur"><feGaussianBlur stdDeviation="${unit * .012}"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <ellipse cx="${w * .95}" cy="${h * .12}" rx="${w * .65}" ry="${h * .8}" fill="url(#sun)"/>
  <g opacity=".16" fill="#b9ccd0"><path d="M${w * .67} 0 H${w * .77} L${w * .27} ${h} H${w * .08}Z"/><path d="M${w * .88} 0 H${w * .91} L${w * .51} ${h} H${w * .43}Z"/></g>
  <path d="M0 ${h * .8} L${w} ${h * .7} V${h}H0Z" fill="url(#floor)"/>
  <ellipse cx="${x - bottleW * .6}" cy="${y + bottleH}" rx="${bottleW * 1.8}" ry="${bottleW * .25}" fill="#050c12" opacity=".65" filter="url(#blur)"/>
  <g transform="translate(${x - bottleW / 2} ${y}) rotate(${tilt} ${bottleW / 2} ${bottleH})">
    <path d="M${bottleW * .28} ${bottleH * .04} H${bottleW * .72} V${bottleH * .16} Q${bottleW} ${bottleH * .21} ${bottleW} ${bottleH * .3} V${bottleH * .94} Q${bottleW} ${bottleH} ${bottleW * .87} ${bottleH} H${bottleW * .13} Q0 ${bottleH} 0 ${bottleH * .94} V${bottleH * .3} Q0 ${bottleH * .21} ${bottleW * .28} ${bottleH * .16}Z" fill="url(#glass)" stroke="#849296" stroke-width="1.5"/>
    <rect x="${bottleW * .25}" y="0" width="${bottleW * .5}" height="${bottleH * .08}" rx="${unit * .008}" fill="#1a2226" stroke="#778081"/>
    <path d="M${bottleW * .31} ${bottleH * .01} V${bottleH * .06} M${bottleW * .4} ${bottleH * .01} V${bottleH * .06} M${bottleW * .5} ${bottleH * .01} V${bottleH * .06} M${bottleW * .6} ${bottleH * .01} V${bottleH * .06}" stroke="#687477" opacity=".5"/>
    <rect x="2" y="${bottleH * .38}" width="${bottleW - 4}" height="${bottleH * .4}" fill="url(#label)"/>
    <g fill="#172b34" text-anchor="middle" font-family="Arial, sans-serif">
      <path d="M${bottleW * .35} ${bottleH * .47} l${bottleW * .15} -${bottleH * .035} l${bottleW * .15} ${bottleH * .035}" fill="none" stroke="#172b34" stroke-width="2"/>
      <text x="${bottleW / 2}" y="${bottleH * .535}" font-size="${bottleW * Math.min(.105, 1.5 / r.brandName.length)}" letter-spacing="1.5">${brand}</text>
      <text x="${bottleW / 2}" y="${bottleH * .625}" font-size="${bottleW * .105}" letter-spacing="2">${subtitle}</text>
      <text x="${bottleW / 2}" y="${bottleH * .705}" font-size="${bottleW * .055}" letter-spacing="1.5">CRAFTED WITH INTENTION</text>
      <text x="${bottleW / 2}" y="${bottleH * .75}" font-size="${bottleW * .045}">250 ml · SMALL BATCH</text>
    </g>
    <path d="M${bottleW * .13} ${bottleH * .3} V${bottleH * .36} M${bottleW * .13} ${bottleH * .8} V${bottleH * .93}" stroke="#d3e6e7" stroke-width="${bottleW * .018}" opacity=".4"/>
  </g>
  <g font-family="Arial, sans-serif" fill="#f2efe6">
    <text x="${textX}" y="${h * .085}" font-size="${unit * .018}" letter-spacing="${unit * .004}">${brand}</text>
    ${showTitle ? `<text x="${textX}" y="${titleY}" font-family="Georgia, serif" font-size="${unit * (wide ? .09 : .071)}" letter-spacing="-1">${title}</text><text x="${textX}" y="${titleY + unit * .052}" font-size="${unit * .016}" letter-spacing="${unit * .002}">${coffee ? 'A SLOWER START. A STRONGER DAY.' : 'MADE FOR YOUR EVERYDAY.'}</text>` : ''}
    <text x="${textX}" y="${h * .94}" font-size="${unit * .014}" letter-spacing="${unit * .002}">${coffee ? 'SLOW BREWED. QUIETLY BOLD.' : 'THOUGHTFULLY CRAFTED.'}</text>
    <text x="${w * .93}" y="${h * .94}" text-anchor="end" font-size="${unit * .013}">0${r.version}</text>
  </g><rect width="${w}" height="${h}" fill="transparent" filter="url(#grain)"/>
  </svg>`;
}
export class MockImageProvider implements ImageGenerationProvider {
  readonly name = 'mock';
  async generate(request: ImageRequest) {
    return measure('mock','image','mock_generation',null,async()=>{
    if(selectedReferences(request).length)throw new Error('The mock image provider cannot apply product/style references. Select a reference-capable image provider; references will not be silently ignored.');
    return { imageUrl: `data:image/svg+xml;base64,${Buffer.from(renderMockAsset(request)).toString('base64')}`, provider: this.name };
    });
  }
}