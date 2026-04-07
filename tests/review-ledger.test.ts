import assert from "node:assert/strict";
import test from "node:test";
import {
  createCase,
  addArtifact,
  draftPhysicianPacket,
  finalizePhysicianPacket,
  submitReview,
  type AnamnesisCase,
} from "../src/domain/anamnesis";
import {
  API_CREATE_CASE_BODY,
  API_SUBMIT_REVIEW_BODY,
  APPROVED_REVIEW_INPUT,
  CHANGES_REQUESTED_REVIEW_INPUT,
  GENERAL_INTAKE_INPUT,
  LAB_ARTIFACT_INPUT,
  NOTE_ARTIFACT_INPUT,
  REJECTED_REVIEW_INPUT,
} from "./fixtures";
import { jsonRequest, withServer } from "./helpers";

function seedCaseWithPacket(): {
  record: AnamnesisCase;
  packetId: string;
} {
  let record = createCase({
    ...GENERAL_INTAKE_INPUT,
    patientLabel: "review-test",
    intake: {
      ...GENERAL_INTAKE_INPUT.intake,
      chiefConcern: "Recurring headache",
      symptomSummary: "Headaches have intensified over the past two weeks.",
      historySummary: "No prior neurological workup.",
      questionsForClinician: ["Should an MRI be considered?"],
    },
  });

  record = addArtifact(record, {
    ...NOTE_ARTIFACT_INPUT,
    title: "Initial triage note",
    summary: "Patient reported onset approximately two weeks ago.",
  });

  const { nextCase, packet } = draftPhysicianPacket(record, {
    requestedBy: "triage-nurse@example.test",
  });

  return { record: nextCase, packetId: packet.packetId };
}

// ---------------------------------------------------------------------------
// Domain unit tests
// ---------------------------------------------------------------------------

test("submitReview creates a review entry and transitions packet to CLINICIAN_APPROVED", () => {
  const { record, packetId } = seedCaseWithPacket();
  const { nextCase, review } = submitReview(record, packetId, {
    ...APPROVED_REVIEW_INPUT,
    reviewerName: "Dr. Ada",
    comments: "Looks correct. Proceed with MRI referral.",
  });

  assert.equal(review.reviewerName, "Dr. Ada");
  assert.equal(review.action, "approved");
  assert.equal(review.comments, "Looks correct. Proceed with MRI referral.");
  assert.match(review.createdAt, /^\d{4}-\d{2}-\d{2}T/);

  const packet = nextCase.physicianPackets.find((p) => p.packetId === packetId)!;
  assert.equal(packet.status, "CLINICIAN_APPROVED");
  assert.equal(packet.reviews.length, 1);
  assert.equal(packet.reviews[0]!.reviewId, review.reviewId);
});

test("submitReview transitions packet to CHANGES_REQUESTED", () => {
  const { record, packetId } = seedCaseWithPacket();
  const { nextCase } = submitReview(record, packetId, {
    ...CHANGES_REQUESTED_REVIEW_INPUT,
    reviewerName: "Dr. Babbage",
    comments: "Please add the lab panel before proceeding.",
  });

  const packet = nextCase.physicianPackets.find((p) => p.packetId === packetId)!;
  assert.equal(packet.status, "CHANGES_REQUESTED");
});

test("submitReview transitions packet to REJECTED", () => {
  const { record, packetId } = seedCaseWithPacket();
  const { nextCase } = submitReview(record, packetId, {
    ...REJECTED_REVIEW_INPUT,
    reviewerName: "Dr. Curie",
    comments: "Insufficient evidence for triage.",
  });

  const packet = nextCase.physicianPackets.find((p) => p.packetId === packetId)!;
  assert.equal(packet.status, "REJECTED");
});

test("submitReview allows comments to be omitted", () => {
  const { record, packetId } = seedCaseWithPacket();
  const { review } = submitReview(record, packetId, {
    ...APPROVED_REVIEW_INPUT,
    reviewerName: "Dr. Darwin",
    comments: undefined,
  });

  assert.equal(review.comments, undefined);
});

test("submitReview rejects review on an already-approved packet", () => {
  const { record, packetId } = seedCaseWithPacket();
  const { nextCase } = submitReview(record, packetId, {
    ...APPROVED_REVIEW_INPUT,
    reviewerName: "Dr. Euler",
  });

  assert.throws(
    () =>
      submitReview(nextCase, packetId, {
        ...CHANGES_REQUESTED_REVIEW_INPUT,
        reviewerName: "Dr. Fermat",
      }),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, "packet_already_approved");
      return true;
    },
  );
});

