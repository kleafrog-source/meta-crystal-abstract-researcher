import { deflateRawSync, inflateRawSync } from "node:zlib";

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function createZip(files: Array<{ name: string; content: string }>): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name.replaceAll("\\", "/"), "utf8"); const data = Buffer.from(file.content, "utf8"); const packed = deflateRawSync(data); const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); name.copy(local, 30); locals.push(local, packed);
    const central = Buffer.alloc(46 + name.length); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42); name.copy(central, 46); centrals.push(central); offset += local.length + packed.length;
  }
  const centralBody = Buffer.concat(centrals); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralBody.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBody, end]);
}
export function readZip(buffer: Buffer): Array<{ name: string; content: string }> {
  const minimum = Math.max(0, buffer.length - 65557); const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06]); const eocd = buffer.lastIndexOf(signature);
  if (eocd < minimum) throw new Error("ZIP-архив повреждён: не найден каталог файлов.");
  const count = buffer.readUInt16LE(eocd + 10); let offset = buffer.readUInt32LE(eocd + 16); const files = [] as Array<{ name: string; content: string }>;
  if (count > 10000) throw new Error("В ZIP слишком много файлов.");
  let totalUncompressed = 0;
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP-архив содержит некорректную запись.");
    const method = buffer.readUInt16LE(offset + 10); const compressedSize = buffer.readUInt32LE(offset + 20); const uncompressedSize = buffer.readUInt32LE(offset + 24); const nameLength = buffer.readUInt16LE(offset + 28); const extraLength = buffer.readUInt16LE(offset + 30); const commentLength = buffer.readUInt16LE(offset + 32); const localOffset = buffer.readUInt32LE(offset + 42);
    totalUncompressed += uncompressedSize; if (totalUncompressed > 50 * 1024 * 1024) throw new Error("Распакованный ZIP превышает 50 МБ.");
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("ZIP-архив содержит некорректный локальный заголовок.");
    const localNameLength = buffer.readUInt16LE(localOffset + 26); const localExtraLength = buffer.readUInt16LE(localOffset + 28); const dataOffset = localOffset + 30 + localNameLength + localExtraLength; const packed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    if (!name.endsWith("/")) { const content = method === 0 ? packed : method === 8 ? inflateRawSync(packed) : null; if (!content) throw new Error(`Метод сжатия ZIP не поддерживается: ${method}.`); files.push({ name, content: content.toString("utf8") }); }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
