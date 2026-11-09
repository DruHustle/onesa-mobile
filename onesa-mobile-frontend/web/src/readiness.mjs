/** A successful HTTP response is not evidence that a carrier integration is live. */
export function describeReadiness(value) {
  if (
    !value ||
    value.mode !== "demo" ||
    value.serviceStatus !== "prelaunch" ||
    value.productionReady !== false
  ) {
    throw new Error("The API did not return the expected development status.");
  }
  return "Development API connected. Live network service and customer activation remain unavailable.";
}
