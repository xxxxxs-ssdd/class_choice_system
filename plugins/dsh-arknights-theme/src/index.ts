import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Arknights-style terminal skin for the DSH Web GUI.
 *
 * The plugin contributes only index-HTML rows: two stylesheets (skin tokens and
 * boot-overlay styling), the boot overlay markup, its self-removing driver, and
 * the fixed HUD frame. It subscribes to `webserver/index-inject` rather than
 * patching the response afterwards, so every row travels the same escaping path
 * the shipped boot manifest uses.
 *
 * Overlay styling must stay in its own `style` row: a `<style>` nested inside an
 * injected HTML fragment is relocated by the parser and unwraps the overlay.
 */

export const name = 'arknights-theme'

/** The index customizer only exists in the Web assembly. */
export const inject = ['webServer']

interface IndexRowSink {
  push(row: unknown): void
}

/** The single event this plugin consumes; declared structurally to stay dependency-free. */
interface ThemeContext {
  on(event: 'webserver/index-inject', listener: (rows: IndexRowSink[]) => void): unknown
}

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * The index customizer splices body-phase rows after the first `<body` it finds
 * in the composed document. A row that itself contains that sequence becomes a
 * splice target and corrupts the page, so refuse to serve such assets.
 * @param asset - Injected CSS, markup, or script text.
 * @param label - Asset name reported in the failure.
 */
function assertNoDocumentTags(asset: string, label: string): string {
  const offending = ['<body', '<head', '<html'].find((needle) => asset.toLowerCase().includes(needle))
  if (offending !== undefined) {
    throw new Error(`${name}: ${label} contains "${offending}", which would capture the index body splice`)
  }
  return asset
}

const themeCss = assertNoDocumentTags(readFileSync(join(HERE, 'theme.css'), 'utf8'), 'theme.css')
const splashCss = assertNoDocumentTags(readFileSync(join(HERE, 'splash.css'), 'utf8'), 'splash.css')
const splashHtml = assertNoDocumentTags(readFileSync(join(HERE, 'splash.html'), 'utf8'), 'splash.html')
const splashScript = assertNoDocumentTags(readFileSync(join(HERE, 'splash.js'), 'utf8'), 'splash.js')

/**
 * Backdrop geometry: a masked technical grid, a hatch wedge, halftone, a
 * diagonal rule, and two outlined polygons. Everything is CSS or inline SVG so
 * the skin never fetches an image asset.
 */
const GEO_HTML = [
  '<div class="ak-geo" aria-hidden="true">',
  '<div class="ak-geo__vignette"></div>',
  '<div class="ak-geo__grid"></div>',
  '<div class="ak-geo__hatch"></div>',
  '<div class="ak-geo__dots"></div>',
  '<div class="ak-geo__rule"></div>',
  '<div class="ak-geo__mark ak-geo__mark--tr"><svg viewBox="0 0 600 600">',
  '<g class="ak-geo__stroke">',
  '<polygon points="300,40 525,170 525,430 300,560 75,430 75,170"></polygon>',
  '<polygon class="ak-geo__stroke--soft" points="300,120 455,210 455,390 300,480 145,390 145,210"></polygon>',
  '<path class="ak-geo__stroke--soft" d="M300 40V120M300 480V560M75 170L145 210M455 390L525 430M525 170L455 210M145 390L75 430"></path>',
  '<circle class="ak-geo__stroke--soft" cx="300" cy="300" r="150"></circle>',
  '</g>',
  '<g class="ak-geo__stroke ak-geo__spin">',
  '<path d="M300 210 L365 300 L300 390 L235 300 Z"></path>',
  '</g>',
  '</svg></div>',
  '<div class="ak-geo__mark ak-geo__mark--bl"><svg viewBox="0 0 600 600">',
  '<g class="ak-geo__stroke">',
  '<path d="M60 520 L300 120 L540 520"></path>',
  '<path class="ak-geo__stroke--soft" d="M150 520 L300 254 L450 520"></path>',
  '<path d="M20 520H580"></path>',
  '<path class="ak-geo__stroke--soft" d="M300 120V560M120 200H480"></path>',
  '</g>',
  '</svg></div>',
  '</div>',
].join('')

const HUD_HTML = [
  '<div class="ak-hud" aria-hidden="true">',
  '<span class="ak-hud__corner ak-hud__corner--tl"></span>',
  '<span class="ak-hud__corner ak-hud__corner--tr"></span>',
  '<span class="ak-hud__corner ak-hud__corner--bl"></span>',
  '<span class="ak-hud__corner ak-hud__corner--br"></span>',
  '<div class="ak-hud__tag">Class Choice Terminal <b>//</b> 选课与培养方案</div>',
  '</div>',
].join('')

/**
 * Register the skin, boot overlay, backdrop, and HUD rows on every index render.
 * @param ctx - Plugin context supplied by the loader.
 */
export function apply(ctx: ThemeContext): void {
  ctx.on('webserver/index-inject', (rows) => {
    rows.push({ kind: 'style', text: themeCss })
    rows.push({ kind: 'style', text: splashCss })
    rows.push({ kind: 'html', placement: 'body', html: GEO_HTML })
    rows.push({ kind: 'html', placement: 'body', html: splashHtml })
    rows.push({ kind: 'script', placement: 'body', text: splashScript })
    rows.push({ kind: 'html', placement: 'body', html: HUD_HTML })
  })
}
