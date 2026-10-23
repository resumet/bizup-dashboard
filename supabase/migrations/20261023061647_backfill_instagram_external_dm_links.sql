update public.course_instagram_materials as material
set dm_material = '/article/' || document.slug,
    updated_at = now()
from public.course_documents as document
where document.id = material.document_id
  and document.status = 'published'
  and document.deleted_at is null
  and nullif(btrim(material.dm_material), '') is null;
