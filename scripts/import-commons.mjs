#!/usr/bin/env node
// Imports the openly licensed 360° videos listed in scripts/commons-360.json.
// Each is downloaded from Wikimedia Commons (one at a time, identifying
// ourselves as their policy asks), converted to 4K H.264 if it's wider than
// 4K or in a codec Mux may not take, uploaded to Mux, then deleted here.
//   node scripts/import-commons.mjs [--prod] [--smallest-first] [title …]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

const UA = 'NowYouSeeMe/1.0 (https://now-you-see-me-three.vercel.app) curator-script';
const WORK = '.tmp/commons';
const args = process.argv.slice(2);
const prod = args.includes('--prod');
const only = args.filter((a) => !a.startsWith('--'));
const videos = JSON.parse(readFileSync(new URL('./commons-360.json', import.meta.url), 'utf8'));
// When downloads are slow, get the most videos up soonest.
if (args.includes('--smallest-first')) videos.sort((a, b) => a.size - b.size);
mkdirSync(WORK, { recursive: true });

const convex = (fn, payload) => {
  const out = execFileSync('npx', ['convex', 'run', ...(prod ? ['--prod'] : []), fn, JSON.stringify(payload)], { encoding: 'utf8' });
  return JSON.parse(out.slice(Math.min(...['{', '[', 't', 'f'].map((c) => out.indexOf(c)).filter((i) => i >= 0))));
};
const run = (cmd, argv) => {
  const result = spawnSync(cmd, argv, { stdio: ['ignore', 'ignore', 'inherit'] });
  if (result.status !== 0) throw new Error(`${cmd} exited with ${result.status}`);
};
const probe = (file) => {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width', '-of', 'json', file], { encoding: 'utf8' });
  const streams = JSON.parse(out).streams;
  return { video: streams.find((s) => s.codec_type === 'video'), audio: streams.some((s) => s.codec_type === 'audio') };
};

for (const video of videos) {
  if (only.length && !only.some((t) => video.title.toLowerCase().includes(t.toLowerCase()))) continue;
  const label = `@${video.channel.handle}  ${video.title}`;
  try {
    if (convex('seed:hasVideo', { handle: video.channel.handle, title: video.title })) {
      console.log(`skip    ${label}`);
      continue;
    }
    const source = `${WORK}/source${video.url.slice(video.url.lastIndexOf('.'))}`;
    rmSync(source, { force: true });
    console.log(`get     ${label}  (${(video.size / 1e9).toFixed(2)} GB)`);
    // Resumes where it left off if Commons drops the connection (it throttles big downloads).
    run('curl', ['-sS', '--fail', '--retry', '8', '--retry-all-errors', '--retry-delay', '30', '-C', '-', '-A', UA, '-o', source, video.url]);

    let file = source;
    const { video: stream, audio } = probe(source);
    if (stream.width > 4096 || !['h264', 'vp9', 'vp8', 'hevc'].includes(stream.codec_name)) {
      file = `${WORK}/converted.mp4`;
      console.log(`convert ${label}  (${stream.codec_name} ${stream.width}px → h264 3840px)`);
      run('ffmpeg', ['-v', 'error', '-y', '-i', source, '-vf', 'scale=3840:1920:flags=lanczos,setsar=1',
        '-c:v', 'h264_videotoolbox', '-b:v', '45M', '-maxrate', '60M', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        ...(audio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']), '-movflags', '+faststart', file]);
    }

    const { videoId, uploadUrl } = convex('seed:importUpload', {
      channel: video.channel, title: video.title, description: video.description, facing: video.facing,
    });
    console.log(`upload  ${label}  → ${videoId}`);
    try {
      run('curl', ['-sS', '--fail', '--retry', '3', '--retry-all-errors', '--retry-delay', '15', '-X', 'PUT', '-T', file, uploadUrl]);
    } catch (error) {
      // Leave nothing half-made: the next run will try this one again.
      convex('seed:discardImport', { videoId });
      throw error;
    }
    console.log(`done    ${label}`);
    rmSync(source, { force: true });
    if (file !== source) rmSync(file, { force: true });
  } catch (error) {
    console.log(`FAILED  ${label}: ${error.message}`);
  }
}
