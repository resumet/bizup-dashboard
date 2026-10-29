-- Clipboard images copied from browsers can be encoded as WebP.
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'image/webp')
WHERE id = 'course-cost-evidence'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('image/webp' = ANY(allowed_mime_types));
