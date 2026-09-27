const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Check the ZIP directory without extracting or executing workbook content.
// Cell parsing and business validation are deliberately deferred.
function validateWorkbook(filename, buffer) {
  if (typeof filename !== 'string' || !filename.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Please upload an Excel .xlsx workbook.');
  }
  if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error('Please choose a nonempty workbook up to 10 MB.');
  }
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('This file is not a valid Excel .xlsx package.');
  }

  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error('The workbook appears incomplete or damaged.');
  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const directoryEnd = offset + buffer.readUInt32LE(end + 12);
  if (directoryEnd !== end) throw new Error('Unsupported Excel package. Please save it again as .xlsx.');
  const names = new Set();
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > directoryEnd || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('The workbook directory is damaged.');
    }
    if (buffer.readUInt16LE(offset + 8) & 1) throw new Error('Password-protected workbooks are not supported.');
    const nameLength = buffer.readUInt16LE(offset + 28);
    const next = offset + 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    if (next > directoryEnd) throw new Error('The workbook directory is damaged.');
    names.add(buffer.toString('utf8', offset + 46, offset + 46 + nameLength));
    offset = next;
  }
  if (offset !== directoryEnd || !['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml'].every(name => names.has(name))) {
    throw new Error('This file is not an Excel .xlsx workbook.');
  }
}

module.exports = { MAX_UPLOAD_BYTES, validateWorkbook };
