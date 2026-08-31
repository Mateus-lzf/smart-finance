import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });

function zipResponse({ status = 200, contentDisposition, contentType = "application/zip" } = {}) {
  return new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
    status,
    headers: {
      "Content-Type": contentType,
      ...(contentDisposition ? { "Content-Disposition": contentDisposition } : {}),
    },
  });
}

function browserHarness(response = zipResponse()) {
  const requests = [];
  const appended = [];
  const removed = [];
  const clicked = [];
  const revoked = [];
  const anchors = [];
  const document = {
    body: {
      appendChild(anchor) {
        appended.push(anchor);
        return anchor;
      },
    },
    createElement(tag) {
      assert.equal(tag, "a");
      const anchor = {
        href: "",
        download: "",
        hidden: false,
        click() {
          clicked.push(anchor);
        },
        remove() {
          removed.push(anchor);
        },
      };
      anchors.push(anchor);
      return anchor;
    },
  };
  return {
    requests,
    appended,
    removed,
    clicked,
    revoked,
    anchors,
    dependencies: {
      fetch: async (...args) => {
        requests.push(args);
        return response;
      },
      createObjectURL(blob) {
        assert.equal(blob.type, "application/zip");
        return "blob:account-export";
      },
      revokeObjectURL(url) {
        revoked.push(url);
      },
      document,
    },
  };
}

try {
  const downloadModule = await vite.ssrLoadModule(
    "/src/lib/account-export/account-export-download-client.ts",
  );
  const validName = "smart-finance-export-v1-2026-08-31.zip";
  assert.equal(
    downloadModule.accountExportFileName(`attachment; filename="${validName}"`),
    validName,
  );
  for (const value of [
    null,
    'attachment; filename="../../forbidden.zip"',
    'attachment; filename="smart-finance-export-v1-2026-08-31.zip.exe"',
    "attachment; filename=smart-finance-export-v1-2026-08-31.zip",
  ]) {
    assert.equal(
      downloadModule.accountExportFileName(value),
      downloadModule.ACCOUNT_EXPORT_V1_FALLBACK_FILENAME,
    );
  }

  const browser = browserHarness(
    zipResponse({ contentDisposition: `attachment; filename="${validName}"` }),
  );
  const result = await downloadModule.downloadAccountExport(browser.dependencies);
  assert.deepEqual(result, { fileName: validName });
  assert.equal(browser.requests.length, 1);
  assert.equal(browser.requests[0][0], "/api/account/export");
  assert.deepEqual(browser.requests[0][1], {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/zip" },
  });
  assert.equal("body" in browser.requests[0][1], false);
  assert.doesNotMatch(JSON.stringify(browser.requests), /user_id|owner_user_id|email/i);
  assert.equal(browser.anchors[0].download, validName);
  assert.equal(browser.anchors[0].href, "blob:account-export");
  assert.equal(browser.anchors[0].hidden, true);
  assert.equal(browser.appended.length, 1);
  assert.equal(browser.clicked.length, 1);
  assert.equal(browser.removed.length, 1);
  assert.deepEqual(browser.revoked, ["blob:account-export"]);

  const fallbackBrowser = browserHarness();
  await downloadModule.downloadAccountExport(fallbackBrowser.dependencies);
  assert.equal(
    fallbackBrowser.anchors[0].download,
    downloadModule.ACCOUNT_EXPORT_V1_FALLBACK_FILENAME,
  );

  for (const [status, code] of [
    [401, "AUTHENTICATION_REQUIRED"],
    [403, "REQUEST_FORBIDDEN"],
    [413, "LIMIT_EXCEEDED"],
    [503, "UNAVAILABLE"],
  ]) {
    await assert.rejects(
      downloadModule.downloadAccountExport(browserHarness(zipResponse({ status })).dependencies),
      (error) => error instanceof downloadModule.AccountExportClientError && error.code === code,
    );
  }
  await assert.rejects(
    downloadModule.downloadAccountExport(
      browserHarness(zipResponse({ contentType: "application/json" })).dependencies,
    ),
    (error) =>
      error instanceof downloadModule.AccountExportClientError && error.code === "INVALID_RESPONSE",
  );
  await assert.rejects(
    downloadModule.downloadAccountExport({
      fetch: async () => {
        throw new Error("network details must not escape");
      },
    }),
    (error) => error instanceof downloadModule.AccountExportClientError && error.code === "NETWORK",
  );

  const [settings, component, client] = await Promise.all([
    readFile("src/routes/_authenticated/configuracoes.tsx", "utf8"),
    readFile("src/components/account/account-data-export.tsx", "utf8"),
    readFile("src/lib/account-export/account-export-download-client.ts", "utf8"),
  ]);
  assert.match(settings, /financialMode === ["']remote["'] && <AccountDataExport \/>/);
  assert.match(
    settings,
    /<Panel title=["']Armazenamento["'][\s\S]*AccountDataExport[\s\S]*<Panel title=["']Tema["']/,
  );
  assert.match(component, /if \(exportingRef\.current\) return/);
  assert.match(component, /disabled=\{exporting\}/);
  assert.match(component, /Preparando arquivo\.\.\./);
  assert.match(component, /Baixar meus dados/);
  assert.match(component, /toast\.success\(["']Download iniciado\.["']\)/);
  assert.match(component, /await refresh\(\)/);
  assert.match(component, /reason=session_expired&redirect=%2Fconfiguracoes/);
  assert.doesNotMatch(`${component}\n${client}`, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(component, /SQL|Supabase|service_role|payload/i);

  console.log("Account export client download and remote-only settings integration passed.");
} finally {
  await vite.close();
}
