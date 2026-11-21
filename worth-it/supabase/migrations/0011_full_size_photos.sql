update storage.buckets
set file_size_limit = 15728640
where id = 'poll-photos' and file_size_limit < 15728640;
