import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDocumentNormalizationProfile,
  classifyFhirBundleProfile,
  classifyFhirImportProfile,
  validateFhirBundleResultProfile,
  validateFhirImportResultProfile,
  validateNormalizationProfile,
} from "../src/core/normalization-profiles";

test("normalization profile helpers classify current document and FHIR slices", () => {
  assert.equal(classifyDocumentNormalizationProfile("text/plain"), "document.text.plain.v1");
  assert.equal(classifyDocumentNormalizationProfile("text/markdown"), "document.text.markdown.v1");
  assert.equal(classifyFhirImportProfile("Binary", "inline"), "fhir.binary.inline.text.v1");
  assert.equal(
    classifyFhirImportProfile("DocumentReference", "inline"),
    "fhir.document-reference.inline.text.v1",
  );
  assert.equal(
    classifyFhirImportProfile("DocumentReference", "external"),
    "fhir.document-reference.external.text.v1",
  );
  assert.equal(classifyFhirBundleProfile("document"), "fhir.bundle.document.v1");
  assert.equal(classifyFhirBundleProfile("collection"), "fhir.bundle.collection.v1");
  assert.equal(validateNormalizationProfile("document.text.plain.v1"), "document.text.plain.v1");
  assert.equal(validateFhirImportResultProfile("fhir.binary.inline.text.v1"), "fhir.binary.inline.text.v1");
  assert.equal(validateFhirBundleResultProfile("fhir.bundle.document.v1"), "fhir.bundle.document.v1");
});