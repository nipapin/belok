/**
 * Pure-CSS animated background. Three large radial-gradient "blobs"
 * drift across the screen via `transform` keyframes — GPU-composited,
 * zero JS, zero requestAnimationFrame, friendly to every phone.
 *
 * Sits below `z-10` content; respects `prefers-reduced-motion`.
 */
export function GradientBlobs() {
  return (
    <>
      <div className="animated-bg__blob animated-bg__blob--a" />
      <div className="animated-bg__blob animated-bg__blob--b" />
      <div className="animated-bg__blob animated-bg__blob--c" />
    </>
  );
}

export default function AnimatedGradientBackground() {
  return (
    <div
      aria-hidden
      className="animated-bg pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <GradientBlobs />
    </div>
  );
}
