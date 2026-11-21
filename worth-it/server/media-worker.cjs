// Run on a trusted server with ffmpeg and ffprobe on PATH. Never import into Expo.
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');
const { mkdtemp, writeFile, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
async function jpegPreview(bytes) {
  if (bytes.length > 15 * 1024 * 1024) throw new Error('Image too large');
  const image = sharp(bytes, { limitInputPixels: 60000000, failOn: 'warning' });
  const info = await image.metadata();
  if (info.format !== 'jpeg') throw new Error('Expected JPEG');
  return image
    .rotate()
    .resize({ width: 720, height: 1000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();
}
async function processJob(client, job) {
  if (!job.source_path.startsWith(job.owner_id + '/') || !/^[-0-9a-f]{36}$/.test(job.owner_id))
    throw new Error('Invalid source');
  const download = await client.storage.from(job.bucket).download(job.source_path);
  if (download.error) throw download.error;
  if (download.data.size > 20 * 1024 * 1024) throw new Error('Media too large');
  const bytes = Buffer.from(await download.data.arrayBuffer());
  const base = job.owner_id + '/processed/' + job.id;
  let preview, playback;
  if (job.bucket === 'poll-photos') {
    preview = base + '.jpg';
    const result = await client.storage
      .from(job.bucket)
      .upload(preview, await jpegPreview(bytes), { contentType: 'image/jpeg', upsert: true });
    if (result.error) throw result.error;
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'worthit-media-'));
    try {
      const input = join(dir, 'input.mp4'),
        output = join(dir, 'playback.mp4'),
        poster = join(dir, 'poster.jpg');
      await writeFile(input, bytes);
      const probe = await run(
        process.env.FFPROBE_PATH || 'ffprobe',
        ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_format', '-show_streams', '-of', 'json', input],
        { timeout: 30000, maxBuffer: 1024 * 1024 },
      );
      const info = JSON.parse(probe.stdout),
        video = info.streams?.find((s) => s.codec_type === 'video');
      if (
        !video ||
        !String(info.format?.format_name).includes('mp4') ||
        !Number.isFinite(Number(info.format?.duration)) ||
        Number(info.format.duration) <= 0 ||
        Number(info.format.duration) > 180 ||
        video.width * video.height > 16000000
      )
        throw new Error('Invalid video');
      await run(
        process.env.FFMPEG_PATH || 'ffmpeg',
        [
          '-nostdin',
          '-y',
          '-protocol_whitelist',
          'file,pipe',
          '-i',
          input,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-vf',
          "scale=w='trunc(min(720,iw)/2)*2':h=-2",
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '26',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '96k',
          '-movflags',
          '+faststart',
          '-map_metadata',
          '-1',
          output,
        ],
        { timeout: 240000, maxBuffer: 1024 * 1024 },
      );
      await run(
        process.env.FFMPEG_PATH || 'ffmpeg',
        [
          '-nostdin',
          '-y',
          '-protocol_whitelist',
          'file,pipe',
          '-i',
          input,
          '-frames:v',
          '1',
          '-vf',
          "scale=w='min(480,iw)':h=-2",
          '-map_metadata',
          '-1',
          poster,
        ],
        { timeout: 30000, maxBuffer: 1024 * 1024 },
      );
      playback = base + '.mp4';
      preview = base + '.jpg';
      for (const [path, file, type] of [
        [playback, output, 'video/mp4'],
        [preview, poster, 'image/jpeg'],
      ]) {
        const contents = await readFile(file);
        if (contents.length > 20 * 1024 * 1024) throw new Error('Output too large');
        const uploaded = await client.storage
          .from(job.bucket)
          .upload(path, contents, { contentType: type, upsert: true });
        if (uploaded.error) throw uploaded.error;
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  const result = await client.rpc('worthit_finish_media', {
    p_id: job.id,
    p_success: true,
    p_preview: preview,
    p_playback: playback || null,
  });
  if (result.error) throw result.error;
}
async function main() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server credentials required');
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Fail before claiming a job if video tooling is not installed.
  await run(process.env.FFPROBE_PATH || 'ffprobe', ['-version'], { timeout: 10000 });
  await run(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], { timeout: 10000 });
  for (let n = 0; n < 20; n++) {
    const { data, error } = await client.rpc('worthit_claim_media');
    if (error) throw error;
    if (!data?.[0]) break;
    const job = data[0];
    try {
      await processJob(client, job);
      console.log('Media processing completed.');
    } catch {
      const failed = await client.rpc('worthit_finish_media', { p_id: job.id, p_success: false });
      if (failed.error) throw failed.error;
      console.error('Media processing failed; review job and retry after fixing the cause.');
    }
  }
}
module.exports = { jpegPreview, processJob };
if (require.main === module)
  main().catch(() => {
    console.error('Media worker stopped. Check server configuration and tools.');
    process.exitCode = 1;
  });
