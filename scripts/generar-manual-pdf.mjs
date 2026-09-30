// Genera el PDF del manual de usuario a partir de src/manual-contenido.js.
//
//   node scripts/generar-manual-pdf.mjs
//
// Deja el resultado en server/manual/manual-de-usuario.pdf (lo entrega
// GET /api/manual/pdf a quien tenga la sesión iniciada). Usa Playwright, que
// ya es dependencia de desarrollo del proyecto; si el navegador no está
// instalado ejecutá una vez:  npx playwright install chromium
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { chromium } from 'playwright'

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const { manual, MANUAL_VERSION } = await import(pathToFileURL(path.join(raiz, 'src', 'manual-contenido.js')).href)

// El rol super_admin es interno y no se nombra en el PDF: los capítulos que
// son solo para ese rol quedan afuera (se ven únicamente en el panel).
const capitulos = manual.capitulos.filter(c => c.para.some(rol => rol !== 'super_admin'))
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

// Las capturas se incrustan en el PDF (no quedan como archivos sueltos).
const captura = src => `data:image/png;base64,${fs.readFileSync(path.join(raiz, 'src', 'manual-capturas', src)).toString('base64')}`

const bloque = b => {
  switch (b.t) {
    case 'p': return `<p>${inline(b.x)}</p>`
    case 'h': return `<h3>${esc(b.x)}</h3>`
    case 'ul': return `<ul>${b.x.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`
    case 'ol': return `<ol>${b.x.map(i => `<li>${inline(i)}</li>`).join('')}</ol>`
    case 'nota': return `<aside class="nota"><b>Consejo</b>${inline(b.x)}</aside>`
    case 'aviso': return `<aside class="aviso"><b>Importante</b>${inline(b.x)}</aside>`
    case 'tabla': return `<table><thead><tr>${b.cab.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.filas.map(f => `<tr>${f.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    case 'img': return `<figure><img src="${captura(b.src)}" alt=""><figcaption>${esc(b.pie)}</figcaption></figure>`
    default: return ''
  }
}

const etiquetaPara = para => !para.includes('empleado') ? 'Administradores'
  : para.includes('admin') ? 'Todos los usuarios' : 'Solo empleados'

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(manual.titulo)} — ${esc(manual.marca)}</title>
<style>
  @page { size: A4; margin: 20mm 18mm 22mm; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #26221f; font-size: 10.5pt; line-height: 1.55; margin: 0; }
  .portada { height: 250mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; border-left: 8px solid #b06a3b; padding-left: 14mm; }
  .portada .marca { font-size: 13pt; letter-spacing: .28em; text-transform: uppercase; color: #b06a3b; margin: 0 0 10mm; }
  .portada h1 { font-size: 38pt; line-height: 1.1; margin: 0 0 6mm; }
  .portada p { font-size: 13pt; color: #5a514a; margin: 0 0 3mm; }
  .portada .version { margin-top: 20mm; font-size: 10pt; color: #8a7f76; }
  .indice { page-break-after: always; }
  .indice h2 { font-size: 20pt; margin: 0 0 8mm; }
  .indice ol { padding-left: 8mm; margin: 0; }
  .indice li { margin: 0 0 3.2mm; font-size: 11pt; }
  .indice small { color: #8a7f76; }
  .capitulo { page-break-before: always; }
  .capitulo:first-of-type { page-break-before: auto; }
  .capitulo h2 { font-size: 19pt; margin: 0 0 2mm; padding-bottom: 3mm; border-bottom: 2px solid #b06a3b; }
  .capitulo .para { margin: 0 0 6mm; font-size: 9pt; color: #8a7f76; text-transform: uppercase; letter-spacing: .06em; }
  h3 { font-size: 12.5pt; margin: 6mm 0 2mm; break-after: avoid; }
  p { margin: 0 0 3mm; }
  ul, ol { margin: 1mm 0 4mm; padding-left: 7mm; }
  li { margin: 0 0 1.8mm; }
  li, tr, aside, figure { break-inside: avoid; }
  figure { margin: 4mm 0 5mm; text-align: center; }
  figure img { max-width: 100%; max-height: 120mm; border: 1px solid #cfc6bd; }
  figcaption { margin-top: 1.5mm; font-size: 8.5pt; color: #8a7f76; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; font-size: 9.6pt; }
  th, td { border: 1px solid #cfc6bd; padding: 2.2mm 2.6mm; text-align: left; vertical-align: top; }
  th { background: #efe8e1; }
  aside { margin: 4mm 0; padding: 3mm 4mm; border-left: 3px solid; border-radius: 2px; }
  aside b { display: block; font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 1mm; }
  .nota { border-color: #4f8f6a; background: #eaf3ed; }
  .aviso { border-color: #c0872b; background: #fbf1de; }
</style></head><body>
<section class="portada">
  <p class="marca">${esc(manual.marca)}</p>
  <h1>${esc(manual.titulo)}</h1>
  <p>${esc(manual.subtitulo)}</p>
  <p class="version">Versión ${esc(MANUAL_VERSION)}</p>
</section>
<section class="indice"><h2>Contenido</h2><ol>${capitulos.map(c => `<li>${esc(c.titulo)} <small>· ${esc(etiquetaPara(c.para))}</small></li>`).join('')}</ol>
<p style="margin-top:10mm;color:#5a514a">Este manual describe todo el sistema. Cada capítulo indica para quién es: algunas secciones no aparecen según el tipo de cuenta con la que ingreses.</p></section>
${capitulos.map((c, i) => `<section class="capitulo"><h2>${i + 1}. ${esc(c.titulo)}</h2><p class="para">${esc(etiquetaPara(c.para))}</p>${c.bloques.map(bloque).join('')}</section>`).join('\n')}
</body></html>`

const salida = path.join(raiz, 'server', 'manual')
fs.mkdirSync(salida, { recursive: true })
fs.writeFileSync(path.join(salida, 'manual-de-usuario.html'), html)

const navegador = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const pagina = await navegador.newPage()
await pagina.setContent(html, { waitUntil: 'load' })
await pagina.pdf({
  path: path.join(salida, 'manual-de-usuario.pdf'),
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `<div style="width:100%;font-size:8px;color:#8a7f76;padding:0 18mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>${esc(manual.marca)} · ${esc(manual.titulo)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  margin: { top: '20mm', bottom: '22mm', left: '18mm', right: '18mm' }
})
await navegador.close()
fs.unlinkSync(path.join(salida, 'manual-de-usuario.html'))
console.log('PDF generado en server/manual/manual-de-usuario.pdf')
