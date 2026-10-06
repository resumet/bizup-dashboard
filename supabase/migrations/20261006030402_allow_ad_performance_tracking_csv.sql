update storage.buckets
set allowed_mime_types = array[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv'
]
where id = 'ad-performance-tracking-files';
