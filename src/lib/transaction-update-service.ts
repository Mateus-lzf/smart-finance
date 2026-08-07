import type {
  ColumnMapping,
  ImportPreview,
  ImportProfile,
  Transaction,
  TransactionUpdateComparison,
} from "./finance-types";
import { importFields, normalizeImportHeader } from "./import-service";

function normalizeText(value: string) {
  return normalizeImportHeader(value);
}

export function transactionIdentity(transaction: Transaction) {
  return [
    transaction.date,
    normalizeText(transaction.description),
    normalizeText(transaction.category),
    transaction.type,
  ].join("|");
}

export function transactionFingerprint(transaction: Transaction) {
  return [
    transactionIdentity(transaction),
    transaction.amount.toFixed(2),
    normalizeText(transaction.method),
    transaction.status,
  ].join("|");
}

export function reuseImportMapping(
  preview: ImportPreview,
  profile?: ImportProfile | null,
): ColumnMapping {
  if (!profile) return preview.mapping;
  const current = preview.headers.map(normalizeImportHeader).sort();
  const previous = profile.headers.map(normalizeImportHeader).sort();
  if (
    current.length !== previous.length ||
    current.some((header, index) => header !== previous[index])
  ) {
    return preview.mapping;
  }

  return Object.fromEntries(
    importFields.map(({ key }) => {
      const previousHeader = profile.mapping[key];
      const header = preview.headers.find(
        (candidate) => normalizeImportHeader(candidate) === normalizeImportHeader(previousHeader),
      );
      return [key, header ?? preview.mapping[key]];
    }),
  ) as ColumnMapping;
}

function groupByIdentity(rows: Transaction[]) {
  const groups = new Map<string, Transaction[]>();
  rows.forEach((row) => {
    const key = transactionIdentity(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  return groups;
}

export function compareTransactionUpdates(
  current: Transaction[],
  imported: Transaction[],
): TransactionUpdateComparison {
  const seenFingerprints = new Set<string>();
  const possibleDuplicates: Transaction[] = [];
  imported.forEach((row) => {
    const fingerprint = transactionFingerprint(row);
    if (seenFingerprints.has(fingerprint)) {
      possibleDuplicates.push(row);
    } else {
      seenFingerprints.add(fingerprint);
    }
  });

  const currentGroups = groupByIdentity(current);
  const importedGroups = groupByIdentity(imported);
  const added: Transaction[] = [];
  const changed: TransactionUpdateComparison["changed"] = [];
  const unchanged: Transaction[] = [];
  const removed: Transaction[] = [];
  const resolvedByImportedId = new Map<string, Transaction>();
  const identities = new Set([...currentGroups.keys(), ...importedGroups.keys()]);

  identities.forEach((identity) => {
    const oldRows = [...(currentGroups.get(identity) ?? [])];
    const newRows = [...(importedGroups.get(identity) ?? [])];

    for (let index = newRows.length - 1; index >= 0; index -= 1) {
      const incoming = newRows[index]!;
      const oldIndex = oldRows.findIndex(
        (row) => transactionFingerprint(row) === transactionFingerprint(incoming),
      );
      if (oldIndex >= 0) {
        const existing = oldRows.splice(oldIndex, 1)[0]!;
        newRows.splice(index, 1);
        unchanged.push(existing);
        resolvedByImportedId.set(incoming.id, existing);
      }
    }

    oldRows.sort((a, b) => transactionFingerprint(a).localeCompare(transactionFingerprint(b)));
    newRows.sort((a, b) => transactionFingerprint(a).localeCompare(transactionFingerprint(b)));
    while (oldRows.length && newRows.length) {
      const before = oldRows.shift()!;
      const incoming = newRows.shift()!;
      const after = { ...incoming, id: before.id };
      changed.push({ before, after });
      resolvedByImportedId.set(incoming.id, after);
    }
    newRows.forEach((row) => {
      added.push(row);
      resolvedByImportedId.set(row.id, row);
    });
    removed.push(...oldRows);
  });

  return {
    added,
    changed,
    unchanged,
    removed,
    possibleDuplicates,
    nextTransactions: imported.map((row) => resolvedByImportedId.get(row.id) ?? row),
  };
}
