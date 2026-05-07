import { fleetGalleryManifest } from '@/lib/fleetGalleryManifest'

export interface GalleryImage {
  webp: string
  jpg: string
  alt: string
}

export function getFleetImages(): GalleryImage[] {
  return fleetGalleryManifest
}
