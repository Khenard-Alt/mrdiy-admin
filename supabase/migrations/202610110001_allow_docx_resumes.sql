begin;
-- Allow DOCX resumes on top of the existing PDF/TXT support.
update storage.buckets
set allowed_mime_types = array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
where id in ('resumes', 'private-resumes');
commit;
