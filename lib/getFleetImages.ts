import fs from 'fs'
import path from 'path'

export interface GalleryImage {
  src: string
  alt: string
}

export function getFleetImages(): GalleryImage[] {
  const dir = path.join(process.cwd(), 'public', 'fleet-gallery')
  try {
    if (!fs.existsSync(dir)) return []
    const files = fs.readdirSync(dir)
      .filter(f => !f.startsWith('.') && /\.(webp|jpg|jpeg|png)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    const byBase = new Map<string, string>()
    const priority = ['webp', 'jpg', 'jpeg', 'png']
    for (const filename of files) {
      const match = filename.match(/^(.*)\.(webp|jpg|jpeg|png)$/i)
      if (!match) continue
      const base = match[1]
      const ext = match[2].toLowerCase()
      const current = byBase.get(base)
      if (!current) {
        byBase.set(base, filename)
        continue
      }
      const currentExt = current.split('.').pop()?.toLowerCase() || ''
      if (priority.indexOf(ext) < priority.indexOf(currentExt)) {
        byBase.set(base, filename)
      }
    }
    return Array.from(byBase.values())
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .map(filename => ({
        src: `/fleet-gallery/${filename}`,
        alt: filename
          .replace(/\.(webp|jpg|jpeg|png)$/i, '')
          .replace(/[-_]+/g, ' ')
          .replace(/^\w/, c => c.toUpperCase()),
      }))
  } catch {
    return []
  }
}
