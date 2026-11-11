/** A successful HTTP response is not evidence that a carrier integration is live. */
export function describeReadiness(value, status = 200) {
  if (status === 503 && value?.error?.code === "BACKEND_NOT_CONNECTED") {
    return "Customer accounts haven’t opened yet. You can still explore the preview.";
  }
  if (
    status !== 200 ||
    !value ||
    value.mode !== "demo" ||
    value.serviceStatus !== "prelaunch" ||
    value.productionReady !== false
  ) {
    throw new Error("The API did not return the expected development status.");
  }
  return "The preview service is available. Customer activation and mobile network service are pending.";
}
