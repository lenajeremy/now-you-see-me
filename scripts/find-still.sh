#!/usr/bin/env bash
# Finds stretches of a video where the camera holds still — the parts that work
# as a backdrop. Only keyframes are decoded (at most one every 2 s), so it's
# quick even on long 8K files.
#
#   scripts/find-still.sh <video> [min-seconds=10] [threshold=4]
#
# It compares only the band around the horizon, shrunk to a strip: distant hills
# and skyline move when the camera does, while waves, grass and passers-by
# barely register there. Prints each sample's change from the one before
# (0 = identical), then the still stretches: runs that stay under the threshold.
set -euo pipefail

video=$1 min=${2:-10} threshold=${3:-4}

ffmpeg -v error -skip_frame nokey -i "$video" -an -fps_mode vfr \
  -vf "select='isnan(prev_selected_t)+gte(t-prev_selected_t\,2)',crop=iw:ih*0.24:0:ih*0.28,scale=256:24,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" \
  -f null - |
  awk -v min="$min" -v threshold="$threshold" '
    /pts_time/ { split($0, parts, "pts_time:"); t = parts[2] + 0 }
    /YAVG/ {
      split($0, kv, "="); change = kv[2] + 0
      printf "  %7.1fs  change %5.1f %s\n", t, change, (change < threshold ? "" : "  <- moving")
      if (change < threshold) { if (start < 0) start = previous; last = t }
      else { report(); start = -1 }
      previous = t
    }
    function report() {
      if (start >= 0 && last - start >= min) printf "STILL %.1f-%.1fs (%.0fs)\n", start, last, last - start
    }
    BEGIN { start = -1; previous = 0 }
    END { report() }
  '
