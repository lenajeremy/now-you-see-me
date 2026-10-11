#!/usr/bin/env bash
# Turns a 360° (equirectangular, 2:1) photo or video into a backdrop folder,
# public/backdrops/<id>/, ready to list in src/backdrops.ts. Needs ffmpeg.
#
#   scripts/make-backdrop.sh photo <id> <image> [facing]
#   scripts/make-backdrop.sh video <id> <video> full [facing] [sound-file]
#   scripts/make-backdrop.sh video <id> <video> <start-s> <length-s> [facing] [sound-file]
#   scripts/make-backdrop.sh sound <id> <sound-file>
#
# "sound" (re)makes just the looping ambient sound of an existing backdrop.
# "full" keeps the whole video, untouched in time, with its own soundtrack (or
# the given sound file, looped separately). Otherwise a stretch is cut out and
# turned into a seamless loop.
#
# facing     How far across the panorama (0–1) the screen sits; the picker
#            thumbnail is cropped around it. Use the same value in src/backdrops.ts.
# sound-file Ambient sound to loop with a video. Without it, the video's own
#            sound is used if it has any.
#
# NADIR=0.12 (environment variable) covers the bottom 12% of the panorama —
# straight down, where tripods, hats or the camera operator tend to be — by
# smearing the ground just above it downward.
# POSTER_AT=95 picks the second the poster and thumbnail come from (full videos;
# default: a fifth of the way in).
#
# Videos are cut to <length-s> at 30 fps and their last seconds are blended into
# the first, so the loop has no visible jump. They're encoded twice: 3840×1920
# H.264 (plays everywhere) and, for sharper sources, full-resolution HEVC up to
# 8K as backdrop-hd.mp4. Sound is looped the same way.
set -euo pipefail

kind=$1 id=$2 input=$3
out="public/backdrops/$id"
mkdir -p "$out"

# Filter that patches the nadir (see NADIR above) of frames <height> pixels tall;
# a no-op when NADIR is unset.
nadir_patch() {
  local height=$1 n=${NADIR:-0}
  if awk -v n="$n" 'BEGIN { exit !(n > 0) }'; then
    local band=$(awk -v h="$height" -v n="$n" 'BEGIN { b = int(h * n / 2) * 2; print b }')
    # Blurred hard sideways (around the point straight down), barely up and down.
    echo "split[base][src];[src]crop=iw:8:0:$((height - band - 8)),scale=iw:${band},gblur=sigma=$((height / 40)):sigmaV=1[patch];[base][patch]overlay=0:$((height - band)),"
  fi
}

# Thumbnail: a 16:9 window of the view behind the screen, cut from the poster.
# The poster is laid side by side with itself so the window can wrap around.
make_thumbnail() {
  local facing=$1
  ffmpeg -v error -y -i "$out/poster.jpg" -filter_complex \
    "[0][0]hstack,crop=640:360:'mod(${facing}*2048-320+4096,2048)':512-200,scale=480:270" \
    -q:v 3 "$out/thumb.jpg"
}

# Loops audio seamlessly: drops the first <fade> seconds and blends them back in
# at the end. Loudness is evened out so every backdrop's sound sits at a similar level.
loop_audio() {
  local source=$1 start=$2 length=$3 fade=$4
  ffmpeg -v error -y -ss "$start" -t "$length" -i "$source" -filter_complex \
    "[0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit[a][b];
     [a]atrim=start=${fade},asetpts=PTS-STARTPTS[main];
     [b]atrim=0:${fade},asetpts=PTS-STARTPTS[head];
     [main][head]acrossfade=d=${fade}:c1=tri:c2=tri,loudnorm=I=-24:TP=-2:LRA=11" \
    -c:a aac -b:a 160k -movflags +faststart "$out/sound.m4a"
}

