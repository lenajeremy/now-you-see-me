#!/usr/bin/env node
// Uploads the openly licensed 360° videos in media/ to the "Originals" channel,
// through the same Mux pipeline as everyone else's uploads.
//   node scripts/seed-originals.mjs [--prod] [id …]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

const commons = (file) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replaceAll(' ', '_'))}`;
const credit = (what, title, author, license, file) => `${what}: “${title}” by ${author} (${license}) — ${commons(file)}`;

const VIDEOS = [
  {
    id: 'earth-360',
    file: 'media/backdrops/earth-360/backdrop.mp4',
    title: 'Earth 360: The Call of Science',
    facing: 0.62,
    description: [
      'Stand alongside NASA scientists in the field, from the ice of Greenland to the volcanoes of Hawaii.',
      '',
      credit('Video', 'Earth 360 Video: The Call of Science', 'NASA Jet Propulsion Laboratory', 'public domain', 'Earth 360 Video The Call of Science.webm'),
    ].join('\n'),
  },
  {
    id: 'norah-head',
    file: '.tmp/seed/norah-head.mp4',
    title: 'Norah Head',
    facing: 0.6,
    description: [
      'A virtual tour around Norah Head, filmed in 360° on an Insta360 X5. Turn around to find the lighthouse.',
      '',
      credit('Video', 'Norah Head Insta360 X5 Virtual Tour', 'GlennsYouTube', 'CC BY 3.0', 'Norah Head Insta360 X5 Virtual Tour OHNE TON.webm'),
      credit('Sound', 'Sea waves', 'Ganesh Mohan T', 'CC BY-SA 4.0', 'Sea waves.wav'),
    ].join('\n'),
  },
  {
    id: 'skraltica',
    file: 'media/backdrops/skraltica/backdrop.mp4',
    title: 'Škraltica Summit',
    facing: 0.5,
    description: [
      'The view from the top of Škraltica, all the way round.',
      '',
      credit('Video', 'Škraltica 360', 'Bojan Pintar', 'CC BY 3.0', 'Škraltica 360.webm'),
    ].join('\n'),
  },
  {
    id: 'meadow',
    file: 'media/backdrops/meadow/backdrop.mp4',
    title: 'Meadow Walk',
    facing: 0.5,
    description: [
      'A short walk through a meadow, filmed in 8K 360° on an Insta360 X6.',
      '',
      credit('Video', 'Insta360 X6 video, 7 October 2026', 'PantheraLeo1359531', 'CC BY-SA 4.0', '2026-10-07 7680×3840p50 Insta360 X6 VID 20261007 103643 00 027.webm'),
    ].join('\n'),
  },
];

const args = process.argv.slice(2);
const prod = args.includes('--prod');
const only = args.filter((a) => !a.startsWith('--'));

for (const video of VIDEOS.filter((v) => !only.length || only.includes(v.id))) {
  if (!existsSync(video.file)) {
    console.error(`skip ${video.id}: ${video.file} is missing`);
    continue;
  }
  const payload = JSON.stringify({ title: video.title, description: video.description, facing: video.facing });
  const out = execFileSync('npx', ['convex', 'run', ...(prod ? ['--prod'] : []), 'seed:originalsUpload', payload], {
    encoding: 'utf8',
  });
  const { videoId, uploadUrl } = JSON.parse(out.slice(out.indexOf('{')));
  const gb = (statSync(video.file).size / 1e9).toFixed(2);
  console.log(`${video.id}: uploading ${gb} GB as ${videoId}…`);
  const put = spawnSync('curl', ['-sS', '--fail', '-X', 'PUT', '-H', 'Content-Type: video/mp4', '-T', video.file, uploadUrl], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  console.log(put.status === 0 ? `${video.id}: uploaded; Mux is processing it.` : `${video.id}: upload failed (${put.status})`);
}
