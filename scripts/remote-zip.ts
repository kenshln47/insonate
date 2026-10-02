import { inflateRawSync } from "node:zlib";

/**
 * Read single entries out of a huge remote ZIP (ZIP64 aware) with HTTP range
 * requests, so one CT case can be taken from a 22 GB archive without
 * downloading the rest.
 */

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

async function range(url: string, start: number, endInclusive: number): Promise<Buffer> {
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${endInclusive}` } });
  if (response.status !== 206 && response.status !== 200) {
    throw new Error(`Range request failed (${response.status}) for ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (response.status === 200 && start > 0) throw new Error("Server ignored the Range header");
  return bytes;
}

async function suffix(url: string, length: number): Promise<{ bytes: Buffer; total: number }> {
  const response = await fetch(url, { headers: { Range: `bytes=-${length}` } });
  if (response.status !== 206) throw new Error(`Suffix range request failed (${response.status})`);
  const contentRange = response.headers.get("content-range") ?? "";
  const total = Number(contentRange.split("/")[1]);
  if (!Number.isFinite(total)) throw new Error(`Unexpected Content-Range: ${contentRange}`);
  return { bytes: Buffer.from(await response.arrayBuffer()), total };
}

function readU64(buffer: Buffer, offset: number): number {
  const value = buffer.readBigUInt64LE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("ZIP offset too large");
  return Number(value);
}

/** List every entry in the remote archive's central directory. */
export async function listRemoteZip(url: string): Promise<ZipEntry[]> {
  const { bytes: tail, total } = await suffix(url, 65_536 + 22);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("End of central directory not found");
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    const locator = eocd - 20;
    if (tail.readUInt32LE(locator) !== 0x07064b50) throw new Error("ZIP64 locator not found");
    const zip64Offset = readU64(tail, locator + 8);
    const tailStart = total - tail.length;
    const record = zip64Offset >= tailStart ? tail.subarray(zip64Offset - tailStart) : await range(url, zip64Offset, zip64Offset + 55);
    if (record.readUInt32LE(0) !== 0x06064b50) throw new Error("ZIP64 end record not found");
    cdSize = readU64(record, 40);
    cdOffset = readU64(record, 48);
  }
  const cd = await range(url, cdOffset, cdOffset + cdSize - 1);
  const entries: ZipEntry[] = [];
  let p = 0;
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
    const method = cd.readUInt16LE(p + 10);
    let compressedSize = cd.readUInt32LE(p + 20);
    let size = cd.readUInt32LE(p + 24);
    const nameLength = cd.readUInt16LE(p + 28);
    const extraLength = cd.readUInt16LE(p + 30);
    const commentLength = cd.readUInt16LE(p + 32);
    let localHeaderOffset = cd.readUInt32LE(p + 42);
    const name = cd.toString("utf8", p + 46, p + 46 + nameLength);
    let e = p + 46 + nameLength;
    const extraEnd = e + extraLength;
    while (e + 4 <= extraEnd) {
      const id = cd.readUInt16LE(e);
      const length = cd.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) {
          size = readU64(cd, q);
          q += 8;
        }
        if (compressedSize === 0xffffffff) {
          compressedSize = readU64(cd, q);
          q += 8;
        }
        if (localHeaderOffset === 0xffffffff) localHeaderOffset = readU64(cd, q);
      }
      e += 4 + length;
    }
    entries.push({ name, method, compressedSize, size, localHeaderOffset });
    p = extraEnd + commentLength;
  }
  return entries;
}

/** Download and decompress one entry. */
export async function readRemoteEntry(url: string, entry: ZipEntry): Promise<Buffer> {
  const header = await range(url, entry.localHeaderOffset, entry.localHeaderOffset + 29);
  if (header.readUInt32LE(0) !== 0x04034b50) throw new Error(`Bad local header for ${entry.name}`);
  const dataStart = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const data = await range(url, dataStart, dataStart + entry.compressedSize - 1);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
}
