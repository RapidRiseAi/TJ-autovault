# Mobile UI overhaul overview (Uber-inspired)

## Product direction
To make the experience feel closer to a modern ride-hailing app, the UI should prioritize:

1. **Fast orientation**: users always know where they are.
2. **Thumb-first interactions**: critical actions remain in lower reach zones.
3. **Clear hierarchy**: one primary action per screen, all secondary actions progressively disclosed.
4. **Calm visual language**: high contrast, soft elevation, strong spacing rhythm.

## What has been updated in this pass

### 1) Navigation architecture for mobile
- Added a fixed **bottom tab bar** for both customer and workshop flows.
- Kept desktop nav patterns while hiding low-priority controls on small screens.
- Ensured mobile tab items are large enough for touch comfort and have strong active states.

### 2) Header cleanup
- Simplified sticky top headers to tighter vertical rhythm.
- Reduced visual noise in small viewports by collapsing support/sign out buttons behind larger breakpoints.
- Preserved access to notifications from the header on all screen sizes.

### 3) Better small-screen content ergonomics
- Increased default bottom padding in page containers so content does not collide with fixed bottom nav.
- Updated workshop sub-nav to be horizontally scrollable with snap behavior on mobile, while keeping wrapped layout on larger screens.

### 4) Base polish for modern feel
- Added anti-aliased text rendering defaults.
- Added a reusable `no-scrollbar` utility for cleaner horizontal chips and filter rails.

## Recommended next phase (full-system modernization)

### A. Mobile design system hardening
- Enforce a strict spacing scale (4/8 system).
- Introduce semantic tokens for elevation, borders, and muted text.
- Standardize touch target minimums (`44px+`) for all interactive controls.

### B. Screen-level UX rework
- **Dashboard**: convert into modular cards with pinned “next action” card at top.
- **Vehicle/job pages**: move key actions into sticky bottom action sheets.
- **Forms**: one-column, sectioned form flows with persistent save/submit CTA.

### C. Interaction upgrades
- Add motion primitives for route transitions and card expansion.
- Add skeleton loaders and optimistic updates for list actions.
- Add inline success/error toasts near interaction source.

### D. Visual language refresh
- Use a monochrome-neutral core with one brand accent for high confidence.
- Increase corner radius consistency (12–20px ranges) on cards/buttons.
- Apply subtle shadow tokens for depth instead of heavy borders.

### E. Accessibility and reliability
- Improve color contrast across secondary text and chips.
- Ensure keyboard focus rings are visible on all interactive elements.
- Validate all interactive controls with mobile screen reader flows.

## Rollout strategy
1. **Foundation (done here)**: nav + header + mobile spacing.
2. **Core pages**: dashboard, notifications, vehicle detail, work requests.
3. **Transactional flows**: uploads, approvals, statements, billing.
4. **QA pass**: device matrix (iOS Safari, Android Chrome, tablet breakpoints).

## Success metrics to track
- Time-to-complete key actions (submit request, approve job, upload file).
- Drop-off on mobile form completion.
- Repeat usage of dashboard and notification interactions.
- Session duration and page depth on mobile devices.