test("submitReview rejects review on a finalized packet", () => {
  const { record, packetId } = seedCaseWithPacket();
  const approved = submitReview(record, packetId, {
    ...APPROVED_REVIEW_INPUT,
    reviewerName: "Dr. Noether",
  });
  const finalized = finalizePhysicianPacket(approved.nextCase, packetId, {
    finalizedBy: "Dr. Noether",
  });

  assert.throws(
    () =>
      submitReview(finalized.nextCase, packetId, {
        ...CHANGES_REQUESTED_REVIEW_INPUT,
        reviewerName: "Dr. Turing",
      }),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, "packet_already_finalized");
      return true;
    },
  );
});

test("submitReview allows multiple reviews on a changes_requested packet", () => {
  const { record, packetId } = seedCaseWithPacket();
  const first = submitReview(record, packetId, {
    ...CHANGES_REQUESTED_REVIEW_INPUT,
    reviewerName: "Dr. Gauss",
    comments: "Need more context on the pain location.",
  });

  const second = submitReview(first.nextCase, packetId, {
    ...APPROVED_REVIEW_INPUT,
    reviewerName: "Dr. Hilbert",
    comments: "Now looks complete.",
  });

  const packet = second.nextCase.physicianPackets.find((p) => p.packetId === packetId)!;
  assert.equal(packet.reviews.length, 2);
  assert.equal(packet.status, "CLINICIAN_APPROVED");
});

test("submitReview throws when packet does not exist", () => {
  const { record } = seedCaseWithPacket();
  assert.throws(
    () =>
      submitReview(record, "nonexistent-packet-id", {
        ...APPROVED_REVIEW_INPUT,
        reviewerName: "Dr. Klein",
      }),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, "packet_not_found");
      return true;
    },
  );
});

test("physician packet starts with an empty reviews array", () => {
  const { record, packetId } = seedCaseWithPacket();
  const packet = record.physicianPackets.find((p) => p.packetId === packetId)!;
  assert.deepStrictEqual(packet.reviews, []);
});

// ---------------------------------------------------------------------------
// API integration tests
// ---------------------------------------------------------------------------

async function createCaseWithPacket(baseUrl: string) {
  const caseResponse = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
    method: "POST",
    body: {
      ...API_CREATE_CASE_BODY,
      patientLabel: "api-review-test",
      intake: {
        ...API_CREATE_CASE_BODY.intake,
        chiefConcern: "Chronic fatigue",
        symptomSummary: "Persistent fatigue lasting over three weeks.",
        historySummary: "Recent blood panel was unremarkable.",
        questionsForClinician: ["Could this be thyroid-related?"],
      },
    },
  });
  const caseId = caseResponse.body.case.caseId;

  await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
    method: "POST",
    body: {
      ...LAB_ARTIFACT_INPUT,
      title: "Complete blood panel",
      summary: "All markers within normal range.",
      sourceDate: "2026-03-30",
    },
  });

  const packetResponse = await jsonRequest<{
    packet: { packetId: string };
  }>(baseUrl, `/api/cases/${caseId}/physician-packets`, {
    method: "POST",
    body: { requestedBy: "intake-nurse@example.test" },
  });

  return { caseId, packetId: packetResponse.body.packet.packetId };
}

test("POST review returns 201 and the created review entry", async () => {
  await withServer(async (baseUrl) => {
    const { caseId, packetId } = await createCaseWithPacket(baseUrl);

    const response = await jsonRequest<{
      review: { reviewId: string; reviewerName: string; action: string; comments: string };
    }>(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/reviews`, {
      method: "POST",
      body: {
        ...API_SUBMIT_REVIEW_BODY,
        reviewerName: "Dr. Lovelace",
        comments: "Evidence is sufficient.",
      },
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.review.reviewerName, "Dr. Lovelace");
    assert.equal(response.body.review.action, "approved");
    assert.equal(response.body.review.comments, "Evidence is sufficient.");
    assert.ok(response.body.review.reviewId);
  });
});

test("GET reviews returns the ledger for a specific packet", async () => {
  await withServer(async (baseUrl) => {
    const { caseId, packetId } = await createCaseWithPacket(baseUrl);

    await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/reviews`, {
      method: "POST",
      body: {
        ...CHANGES_REQUESTED_REVIEW_INPUT,
        reviewerName: "Dr. Maxwell",
        comments: "Add imaging.",
      },
    });

    await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/reviews`, {
      method: "POST",
      body: {
        ...API_SUBMIT_REVIEW_BODY,
        reviewerName: "Dr. Newton",
        comments: undefined,
      },
    });

    const response = await jsonRequest<{
      reviews: Array<{ reviewerName: string; action: string }>;
      meta: { totalReviews: number; packetStatus: string };
    }>(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/reviews`);

    assert.equal(response.status, 200);
    assert.equal(response.body.reviews.length, 2);
    assert.equal(response.body.meta.totalReviews, 2);
    assert.equal(response.body.meta.packetStatus, "CLINICIAN_APPROVED");
    assert.equal(response.body.reviews[0]?.reviewerName, "Dr. Maxwell");
    assert.equal(response.body.reviews[1]?.reviewerName, "Dr. Newton");
  });
});

