# PACE visual overhaul · 5 September 2026

## Assessment and direction

Subjective starting score: **6/10 for the assistant's visual experience**, not its backend capabilities. The main problems were nested containers, similarly weighted surfaces, small reading text, a promotional alternating launcher, and excessive character rotation.

The new direction is a quiet operational assistant: **ink chrome, an ivory reading canvas, mint accents, and a recognizable glass-like ribbon character**. Important store signals stay ahead of suggestions; the assistant remains distinct from the checkout interface.

## Implemented

- Compact 480px desktop drawer with an optional 760px reading view; expanding does not discard the draft or answer.
- Full-width mobile interface, safe-area spacing and visual-viewport-aware height, including compact keyboard-height layouts.
- Clear header, separate truthful work-state/privacy-mode strip, welcome identity, primary signal, quieter setup/supporting information, suggested questions and recent investigations.
- Unboxed, larger answer typography; softer user-question surface; retained sources, limitations, clarification choices and safe navigation actions.
- Shared growing textarea: Enter sends, Shift+Enter inserts a line, IME composition does not submit.
- Fixed composer outside the reading scroll area, focused follow-up input after keyboard submission, and Escape focus restoration.
- Stationary launcher labels and a free-standing mint ribbon, without an icon frame. Following user feedback, morphing is central again: a one-shot liquid greeting, eased ribbon/question/liquid cycles during real work, and a liquid return to the ribbon when ready. State traces stay secondary; no full rotations.
- Light/dark surface tokens, visible keyboard focus, reduced-motion support, and motion-off handling for both CSS and JavaScript.

The shared character also updates its existing appearances in settings, onboarding and the public website. Those pages' overall layouts were not redesigned in this pass.

## Preserved boundaries

No changes to AI providers, prompts, financial operations, data permissions, billing entitlements or destination validation. Work-state labels still come from the existing truth-state controller. No decorative fake processing stages or invented store metrics.

## Validation

- TypeScript check passed.
- Initial overhaul application unit suites (`vitest run src api`): **670 tests passed**. After the morph refinement: **105 PACE unit tests passed**.
- Seven PACE browser tests passed: actual SVG morph geometry and return to the ribbon, desktop/mobile conversations, customer-cart separation, expanded view/draft preservation/focus, light/dark accessibility with reduced motion, and narrow/short viewport layouts.
- Production-style E2E build passed.
- Manual browser inspection of desktop and mobile/dark layouts.

The unrestricted unit command also discovered an unrelated temporary pitch-deck dependency test whose external module path is missing. That temporary workspace was left untouched.

Browser tests use local demo data and existing mocks/fallbacks. They do not verify live AI service availability. Real iPhone keyboard behavior still merits a physical-device check; Chromium viewport resizing is not an iOS device test.