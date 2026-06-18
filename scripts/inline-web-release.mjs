import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const targetDir = process.argv[2] ?? 'dist-portable'
const distDir = resolve(root, targetDir)
const indexPath = resolve(distDir, 'index.html')

const readDistAsset = (href) => {
  const normalizedHref = href.replace(/^\.\//, '')
  return readFileSync(resolve(distDir, normalizedHref), 'utf8')
}

const escapeInlineScript = (code) => code.replace(/<\/script/gi, '<\\/script')
const escapeInlineStyle = (code) => code.replace(/<\/style/gi, '<\\/style')

let html = readFileSync(indexPath, 'utf8')

html = html.replace(/\s*<link\s+rel="modulepreload"[^>]*>\r?\n?/gi, '')

html = html.replace(
  /<link\s+rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/gi,
  (_match, href) => `<style>\n${escapeInlineStyle(readDistAsset(href))}\n</style>`,
)

html = html.replace(
  /<script\s+type="module"[^>]*src="([^"]+\.js)"[^>]*><\/script>/gi,
  (_match, src) => `<script type="module">\n${escapeInlineScript(readDistAsset(src))}\n</script>`,
)

writeFileSync(indexPath, html)

rmSync(resolve(distDir, 'assets'), { recursive: true, force: true })
