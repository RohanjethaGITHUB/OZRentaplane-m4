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
    return fs.readdirSync(dir)
      .filter(f => !f.startsWith('.') && /\.(webp|jpg|jpeg|png)$/i.test(f))
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
