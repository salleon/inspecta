import conveyor from "../assets/animations/conveyor.webm";
import sheet from "../assets/animations/sheet.webm";
import zip from "../assets/animations/zip.webm";
import box from "../assets/animations/box.webm";
import updateGears from "../assets/animations/update-gears.webm";

// The loading animations as pre-rendered videos (scripts/render-animations
// draws them from loaderArt / updateGears), so they stay smooth while an
// export or update keeps the phone busy. Transparent, at twice the size
// shown. Each takes the space of its picture; the extra room round it (pad:
// top, right, bottom, left) is for bits drawn outside it, like photos
// dropping in from above, and overlaps what's around.
export type Animation = "conveyor" | "sheet" | "zip" | "box" | "update-gears";

const LOADER = { w: 240, h: 220, pad: [100, 30, 20, 30] };
const GEARS = { w: 300, h: 230, pad: [10, 10, 10, 10] };
const VIDEOS: Record<Animation, { src: string; w: number; h: number; pad: number[] }> = {
  conveyor: { src: conveyor, ...LOADER },
  sheet: { src: sheet, ...LOADER },
  zip: { src: zip, ...LOADER },
  box: { src: box, ...LOADER },
  "update-gears": { src: updateGears, ...GEARS },
};

// loop: plays over and over; otherwise once, stopping on its last frame
export default function AnimationVideo({ name, loop = true, hidden = false }: { name: Animation; loop?: boolean; hidden?: boolean }) {
  const { src, w, h, pad } = VIDEOS[name];
  const [top, right, bottom, left] = pad;
  return (
    <video
      src={src}
      autoPlay
      muted
      playsInline
      loop={loop}
      preload="auto"
      aria-hidden="true"
      style={{
        display: hidden ? "none" : "block",
        width: w + left + right,
        height: h + top + bottom,
        margin: `${-top}px ${-right}px ${-bottom}px ${-left}px`,
        pointerEvents: "none",
      }}
    />
  );
}
