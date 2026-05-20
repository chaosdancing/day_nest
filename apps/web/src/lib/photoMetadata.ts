export type ExifDateFields = {
  DateTimeOriginal?: Date | string | number | null;
  CreateDate?: Date | string | number | null;
  ModifyDate?: Date | string | number | null;
  DateTime?: Date | string | number | null;
};

const EXIF_DATE_FIELDS: Array<keyof ExifDateFields> = [
  'DateTimeOriginal',
  'CreateDate',
  'ModifyDate',
  'DateTime',
];

export function pickExifTakenAt(exif: ExifDateFields | null | undefined): string | null {
  if (!exif) return null;
  for (const field of EXIF_DATE_FIELDS) {
    const value = exif[field];
    if (!value) continue;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return null;
}

export function formatDateInputValue(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
