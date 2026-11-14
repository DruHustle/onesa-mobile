import { DomainError } from "../platform/model.ts";

// This is the proposed Onesa-side lifecycle for a synthetic provider replay.
// Provider-specific credentials, event envelopes and ordering are still unconfirmed.
export const qualificationSteps = ["submit", "timeout", "approve", "reject", "reconcile", "cancel"] as const;
export type QualificationStep = (typeof qualificationSteps)[number];
export type QualificationState = "submitted" | "uncertain" | "approved" | "rejected" | "cancelled";
export interface Qualification {
  reference: string;
  state: QualificationState;
  sequence: number;
  eligibility: "fixture_compatible" | "fixture_device_unsupported";
}

export function applyQualificationStep(
  applicationId: string,
  deviceModel: unknown,
  simFormat: unknown,
  previous: Qualification | undefined,
  step: QualificationStep,
  sequence: number | undefined,
): Qualification {
  if (!previous) {
    if (step !== "submit") throw new DomainError(409, "QUALIFICATION_NOT_SUBMITTED", "Submit the pilot application to the fixture first.");
    const compatible = deviceModel === "OM Test Handset 1" && simFormat === "physical"
      || deviceModel === "OM Test eSIM Handset 1" && simFormat === "esim";
    return {
      reference: "fixture-" + applicationId,
      state: compatible ? "submitted" : "rejected",
      eligibility: compatible ? "fixture_compatible" : "fixture_device_unsupported",
      sequence: 0,
    };
  }
  if (step === "submit") return previous;
  if (step === "approve" || step === "reject" || step === "reconcile") {
    if (sequence === undefined) throw new DomainError(400, "QUALIFICATION_SEQUENCE_REQUIRED", "Supply the simulated provider status revision.");
    if (sequence <= previous.sequence) return previous;
  }
  if (["approved", "rejected", "cancelled"].includes(previous.state)) return previous;
  const state = { approve: "approved", reject: "rejected", reconcile: "approved", cancel: "cancelled", timeout: "uncertain" } as const;
  return { ...previous, state: state[step], sequence: sequence ?? previous.sequence };
}
