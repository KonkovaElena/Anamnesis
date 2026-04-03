import assert from "node:assert/strict";
import test from "node:test";

interface AttachmentFetchView {
  contentType: string;
  content: string;
}

type HttpExternalAttachmentFetcherCtor = new (options?: {
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  lookupImplementation?: (
    hostname: string,
    options: { all: true; verbatim: true },
  ) => Promise<Array<{ address: string; family: number }>>;
}) => {
  fetchAttachment(url: string): Promise<AttachmentFetchView>;
};

async function loadHttpExternalAttachmentFetcher(): Promise<HttpExternalAttachmentFetcherCtor> {
  const moduleNamespace = (await import("../src/infrastructure/HttpExternalAttachmentFetcher")) as Record<string, unknown>;
  const HttpExternalAttachmentFetcher = moduleNamespace.HttpExternalAttachmentFetcher;
  assert.equal(
    typeof HttpExternalAttachmentFetcher,
    "function",
    "HttpExternalAttachmentFetcher export missing",
  );
  return HttpExternalAttachmentFetcher as HttpExternalAttachmentFetcherCtor;
}

test("HttpExternalAttachmentFetcher rejects non-https URLs before issuing a fetch", async () => {
  const HttpExternalAttachmentFetcher = await loadHttpExternalAttachmentFetcher();
  let called = false;

  const fetcher = new HttpExternalAttachmentFetcher({
    fetchImplementation: async () => {
      called = true;
      return new Response("ignored", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    },
  });

  await assert.rejects(
    () => fetcher.fetchAttachment("http://example.test/file.txt"),
    /https/i,
  );
  assert.equal(called, false);
});

test("HttpExternalAttachmentFetcher resolves bounded text responses", async () => {
  const HttpExternalAttachmentFetcher = await loadHttpExternalAttachmentFetcher();

  const fetcher = new HttpExternalAttachmentFetcher({
    maxBytes: 1024,
    lookupImplementation: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImplementation: async () =>
      new Response("Fetched attachment body", {
        status: 200,
        headers: { "content-type": "text/plain; charset=UTF-8" },
      }),
  });

  const result = await fetcher.fetchAttachment("https://example.test/file.txt");
  assert.equal(result.contentType, "text/plain");
  assert.equal(result.content, "Fetched attachment body");
});

test("HttpExternalAttachmentFetcher rejects unsupported response content types", async () => {
  const HttpExternalAttachmentFetcher = await loadHttpExternalAttachmentFetcher();

  const fetcher = new HttpExternalAttachmentFetcher({
    lookupImplementation: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImplementation: async () =>
      new Response("{\"ok\":true}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });

  await assert.rejects(
    () => fetcher.fetchAttachment("https://example.test/file.json"),
    /content type/i,
  );
});

test("HttpExternalAttachmentFetcher rejects localhost hostnames before issuing a fetch", async () => {
  const HttpExternalAttachmentFetcher = await loadHttpExternalAttachmentFetcher();
  let called = false;

  const fetcher = new HttpExternalAttachmentFetcher({
    fetchImplementation: async () => {
      called = true;
      return new Response("ignored", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    },
  });

  await assert.rejects(
    () => fetcher.fetchAttachment("https://localhost/file.txt"),
    /private|local|metadata|special-use/i,
  );
  assert.equal(called, false);
});

test("HttpExternalAttachmentFetcher rejects private IP literals before issuing a fetch", async () => {
  const HttpExternalAttachmentFetcher = await loadHttpExternalAttachmentFetcher();
  let called = false;

  const fetcher = new HttpExternalAttachmentFetcher({
    fetchImplementation: async () => {
      called = true;
      return new Response("ignored", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    },
  });

  await assert.rejects(
    () => fetcher.fetchAttachment("https://127.0.0.1/file.txt"),
    /private|local|metadata|special-use/i,
  );
  assert.equal(called, false);
});

test("HttpExternalAttachmentFetcher rejects hosts that resolve to private or metadata addresses", async () => {
  const HttpExternalAttachmentFetcher = await loadHttpExternalAttachmentFetcher();
  let called = false;

  const fetcher = new HttpExternalAttachmentFetcher({
    lookupImplementation: async () => [{ address: "169.254.169.254", family: 4 }],
    fetchImplementation: async () => {
      called = true;
      return new Response("ignored", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    },
  });

  await assert.rejects(
    () => fetcher.fetchAttachment("https://example.test/file.txt"),
    /private|local|metadata|special-use/i,
  );
  assert.equal(called, false);
});