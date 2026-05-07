export interface FleetGalleryImage {
  webp: string
  jpg: string
  alt: string
}

const FLEET_GALLERY_BASENAMES = [
  '34C5BAB4-1742-48BF-8338-0B244B5C6F00',
  '79074056563__8B58ECEA-33E0-4579-BFBA-D362354375E4',
  '88bfc13d-5359-40a7-a762-b34b6b48decb',
  '8C1CBE47-101D-49EE-BF5D-E869D00E229B',
  'DA500C7D-EB6F-4D4E-8BF7-DFE63B9AD6A4',
  'IMG_3191',
  'IMG_4829',
  'IMG_4829(1)',
  'IMG_8344',
  'IMG_8345',
  'IMG_8347',
  'IMG_8348',
  'IMG_8349',
  'IMG_8350',
  'IMG_8351',
  'IMG_8352',
  'IMG_8353',
  'IMG_8354',
  'IMG_8355',
  'IMG_8356',
  'IMG_8357',
  'IMG_8358',
  'IMG_8359',
  'IMG_8360',
  'IMG_8361',
  'IMG_9498',
  'IMG_9517',
  'IMG_9518',
  'IMG_9519',
  'IMG_9520',
  'IMG_9521',
  'IMG_9522',
  'IMG_9523',
  'IMG_9524',
  'IMG_9525',
  'IMG_9526',
  'IMG_9534',
  'IMG_9535',
  'IMG_9536',
  'IMG_9640',
  'IMG_9642',
  'IMG_9644',
  'IMG_9645',
  'IMG_9646',
  'IMG_9647',
  'IMG_9661',
  'IMG_9662',
  'IMG_9663',
  'IMG_9667',
  'IMG_9668',
  'IMG_9669',
  'IMG_9671',
  'IMG_9672',
  'IMG_9673',
  'IMG_9738',
  'IMG_9739',
  'IMG_9740',
  'IMG_9741',
  'IMG_9742',
  'IMG_9743',
  'IMG_9805',
  'photo-4496_singular_display_fullPicture',
  'photo-4519_singular_display_fullPicture',
  'photo-4532_singular_display_fullPicture',
  'photo-4591_singular_display_fullPicture',
  'photo-4596_singular_display_fullPicture',
  'photo-4599_singular_display_fullPicture',
  'photo-4602_singular_display_fullPicture',
  'photo-4605_singular_display_fullPicture',
  'photo-4608_singular_display_fullPicture',
  'photo-4611_singular_display_fullPicture',
  'photo-4614_singular_display_fullPicture',
  'photo-4623_singular_display_fullPicture',
  'photo-4640_singular_display_fullPicture',
  'photo-4642_singular_display_fullPicture',
] as const

function toAlt(base: string) {
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, c => c.toUpperCase())
}

export const fleetGalleryManifest: FleetGalleryImage[] = FLEET_GALLERY_BASENAMES.map(base => ({
  webp: `/fleet-gallery/${base}.webp`,
  jpg: `/fleet-gallery/${base}.jpg`,
  alt: toAlt(base),
}))
