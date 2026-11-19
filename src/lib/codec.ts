/** Compact base64 encodings for gridded values stored in the prepared JSON files. */
function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string): Uint8Array {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
// Typed arrays are little-endian on every platform browsers and Node run on.
export const encodeInt16 = (a: Int16Array) => toBase64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
export const encodeUint16 = (a: Uint16Array) => toBase64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
export const encodeUint8 = (a: Uint8Array) => toBase64(a);

const cache = new Map<string, ArrayBufferView>();
function cached<T extends ArrayBufferView>(kind: string, b64: string, make: (bytes: Uint8Array) => T): T {
  // Key on length + a slice of the string: cheap, and collisions between different grids are practically impossible.
  const key = `${kind}:${b64.length}:${b64.slice(0, 48)}:${b64.slice(-48)}:${b64.slice(b64.length >> 1, (b64.length >> 1) + 48)}`;
  let v = cache.get(key) as T | undefined;
  if (!v) {v = make(fromBase64(b64)); cache.set(key, v); if (cache.size > 200) cache.delete(cache.keys().next().value!);}
  return v;
}
export const decodeInt16 = (b64: string) => cached('i16', b64, b => new Int16Array(b.buffer, b.byteOffset, b.byteLength / 2));
export const decodeUint16 = (b64: string) => cached('u16', b64, b => new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2));
export const decodeUint8 = (b64: string) => cached('u8', b64, b => b);
