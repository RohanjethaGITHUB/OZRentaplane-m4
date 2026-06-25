# HomeHeroScrollSequence — Architecture Context

**Last updated:** June 2026  
**Component file:** `components/HomeHeroScrollSequence.tsx`  
**Purpose:** Give any future Claude or Codex session full context before touching this component.

---

## What this component does

A cinematic scroll-scrubbed hero sequence on the homepage. The user scrolls through 430dvh of vertical space. A sticky container stays fixed to the viewport while the user scrolls. Inside it, a video element is scrubbed by mapping scroll position to `video.currentTime`. This creates the effect of a filmstrip — the aircraft flying through clouds above Sydney, transitioning across three distinct scenes.

It is NOT a playing video. It is a video used as a frame source, driven entirely by scroll position.

---

## Architecture overview

```
<section style="height: 430dvh">          ← Outer scroll container (tall)
  <div class="sticky top-0">             ← Stays fixed while user scrolls
    <video ref={videoDesktopRef}>        ← Desktop: hero-desktop.webm/mp4
    <video ref={videoMobileRef}>         ← Mobile: hero-mobile.webm/mp4
    <HeroCloudLayers />                  ← CSS animated clouds overlay
    [Text overlays, CTA button]          ← Scene headings, FLY YOUR WAY text
    [Loading overlay]                    ← Frosted glass with logo + bar
  </div>
</section>
```

---

## The rendering pipeline

```
window.scroll event
  → RAF tick fires (renderLoop)
    → readScrollAndSetTarget()     reads window.scrollY → targetFrameRef
    → exponential smoothing        currentFrameRef approaches targetFrameRef
    → applyBestFrame()             sets video.currentTime = targetTime
    → updateCloudVisibility()      fades clouds in/out via DOM style
    → updateCtaVisibility()        shows/hides CTA button
    → getSceneIndex()              determines which scene (0, 1, 2)
    → setSceneIndex()              triggers React re-render for scene headings
```

The RAF loop is **self-throttling** — it only re-queues itself if the animation hasn't settled (target !== current). When the user stops scrolling, the loop settles and stops. It restarts on the next scroll event.

---

## Video files

| File | Size | Used by | Format |
|------|------|---------|--------|
| `/public/hero-desktop.webm` | ~5.4MB | Chrome/Firefox desktop | VP9 |
| `/public/hero-desktop.mp4` | ~7.8MB | Safari desktop | H.264 |
| `/public/hero-mobile.webm` | ~2.8MB | Chrome/Firefox mobile | VP9 |
| `/public/hero-mobile.mp4` | ~5.2MB | Safari mobile / iOS | H.264 |

Both `<video>` elements always exist in the DOM. The inactive one uses `preload="none"` to avoid unnecessary downloading. The `<source>` order matters: WebM first (Chrome picks it), MP4 second (Safari picks it).

**Critical video attributes — never remove these:**
- `muted` — required for all browsers to allow programmatic seeking
- `playsInline` — required for iOS Safari to allow seeking without fullscreen
- `preload="auto"` on active video — required for `canplaythrough` to fire
- No `autoPlay` — we never want the video to play on its own

---

## Key refs and what they do

| Ref | Type | Purpose |
|-----|------|---------|
| `videoDesktopRef` | `HTMLVideoElement` | Desktop video element |
| `videoMobileRef` | `HTMLVideoElement` | Mobile video element |
| `videoReadyRef` | `boolean` | True when active video has fired canplaythrough |
| `targetFrameRef` | `number` | Where scroll says we should be (0–159) |
| `currentFrameRef` | `number` | Where the animation currently is (smoothed) |
| `lastAppliedTimeRef` | `number` | Last `video.currentTime` value we set |
| `isMobileViewportRef` | `boolean` | Mirror of `isMobileViewport` state, safe to read in RAF |
| `safariSeekTickRef` | `number` | Counter for Safari seek throttling |
| `rafRef` | `number\|null` | Current RAF handle. null = loop is idle |
| `sectionTopRef` | `number` | Pixel offset of section top (updated on resize) |
| `sectionScrollableRef` | `number` | Scrollable distance of section (updated on resize) |
| `motionModeRef` | `string` | 'full' or 'reduced' — safe to read in RAF |
| `introDoneRef` | `boolean` | True after intro animation completes |

