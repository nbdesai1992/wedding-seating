// Minimal, dependency-free CSV parse + serialize. Handles quoted fields,
// escaped quotes (""), commas and newlines inside quotes, and CRLF.
'use strict';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = String(text).replace(/^﻿/, ''); // strip BOM

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c === '\r') {
      // ignore; handled by \n
    } else {
      field += c;
    }
  }
  // trailing field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

// Turn CSV text into guest objects. Requires a "name" column (tolerant of
// header casing/spacing and common aliases). Optional email/notes.
function guestsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return { guests: [], error: 'The file is empty.' };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.findIndex((h) => ['name', 'guest', 'guest name', 'full name'].includes(h));
  const emailIdx = header.findIndex((h) => ['email', 'e-mail', 'email address'].includes(h));
  const notesIdx = header.findIndex((h) => ['notes', 'note', 'dietary', 'comments'].includes(h));

  if (nameIdx === -1) {
    return { guests: [], error: 'CSV must have a "name" column.' };
  }

  const guests = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const name = (cells[nameIdx] || '').trim();
    if (!name) continue;
    guests.push({
      name,
      email: emailIdx > -1 ? (cells[emailIdx] || '').trim() || null : null,
      notes: notesIdx > -1 ? (cells[notesIdx] || '').trim() || null : null,
    });
  }
  if (guests.length === 0) return { guests: [], error: 'No guest rows found under the "name" column.' };
  return { guests, error: null };
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}

module.exports = { parseCsv, guestsFromCsv, toCsv };
