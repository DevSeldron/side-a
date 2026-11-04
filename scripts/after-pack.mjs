import { execFileSync } from 'node:child_process'

/**
 * Unsigned, quarantined arm64 builds are reported by macOS as "damaged" instead
 * of "unidentified developer". Ad-hoc signing the bundle and clearing extended
 * attributes during packaging turns that into the normal Gatekeeper prompt.
 */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`
  execFileSync('xattr', ['-cr', appPath])
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('xattr', ['-cr', appPath])
  console.log(`  • ad-hoc signed and cleared attributes  path=${appPath}`)
}