**The ref mirror pattern:** React state cannot be safely read inside a RAF callback (stale closure). Every piece of state that `renderLoop` or `applyBestFrame` needs has a corresponding ref that's kept in sync via `useEffect`. Always use the ref inside the RAF loop, never the state value.

---

## The applyBestFrame function

This is the most critical function. It runs every RAF tick.

```typescript
function applyBestFrame(playhead: number, _nowTs: number) {
  if (!videoReadyRef.current) return          // ← video not ready, skip
  const vid = isMobileViewportRef.current     // ← pick correct video
    ? videoMobileRef.current
    : videoDesktopRef.current
  if (!vid) return                            // ← video element missing, skip

  const frameIndex = clamp(Math.round(playhead), 0, TOTAL_FRAMES - 1)
  const targetTime = (frameIndex / (TOTAL_FRAMES - 1)) * VIDEO_DURATION

  if (Math.abs(targetTime - lastAppliedTimeRef.current) < 0.001) return  // ← no change

  // Safari throttle: seek every 3rd tick instead of every tick
  if (IS_SAFARI) {
    safariSeekTickRef.current += 1
    if (safariSeekTickRef.current % 3 !== 0) return
  }

  lastAppliedTimeRef.current = targetTime
  vid.currentTime = targetTime               // ← the actual seek
}
```

**⚠️ The most common bug:** If `videoMobileRef.current` is null (no mobile `<video>` element in JSX), `applyBestFrame` returns early on every tick for mobile users. The animation appears stuck on frame 0/1 forever. This is silent — no error, no warning. Always verify both video elements exist in JSX when debugging mobile.

---

## Scene structure

Three scenes, 160 total frames at 24fps (6.625 seconds):

| Scene | Frames | Content |
|-------|--------|---------|
| S1 | 0–49 | Aircraft above clouds, daylight sky |
| S2 | 50–89 | Transition, descending |
| S3 | 90–159 | Sydney cityscape, Harbour Bridge, Opera House |

Scene boundaries drive:
- `sceneIndex` state → scene heading text changes
- `updateCloudVisibility()` → cloud layer opacity
- `updateCtaVisibility()` → CTA button visibility

Constants:
```typescript
const VIDEO_DURATION = 6.625   // seconds
const TOTAL_FRAMES = 160
const SCENE_BOUNDARIES = [
  { start: 0, end: 49 },
  { start: 50, end: 89 },
  { start: 90, end: 159 },
]
```

---

## Mobile vs desktop differences

| | Desktop | Mobile |
|--|---------|--------|
| Video file | hero-desktop.webm/mp4 | hero-mobile.webm/mp4 |
| Video ref | videoDesktopRef | videoMobileRef |
| CSS positioning | `object-center` | `object-[50%_38%]` (shifted up) |
| Safari throttle | Yes (% 3) | Yes (% 3) |
| Breakpoint | > 767px | ≤ 767px |

Mobile breakpoint: `window.matchMedia('(max-width: 767px)')`. The `isMobileViewport` state is mirrored to `isMobileViewportRef` for safe RAF access.

---

## The loading overlay

A frosted glass overlay (`backdrop-filter: blur(16px)`) covers the hero while the video loads. It shows the OZ logo + amber progress bar. It fades out when `videoReady` state becomes true.

The overlay also acts as the scroll lock UX — users can't see the hero isn't ready because the overlay covers it. The scroll lock (`lockPageScroll`) runs independently and releases when `introDone` fires AND `videoReadyRef.current` is true.

```
videoReady state = false  → overlay visible, opacity 1
videoReady state = true   → overlay fades out, opacity 0, pointerEvents none
```

---

## Scroll lock

During the intro text animation (`!introDone`), page scroll is locked. The lock uses `html { overflow: hidden }` — NOT `body { position: fixed }`. The `position: fixed` approach causes iOS Safari to lose scroll position on unlock. Never revert to position:fixed.

Lock releases when:
- `introDone` becomes true (intro timer fires, ~1.5s)
- AND `videoReadyRef.current` is true

Both conditions must be true. This prevents the user scrolling before the video is ready.

---

