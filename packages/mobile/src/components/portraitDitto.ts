import { PORTRAIT_HTML } from './portraitHtml';

/**
 * The portrait page re-skinned for Ditto without touching the generated bundle: a transparent page, Ditto navy for the
 * overlays and the bottom tabs, white and Ditto greys for type, Ditto pink for the warm accent, and the Arial UI stack.
 * The orbit canvas still paints its own night gradient; on web the portrait screen-blends onto the photograph so that
 * near-black drops out (Portrait.tsx).
 */
const DITTO_CSS =
  ':root{--bg:#081721;--bg-2:#0e2433;--ink:#ffffff;--muted:#bcc9d3;--faint:#8e989f;--line:rgba(255,255,255,.12);' +
  '--amber:#ff7bcb;--rose:#ff2cab;--sans:Arial,"Helvetica Neue",Helvetica,"Liberation Sans",sans-serif}' +
  'html,body,#root,.rivers,.atlas{background:transparent!important}' +
  '.peek{background:linear-gradient(120deg,color-mix(in srgb,var(--c) 16%,rgba(8,23,33,.92)),rgba(8,23,33,.92))!important}' +
  '.tabs{background:linear-gradient(to top,rgba(8,23,33,.92) 55%,rgba(8,23,33,.6))!important;border-top-color:rgba(255,255,255,.1)!important}' +
  '.legend-toggle,.legend{background:rgba(8,23,33,.55)!important}';

export const DITTO_PORTRAIT_HTML = PORTRAIT_HTML.replace('</head>', `<style>${DITTO_CSS}</style></head>`).replace('content="#0b0810"', 'content="#081721"');
