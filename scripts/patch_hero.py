import sys

def patch_file(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # 1. Remove SAFARI_TEXT_OVERLAYS block
    import re
    safari_text_pattern = re.compile(r'// ─── Safari desktop static text overlays ─────────────────────────────────────.*?// ─── Component ────────────────────────────────────────────────────────────────', re.DOTALL)
    content = safari_text_pattern.sub('// ─── Component ────────────────────────────────────────────────────────────────', content)

    # 2. Add classes in AmbientOverlays
    content = content.replace(
        'className={`absolute left-[50%] ${AMBIENT_TUNING.mobile.cloudA} ${AMBIENT_TUNING.desktop.cloudA}',
        'className={`cloud-layer absolute left-[50%] ${AMBIENT_TUNING.mobile.cloudA} ${AMBIENT_TUNING.desktop.cloudA}'
    )
    content = content.replace(
        'className={`absolute left-[50%] ${AMBIENT_TUNING.mobile.cloudB} ${AMBIENT_TUNING.desktop.cloudB}',
        'className={`cloud-layer absolute left-[50%] ${AMBIENT_TUNING.mobile.cloudB} ${AMBIENT_TUNING.desktop.cloudB}'
    )
    content = content.replace(
        'className={`absolute z-30 ${AMBIENT_TUNING.mobile.propeller} ${AMBIENT_TUNING.desktop.propeller}',
        'className={`propeller-layer absolute z-30 ${AMBIENT_TUNING.mobile.propeller} ${AMBIENT_TUNING.desktop.propeller}'
    )

    # 3. Add safari-scrub-active CSS rules
    css_patch = """        .animate-airy-float {
          animation: airy-float 9s ease-in-out infinite;
          transform-origin: center center;
          will-change: transform;
        }
        .safari-scrub-active .cloud-layer {
          animation-play-state: paused !important;
        }
        .safari-scrub-active .propeller-layer {
          opacity: 0 !important;
          transition: opacity 0.2s;
        }"""
    content = content.replace(
        """        .animate-airy-float {
          animation: airy-float 9s ease-in-out infinite;
          transform-origin: center center;
          will-change: transform;
        }""",
        css_patch
    )

    # 4. Remove ambientOp = 0 during scrub (We want them VISIBLE)
    content = content.replace('if (isSafariDesktopRef.current && isScrubbingRef.current) ambientOp = 0\n', '')
    content = content.replace('// The RAF loop restores it naturally once isScrubbingRef flips back to false.\n', '')
    content = content.replace('// Disable ambient opacity entirely while scrolling on Safari desktop\n', '')

    # 5. Add safari-scrub-active class on scroll
    scroll_patch_1 = """        isScrubbingRef.current = true
        if (ambientRefs.current) {
          ambientRefs.current.classList.add('safari-scrub-active')
        }
        if (floatingPathsWrapRef.current) {"""
    content = content.replace(
        """        isScrubbingRef.current = true
        if (floatingPathsWrapRef.current) {""",
        scroll_patch_1
    )

    # 6. Remove safari-scrub-active on settle
    scroll_patch_2 = """        isScrubbingRef.current = false
        if (ambientRefs.current) {
          ambientRefs.current.classList.remove('safari-scrub-active')
        }
        scrubTimerRef.current  = null"""
    content = content.replace(
        """        isScrubbingRef.current = false
        scrubTimerRef.current  = null""",
        scroll_patch_2
    )

    # 7. Unhide JSX AmbientOverlays
    content = content.replace(
        '{/* Ambient Overlays (Clouds & Propeller) (Unmounted entirely on Safari) */}\n          {!isSafariDesktop && <AmbientOverlays innerRef={ambientRefs} />}',
        '{/* Ambient Overlays (Clouds & Propeller) */}\n          <AmbientOverlays innerRef={ambientRefs} />'
    )

    # 8. Unhide JSX FloatingPaths
    content = content.replace(
        """          {/* Floating paths (72 SVGs) (Unmounted entirely on Safari) */}
          {!isSafariDesktop && (
            <div ref={floatingPathsWrapRef} className="absolute inset-0 pointer-events-none">
              <FloatingPaths position={1} />
              <FloatingPaths position={-1} />
            </div>
          )}""",
        """          {/* Floating paths */}
          <div ref={floatingPathsWrapRef} className="absolute inset-0 pointer-events-none">
            <FloatingPaths position={1} />
            <FloatingPaths position={-1} />
          </div>"""
    )
    
    # 9. Restore Framer Motion TEXT_OVERLAYS instead of SAFARI_TEXT_OVERLAYS
    content = content.replace(
        '{/* Safari desktop uses SAFARI_TEXT_OVERLAYS (plain HTML, no Framer Motion). */}\n        {(isSafariDesktop ? SAFARI_TEXT_OVERLAYS : TEXT_OVERLAYS).map((overlay, idx) => (',
        '{/* ── Hero text overlays ──────────────────────────────────────────── */}\n        {TEXT_OVERLAYS.map((overlay, idx) => ('
    )

    with open(filename, 'w') as f:
        f.write(content)

patch_file('components/HeroScrollStage.tsx')
