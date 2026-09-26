#!/usr/bin/env node
/**
 * Repair napi-rs native binding resolution on hosts where libc detection lies.
 *
 * Some container images (notably Alpine userland running a glibc Node build,
 * e.g. Node installed from nix on top of Alpine) ship a musl `/usr/bin/ldd`
 * shim while the Node binary is actually linked against glibc. napi-rs loaders
 * probe `/usr/bin/ldd` *first* and short-circuit to "musl" before they ever
 * consult the more reliable `process.report.header.glibcVersionRuntime`. The
 * result is that a glibc Node tries to `dlopen` a musl `.node` file, fails, and
 * then falls back to a `wasm32-wasi` package that is not in the lockfile --
 * surfacing as:
 *
 *   Error: Loading PostCSS "@tailwindcss/postcss" plugin failed:
 *   Cannot find native binding.
 *
 * which kills `npm run build` before webpack emits anything, and can kill
 * `vitest` at startup before a single test runs.
 *
 * On such a host this script copies the correctly-installed glibc binding into
 * the musl package location the loader insists on requiring, so the loader
 * finds a binary that actually loads.
 *
 * This is a no-op on every normal machine: if libc detection is consistent
 * (ordinary Linux glibc, Alpine-on-musl, macOS, Windows, CI) the musl and gnu
 * packages are never simultaneously mismatched and the script exits quietly.
 * It never fails the install -- any error is reported and swallowed, because a
 * best-effort binding repair must not be able to break `npm ci`.
 *
 * Ported from all-chat: frontend/scripts/fix-native-bindings.mjs, which carries
 * the same fix for the same hosts.
 */
import { existsSync, readFileSync, readdirSync, copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const nodeModules = join(repoDir, 'node_modules')

/** True when /usr/bin/ldd claims musl but this Node is actually glibc-linked. */
function hasMismatchedLibc() {
  if (process.platform !== 'linux') return false

  let lddSaysMusl = false
  try {
    lddSaysMusl = readFileSync('/usr/bin/ldd', 'utf-8').includes('musl')
  } catch {
    return false
  }
  if (!lddSaysMusl) return false

  // The authoritative signal: a glibc-linked Node reports a glibc runtime.
  let glibcRuntime = null
  try {
    if (process.report && typeof process.report.getReport === 'function') {
      process.report.excludeNetwork = true
      glibcRuntime = process.report.getReport()?.header?.glibcVersionRuntime ?? null
    }
  } catch {
    return false
  }
  return Boolean(glibcRuntime)
}

/**
 * Package pairs to repair, as [muslPackage, gnuPackage]. Only pairs where the
 * gnu package is present and the musl one is missing (or unusable) are touched.
 */
function bindingPairs() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return [
    [`@tailwindcss/oxide-linux-${arch}-musl`, `@tailwindcss/oxide-linux-${arch}-gnu`],
    [`@rollup/rollup-linux-${arch}-musl`, `@rollup/rollup-linux-${arch}-gnu`],
    [`lightningcss-linux-${arch}-musl`, `lightningcss-linux-${arch}-gnu`],
    [`@unrs/resolver-binding-linux-${arch}-musl`, `@unrs/resolver-binding-linux-${arch}-gnu`],
  ]
}

function repair(muslPkg, gnuPkg) {
  const gnuDir = join(nodeModules, gnuPkg)
  const muslDir = join(nodeModules, muslPkg)
  if (!existsSync(gnuDir)) return false

  const gnuBinary = readdirSync(gnuDir).find((f) => f.endsWith('.node'))
  if (!gnuBinary) return false

  // Mirror the gnu package under the musl name, including package.json (the
  // loader reads its `version` field) and the musl-named .node artifact.
  mkdirSync(muslDir, { recursive: true })
  for (const file of readdirSync(gnuDir)) {
    if (file.endsWith('.node') || file === 'package.json') {
      copyFileSync(join(gnuDir, file), join(muslDir, file))
    }
  }
  const muslBinary = gnuBinary
    .replace(/-gnu(\.node)$/, '-musl$1')
    .replace(/linux-(x64|arm64)\.node$/, 'linux-$1-musl.node')
  if (muslBinary !== gnuBinary) {
    copyFileSync(join(gnuDir, gnuBinary), join(muslDir, muslBinary))
  }

  return true
}

if (hasMismatchedLibc()) {
  const repaired = []
  for (const [muslPkg, gnuPkg] of bindingPairs()) {
    try {
      if (repair(muslPkg, gnuPkg)) repaired.push(muslPkg)
    } catch (err) {
      console.warn(`[fix-native-bindings] could not repair ${muslPkg}: ${err.message}`)
    }
  }
  if (repaired.length > 0) {
    console.log(
      `[fix-native-bindings] glibc Node on a musl-reporting host: provisioned glibc bindings for ${repaired.join(', ')}`
    )
  }
}
