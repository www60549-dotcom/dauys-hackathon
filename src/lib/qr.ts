/** Standard QR quiet zone: four modules on every side. */
export function qrPath(size: number, data: ArrayLike<number>) {
  let path = '';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[y * size + x]) path += `M${x + 4} ${y + 4}h1v1h-1z`;
  return {path, viewBox: `0 0 ${size + 8} ${size + 8}`};
}
