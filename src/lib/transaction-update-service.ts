import type {
  ColumnMapping,
  ImportPreview,
  ImportProfile,
  PossibleDuplicateGroup,
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
  return [transactionIdentity(transaction), transaction.amount.toFixed(2)].join("|");
}

export function transactionContentFingerprint(transaction: Transaction) {
  const additional = Object.entries(transaction.additionalData ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `${transactionFingerprint(transaction)}|${JSON.stringify(additional)}`;
}

export function groupPossibleDuplicates(rows: Transaction[]): PossibleDuplicateGroup[] {
  const groups = new Map<string, Transaction[]>();
  rows.forEach((row) => {
    const fingerprint = transactionContentFingerprint(row);
    groups.set(fingerprint, [...(groups.get(fingerprint) ?? []), row]);
  });
  return [...groups.entries()]
    .filter(([, occurrences]) => occurrences.length > 1)
    .map(([fingerprint, occurrences]) => ({
      fingerprint,
      transaction: occurrences[0]!,
      occurrences: occurrences.length,
    }));
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

  const profileColumns =
    profile.columns ?? profile.headers.map((header, index) => ({ id: header, header, index }));
  return Object.fromEntries(
    importFields.map(({ key }) => {
      const previousColumn = profileColumns.find(({ id }) => id === profile.mapping[key]);
      const previousHeader = previousColumn?.header ?? profile.mapping[key];
      const column = preview.columns.find(
        (candidate) =>
          normalizeImportHeader(candidate.header) === normalizeImportHeader(previousHeader),
      );
      return [key, column?.id ?? preview.mapping[key]];
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
  const duplicateFingerprints = new Set(
    groupPossibleDuplicates(imported).map((group) => group.fingerprint),
  );
  const possibleDuplicates = imported.filter((row) =>
    duplicateFingerprints.has(transactionContentFingerprint(row)),
  );

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
        (row) => transactionContentFingerprint(row) === transactionContentFingerprint(incoming),
      );
      if (oldIndex >= 0) {
        const existing = oldRows.splice(oldIndex, 1)[0]!;
        newRows.splice(index, 1);
        unchanged.push(existing);
        resolvedByImportedId.set(incoming.id, existing);
      }
    }

    oldRows.sort((a, b) =>
      transactionContentFingerprint(a).localeCompare(transactionContentFingerprint(b)),
    );
    newRows.sort((a, b) =>
      transactionContentFingerprint(a).localeCompare(transactionContentFingerprint(b)),
    );
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
