/* xlsx-mini — minimal, dependency-free .xlsx writer.
   Builds an OOXML SpreadsheetML workbook inside a STORED (uncompressed) ZIP.
   sheets: [{name, rows: [[cell, ...], ...], widths?: [n, ...]}]
   Cells may be string | number | null | undefined | {v, bold}.
   Returns a Uint8Array. Works in browsers and in Node (needs TextEncoder). */
function xlsxMini(sheets) {
  var enc = new TextEncoder();

  var esc = function (s) {
    return String(s)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "") // control chars illegal in XML 1.0
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  };

  var colName = function (n) { // 0 -> A
    var s = "";
    for (n = n + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };

  var safeName = function (n, i) {
    var cleaned = String(n || ("Sheet" + (i + 1))).replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31).trim();
    return cleaned || ("Sheet" + (i + 1));
  };

  var sheetXml = function (sheet) {
    var cols = (sheet.widths && sheet.widths.length)
      ? "<cols>" + sheet.widths.map(function (w, i) {
          return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
        }).join("") + "</cols>"
      : "";
    var rows = sheet.rows.map(function (row, r) {
      var cells = row.map(function (raw, c) {
        var cell = (raw && typeof raw === "object") ? raw : { v: raw };
        var v = cell.v;
        if (v === null || v === undefined || v === "") return "";
        var ref = colName(c) + (r + 1);
        var style = cell.bold ? ' s="1"' : "";
        if (typeof v === "number" && isFinite(v)) return '<c r="' + ref + '"' + style + "><v>" + v + "</v></c>";
        return '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + "</t></is></c>";
      }).join("");
      return '<row r="' + (r + 1) + '">' + cells + "</row>";
    }).join("");
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + cols + "<sheetData>" + rows + "</sheetData></worksheet>";
  };

  var files = [];
  files.push(["[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + sheets.map(function (_, i) {
        return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join("")
    + "</Types>"]);
  files.push(["_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + "</Relationships>"]);
  files.push(["xl/workbook.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + "<sheets>" + sheets.map(function (s, i) {
        return '<sheet name="' + esc(safeName(s.name, i)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      }).join("") + "</sheets>"
    + "</workbook>"]);
  files.push(["xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheets.map(function (_, i) {
        return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      }).join("")
    + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + "</Relationships>"]);
  files.push(["xl/styles.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    + "<borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders>"
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="2">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + "</cellXfs>"
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + "</styleSheet>"]);
  sheets.forEach(function (s, i) { files.push(["xl/worksheets/sheet" + (i + 1) + ".xml", sheetXml(s)]); });

  // --- CRC32 ---
  var table = xlsxMini._crcTable;
  if (!table) {
    table = xlsxMini._crcTable = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
  }
  var crc32 = function (bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };

  // --- ZIP (STORED, no compression) ---
  var parts = [], central = [], offset = 0;
  var u16 = function (n) { return [n & 0xFF, (n >>> 8) & 0xFF]; };
  var u32 = function (n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; };

  files.forEach(function (f) {
    var nameBytes = enc.encode(f[0]);
    var body = enc.encode(f[1]);
    var crc = crc32(body);
    var local = [].concat(
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(body.length), u32(body.length),
      u16(nameBytes.length), u16(0)
    );
    parts.push(new Uint8Array(local), nameBytes, body);
    central.push([[].concat(
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(body.length), u32(body.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)
    ), nameBytes]);
    offset += local.length + nameBytes.length + body.length;
  });

  var centralParts = [], centralSize = 0;
  central.forEach(function (e) {
    centralParts.push(new Uint8Array(e[0]), e[1]);
    centralSize += e[0].length + e[1].length;
  });
  var eocd = new Uint8Array([].concat(
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralSize), u32(offset), u16(0)
  ));

  var all = parts.concat(centralParts, [eocd]);
  var total = all.reduce(function (n, p) { return n + p.length; }, 0);
  var out = new Uint8Array(total), pos = 0;
  all.forEach(function (p) { out.set(p, pos); pos += p.length; });
  return out;
}
if (typeof module !== "undefined" && module.exports) module.exports = xlsxMini;
