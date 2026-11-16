import { PORTRAIT_HTML } from './portraitHtml';
import { SPENCER_DATA_URI } from './spencerFont';

/**
 * The portrait page re-skinned for Ditto's frontpage without touching the generated bundle: a transparent page, the
 * house glass's navy for the overlays and the bottom tabs, white at 80% and 50% for secondary type, pink for the warm
 * accent, Spencer (embedded) for the serif and the Arial UI stack.
 * The orbit canvas still paints its own night gradient; on web the portrait screen-blends onto the photograph so that
 * near-black drops out (Portrait.tsx).
 */
const DITTO_CSS =
  `@font-face{font-family:Spencer;src:url(${SPENCER_DATA_URI}) format('truetype');font-weight:400;font-style:normal}` +
  ':root{--bg:#081721;--bg-2:rgba(1,30,44,.9);--ink:#ffffff;--muted:rgba(255,255,255,.8);--faint:rgba(255,255,255,.5);--line:rgba(255,255,255,.1);' +
  '--amber:#f748b1;--rose:#f748b1;--serif:Spencer,Georgia,serif;--sans:Arial,"Helvetica Neue",Helvetica,"Liberation Sans",sans-serif}' +
  'html,body,#root,.rivers,.atlas{background:transparent!important}' +
  '.peek{background:linear-gradient(120deg,color-mix(in srgb,var(--c) 16%,rgba(1,30,44,.92)),rgba(1,30,44,.92))!important}' +
  '.tabs{background:linear-gradient(to top,rgba(1,30,44,.92) 55%,rgba(1,30,44,.6))!important;border-top-color:rgba(255,255,255,.1)!important}' +
  '.legend-toggle,.legend{background:rgba(1,30,44,.55)!important}';

export const DITTO_PORTRAIT_HTML = PORTRAIT_HTML.replace('</head>', `<style>${DITTO_CSS}</style></head>`).replace('content="#0b0810"', 'content="#081721"');
