/**
 * The VoxMesa mark: a small stepped mesa (a wide mint block with a golden block on top), drawn in isometric view.
 * It is an original drawing made for this project.
 * @param props.size - width and height in pixels
 */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {/* wide lower block */}
      <polygon points="16,13 28,19 16,25 4,19" fill="#9ff0d3" />
      <polygon points="4,19 16,25 16,31 4,25" fill="#2fcf9b" />
      <polygon points="16,25 28,19 28,25 16,31" fill="#1ba579" />
      {/* small golden block on top */}
      <polygon points="16,9.5 23,13 16,16.5 9,13" fill="#ffe59a" />
      <polygon points="9,13 16,16.5 16,22.5 9,19" fill="#ffc233" />
      <polygon points="16,16.5 23,13 23,19 16,22.5" fill="#d99f14" />
    </svg>
  );
}