test("POST review returns 404 for a non-existent case", async () => {
  await withServer(async (baseUrl) => {
    const response = await jsonRequest<{ code: string }>(
      baseUrl,
      "/api/cases/no-such-case/physician-packets/no-packet/reviews",
      {
        method: "POST",
        body: {
          ...API_SUBMIT_REVIEW_BODY,
          reviewerName: "Dr. Planck",
        },
      },
    );

    assert.equal(response.status, 404);
    assert.equal(response.body.code, "case_not_found");
  });
});

test("POST review returns 404 for a non-existent packet", async () => {
  await withServer(async (baseUrl) => {
    const caseResponse = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        ...API_CREATE_CASE_BODY,
        patientLabel: "packet-404-test",
        intake: {
          ...API_CREATE_CASE_BODY.intake,
          chiefConcern: "Test concern",
          symptomSummary: "Test symptom.",
          historySummary: "Test history.",
          questionsForClinician: [],
        },
      },
    });

    const response = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseResponse.body.case.caseId}/physician-packets/nonexistent/reviews`,
      {
        method: "POST",
        body: {
          ...API_SUBMIT_REVIEW_BODY,
          reviewerName: "Dr. Riemann",
        },
      },
    );

    assert.equal(response.status, 404);
    assert.equal(response.body.code, "packet_not_found");
  });
});

test("POST review rejects invalid action values", async () => {
  await withServer(async (baseUrl) => {
    const { caseId, packetId } = await createCaseWithPacket(baseUrl);

    const response = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets/${packetId}/reviews`,
      {
        method: "POST",
        body: {
          ...API_SUBMIT_REVIEW_BODY,
          reviewerName: "Dr. Turing",
          action: "maybe",
        },
      },
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "invalid_input");
  });
});

test("POST review rejects missing reviewerName", async () => {
  await withServer(async (baseUrl) => {
    const { caseId, packetId } = await createCaseWithPacket(baseUrl);

    const response = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets/${packetId}/reviews`,
      {
        method: "POST",
        body: { action: "approved" },
      },
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "invalid_input");
  });
});

test("POST review returns 409 when the packet is already approved", async () => {
  await withServer(async (baseUrl) => {
    const { caseId, packetId } = await createCaseWithPacket(baseUrl);

    await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/reviews`, {
      method: "POST",
      body: {
        ...API_SUBMIT_REVIEW_BODY,
        reviewerName: "Dr. Watt",
      },
    });

    const response = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets/${packetId}/reviews`,
      {
        method: "POST",
        body: {
          ...CHANGES_REQUESTED_REVIEW_INPUT,
          reviewerName: "Dr. Young",
          comments: undefined,
        },
      },
    );

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "packet_already_approved");
  });
});

test("GET reviews returns 404 for a non-existent packet", async () => {
  await withServer(async (baseUrl) => {
    const caseResponse = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        ...API_CREATE_CASE_BODY,
        patientLabel: "get-reviews-404",
        intake: {
          ...API_CREATE_CASE_BODY.intake,
          chiefConcern: "Test",
          symptomSummary: "Test.",
          historySummary: "Test.",
          questionsForClinician: [],
        },
      },
    });

    const response = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseResponse.body.case.caseId}/physician-packets/nonexistent/reviews`,
    );

    assert.equal(response.status, 404);
    assert.equal(response.body.code, "packet_not_found");
  });
});

test("reviews metric appears in /metrics output after a review is submitted", async () => {
  await withServer(async (baseUrl) => {
    const { caseId, packetId } = await createCaseWithPacket(baseUrl);

    await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/reviews`, {
      method: "POST",
      body: {
        ...API_SUBMIT_REVIEW_BODY,
        reviewerName: "Dr. Zeno",
      },
    });

    const metricsResponse = await fetch(`${baseUrl}/metrics`);
    const body = await metricsResponse.text();

    assert.ok(body.includes("anamnesis_reviews_total 1"));
  });
});
