export function protectCsvText(value: string) {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

export function escapeCsvText(value: string) {
  const protectedValue = protectCsvText(value);
  return /[;"\r\n]|^\s|\s$/.test(protectedValue)
    ? `"${protectedValue.replace(/"/g, '""')}"`
    : protectedValue;
}

export function serializeCsvRow(values: readonly string[]) {
  return values.map(escapeCsvText).join(";");
}

export function serializeCsv(headers: readonly string[], rows: readonly (readonly string[])[]) {
  return `\uFEFF${[serializeCsvRow(headers), ...rows.map(serializeCsvRow)].join("\r\n")}`;
}
