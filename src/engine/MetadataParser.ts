export interface TrackMetadata {
  title?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
}

export function parseMetadata(buffer: ArrayBuffer): TrackMetadata {
  const result: TrackMetadata = {};

  if (buffer.byteLength < 10) return result;

  const view = new DataView(buffer);

  if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) {
    return result;
  }

  const majorVersion = view.getUint8(3);
  const tagSize = decodeSyncsafe(view, 6);
  const headerEnd = Math.min(10 + tagSize, buffer.byteLength);

  let offset = 10;

  while (offset < headerEnd - 10) {
    const byte0 = view.getUint8(offset);
    if (byte0 === 0) break;

    const frameId = String.fromCharCode(
      byte0,
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );

    const frameSize = majorVersion === 4
      ? decodeSyncsafe(view, offset + 4)
      : view.getUint32(offset + 4);

    if (frameSize <= 0 || offset + 10 + frameSize > headerEnd) break;

    const frameData = new Uint8Array(buffer, offset + 10, frameSize);
    offset += 10 + frameSize;

    switch (frameId) {
      case 'TIT2': result.title = decodeTextFrame(frameData); break;
      case 'TPE1': result.artist = decodeTextFrame(frameData); break;
      case 'TALB': result.album = decodeTextFrame(frameData); break;
      case 'APIC': result.albumArt = decodeAPIC(frameData); break;
    }
  }

  return result;
}

function decodeSyncsafe(view: DataView, offset: number): number {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  );
}

function decodeTextFrame(data: Uint8Array): string {
  if (data.length < 2) return '';
  const encoding = data[0];
  const textBytes = data.slice(1);

  let end = textBytes.length;
  if (encoding === 1 || encoding === 2) {
    while (end >= 2 && textBytes[end - 1] === 0 && textBytes[end - 2] === 0) end -= 2;
  } else {
    while (end > 0 && textBytes[end - 1] === 0) end--;
  }
  const cleaned = textBytes.slice(0, end);

  switch (encoding) {
    case 0: return new TextDecoder('iso-8859-1').decode(cleaned);
    case 1: return new TextDecoder('utf-16').decode(cleaned);
    case 2: return new TextDecoder('utf-16be').decode(cleaned);
    case 3: return new TextDecoder('utf-8').decode(cleaned);
    default: return new TextDecoder().decode(cleaned);
  }
}

function decodeAPIC(data: Uint8Array): string | undefined {
  if (data.length < 4) return undefined;

  const encoding = data[0];
  let i = 1;

  let mime = '';
  while (i < data.length && data[i] !== 0) {
    mime += String.fromCharCode(data[i]);
    i++;
  }
  i++;

  if (i >= data.length) return undefined;
  i++; // picture type

  if (encoding === 1 || encoding === 2) {
    while (i < data.length - 1) {
      if (data[i] === 0 && data[i + 1] === 0) { i += 2; break; }
      i += 2;
    }
  } else {
    while (i < data.length && data[i] !== 0) i++;
    i++;
  }

  if (i >= data.length) return undefined;

  const imageData = data.slice(i);
  if (imageData.length < 8) return undefined;

  const blob = new Blob([imageData], { type: mime || 'image/jpeg' });
  return URL.createObjectURL(blob);
}