## Safari-specific behaviour

Safari is detected at module level (outside component):
```typescript
const IS_SAFARI = 
  typeof navigator !== 'undefined' &&
  /Safari\//.test(navigator.userAgent) &&
  !/Chrome\//.test(navigator.userAgent)
```

Safari seek throttle: `safariSeekTickRef` increments each RAF tick. Seeks only happen when `tick % 3 === 0` (every 3rd tick = 20 seeks/second instead of 60). This prevents Safari's video decoder from being overwhelmed.

**Do not add canvas rendering for Safari.** We tried `ctx.drawImage(video, ...)` on the `seeked` event — it made performance significantly worse (more jerky, not less). Direct `vid.currentTime` with throttling is the best approach for Safari.

---

## What NOT to do — lessons learned

| Approach | Why it fails |
|----------|--------------|
| `body { position: fixed }` scroll lock | iOS Safari loses scroll position on unlock, causes jump |
| `img` sequence (160 files) | 160 separate HTTP requests = 42 second load in production |
| `createImageBitmap()` for Safari | Unreliable on Safari, silently fails |
| `ctx.drawImage()` on `seeked` event | Worse performance on Safari than direct seek |
| `requestVideoFrameCallback` | Breaks RAF loop, animation freezes |
| `MobileHeroCanvas` component | Complex, zoom/crop issues, still 160 HTTP requests on mobile |
| `decoding="sync"` on img elements | Blocks main thread, causes jank |
| `100vh` instead of `100dvh` | Safari iOS includes URL bar, wrong scroll timeline length |

---

## File relationships

```
components/HomeHeroScrollSequence.tsx   ← Main component (this file)
components/HeroCloudLayers.tsx          ← Cloud animation overlay
public/hero-desktop.mp4                 ← Desktop video (Safari)
public/hero-desktop.webm               ← Desktop video (Chrome/Firefox)
public/hero-mobile.mp4                 ← Mobile video (Safari/iOS)
public/hero-mobile.webm                ← Mobile video (Chrome/Android)
public/WebHomeHeroScroll/*.webp        ← Original source frames (keep, don't deploy)
public/WebHomeHeroScrollJPEG/*.jpg     ← JPEG fallback frames (keep, not currently used)
public/MobileHomeHeroJPEG/*.jpg        ← Mobile JPEG fallback frames (keep, not currently used)
```

The JPEG frame folders are kept as fallback assets but are NOT loaded by the current implementation. Do not delete them.

---

## How to debug mobile "stuck on frame 1"

1. Open Chrome DevTools → mobile viewport emulation
2. Open Console tab
3. Paste: `document.querySelectorAll('video')` — should return 2 video elements
4. Paste: `document.querySelectorAll('video')[1].readyState` — should be 3 or 4
5. If only 1 video returned → mobile `<video>` element is missing from JSX
6. If readyState is 0 or 1 → video hasn't loaded, check network tab for the request
7. Paste: `document.querySelectorAll('video')[1].currentTime` — then scroll, paste again — should change

If `currentTime` never changes when scrolling: `applyBestFrame` is returning early. Check:
- Is `videoReadyRef.current` true? (videoReady state)
- Is `videoMobileRef.current` non-null? (video element exists)
- Is `isMobileViewportRef.current` true? (correct viewport detected)

---

## Starting prompt for a new chat session

When starting a new chat to work on this component, paste this:

> "I'm working on `components/HomeHeroScrollSequence.tsx` in a Next.js 14 App Router + Supabase project. This is a scroll-scrubbed video hero — NOT a playing video. It maps scroll position to `video.currentTime` on two video elements (desktop and mobile). The RAF loop runs `applyBestFrame()` which sets `vid.currentTime`. There are separate video files for desktop (`hero-desktop.webm/mp4`) and mobile (`hero-mobile.webm/mp4`). Key refs: `videoDesktopRef`, `videoMobileRef`, `videoReadyRef`, `isMobileViewportRef`. The most common mobile bug is `videoMobileRef.current` being null causing `applyBestFrame` to return early silently. Safari uses seek throttling (`safariSeekTickRef % 3`). Do NOT use canvas rendering, createImageBitmap, or position:fixed scroll lock. Always audit the file before making any changes."