case $kind in
  photo)
    facing=${4:-0.5}
    photo_height=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=nw=1:nk=1 "$input")
    ffmpeg -v error -y -i "$input" -filter_complex "[0:v]scale='min(8192,iw)':-2:flags=lanczos,$(nadir_patch $((photo_height > 4096 ? 4096 : photo_height)))null" -q:v 3 "$out/backdrop.jpg"
    ffmpeg -v error -y -i "$out/backdrop.jpg" -vf scale=2048:1024:flags=lanczos -q:v 3 "$out/poster.jpg"
    make_thumbnail "$facing"
    ;;

  video)
    if [[ ${4:-} == full ]]; then
      facing=${5:-0.5} sound=${6:-}
      width=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=nw=1:nk=1 "$input")
      duration=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$input")
      # The video's own soundtrack, evened out in loudness, unless a sound file replaces it.
      audio=(-an)
      if [[ -z $sound ]] && ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$input" | grep -q .; then
        audio=(-map 0:a:0 -c:a aac -b:a 160k -af loudnorm=I=-24:TP=-2:LRA=11)
      fi
      # Decode once, encode 4K H.264 (plays everywhere) and, for sharper sources, HEVC up to 8K.
      height=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=nw=1:nk=1 "$input")
      graph="[0:v]fps=30,format=yuv420p,$(nadir_patch "$height")"
      outputs=(-map "[sd]" "${audio[@]}" -c:v libx264 -preset medium -crf 20 -maxrate 25M -bufsize 50M
        -profile:v high -level 5.1 -tag:v avc1 -movflags +faststart "$out/backdrop.mp4")
      if ((width > 3840)); then
        hd=$((width > 7680 ? 7680 : width / 4 * 4))
        graph+="split[a][b];[a]scale=3840:1920:flags=lanczos,setsar=1[sd];[b]scale=${hd}:$((hd / 2)):flags=lanczos,setsar=1[hd]"
        outputs+=(-map "[hd]" "${audio[@]}" -c:v hevc_videotoolbox -b:v 45M -maxrate 60M -bufsize 90M
          -profile:v main -tag:v hvc1 -movflags +faststart "$out/backdrop-hd.mp4")
      else
        rm -f "$out/backdrop-hd.mp4"
        graph+="scale=3840:1920:flags=lanczos,setsar=1[sd]"
      fi
      ffmpeg -v error -stats -y -i "$input" -filter_complex "$graph" "${outputs[@]}"
      poster_at=${POSTER_AT:-$(awk -v d="$duration" 'BEGIN { print d / 5 }')}
      ffmpeg -v error -y -ss "$poster_at" -i "$out/backdrop.mp4" -frames:v 1 -vf scale=2048:1024:flags=lanczos -q:v 3 "$out/poster.jpg"
      make_thumbnail "$facing"
      rm -f "$out/sound.m4a"
      if [[ -n $sound ]]; then
        length=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$sound")
        loop_audio "$sound" 0 "$length" 1.5
      fi
      ls -la "$out"
      exit 0
    fi

    start=$4 length=$5 facing=${6:-0.5} sound=${7:-}
    fade=$(awk -v l="$length" 'BEGIN { f = l / 4; print (f > 1.5 ? 1.5 : f) }')
    offset=$(awk -v l="$length" -v f="$fade" 'BEGIN { print l - 2 * f }')
    # Cuts the clip, blends its end into its start, and encodes it at <width>×<width/2>.
    loop_video() {
      local width=$1 dest=$2
      shift 2
      ffmpeg -v error -y -ss "$start" -t "$length" -i "$input" -filter_complex \
        "[0:v]scale=${width}:$((width / 2)):flags=lanczos,setsar=1,fps=30,format=yuv420p,$(nadir_patch $((width / 2)))split[a][b];
         [a]trim=start=${fade},setpts=PTS-STARTPTS[main];
         [b]trim=0:${fade},setpts=PTS-STARTPTS[head];
         [main][head]xfade=transition=fade:duration=${fade}:offset=${offset},format=yuv420p[v]" \
        -map "[v]" -an "$@" -movflags +faststart "$dest"
    }
    # 4K H.264 plays everywhere.
    loop_video 3840 "$out/backdrop.mp4" -c:v libx264 -preset medium -crf 18 -maxrate 30M -bufsize 60M \
      -profile:v high -level 5.1 -tag:v avc1
    # Sharper sources also get a full-resolution HEVC version (up to 8K). Macs
    # decode it in hardware; the app uses it when the browser says it can.
    width=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=nw=1:nk=1 "$input")
    if ((width > 3840)); then
      hd=$((width > 7680 ? 7680 : width / 4 * 4))
      loop_video "$hd" "$out/backdrop-hd.mp4" -c:v hevc_videotoolbox -b:v 60M -maxrate 80M -bufsize 120M \
        -profile:v main -tag:v hvc1
    fi
    ffmpeg -v error -y -i "$out/backdrop.mp4" -frames:v 1 -vf scale=2048:1024:flags=lanczos -q:v 3 "$out/poster.jpg"
    make_thumbnail "$facing"

    if [[ -n $sound ]]; then
      loop_audio "$sound" 0 "$length" "$fade"
    elif ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$input" | grep -q .; then
      # Only keep the video's own sound if it isn't silence.
      level=$(ffmpeg -v info -ss "$start" -t "$length" -i "$input" -vn -af volumedetect -f null - 2>&1 |
        awk '/max_volume/ { print $5 }')
      if awk -v l="$level" 'BEGIN { exit !(l > -60) }'; then loop_audio "$input" "$start" "$length" "$fade"; fi
    fi
    ;;

  sound)
    length=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$input")
    loop_audio "$input" 0 "$length" 1.5
    ;;

  *)
    echo "usage: $0 photo|video|sound <id> <input> ..." >&2
    exit 1
    ;;
esac

ls -la "$out"
