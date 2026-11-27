// Photos dropped on the "Post your first case" card on the dentist home are
// handed to /first-case in memory (client-side navigation keeps this module
// alive). After a full page reload there is nothing to hand over and the
// flow simply starts with the photo picker.

let pending: File[] = []

export function handOffPhotos(files: File[]): void {
  pending = files.filter(f => f.type.startsWith('image/')).slice(0, 4)
}

export function takeHandedOffPhotos(): File[] {
  const f = pending
  pending = []
  return f
}
