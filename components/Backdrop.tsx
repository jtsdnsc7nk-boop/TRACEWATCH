/** Fixed, purely decorative animated background: drifting light blobs, a rim-lit orb and film grain. */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="tw-blob tw-blob-a" />
      <div className="tw-blob tw-blob-b" />
      <div className="tw-blob tw-blob-c" />
      <div className="tw-orb" />
      <div className="tw-vignette" />
      <div className="tw-grain" />
    </div>
  );
}
