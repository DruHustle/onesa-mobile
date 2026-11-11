export function accountModeMatchesHost(hostname, session) {
  return hostname !== "mobile.onesa.eu" ||
    (session?.mode === "production" && session.authMode === "onesa" &&
      (!session.authenticated || session.user?.source === "onesa"));
}

export function publicLaunchInterestOpen(value, status = 200) {
  return status === 200 && value?.mode === "production" &&
    value.serviceStatus === "prelaunch" && value.productionReady === false &&
    value.commercialSalesEnabled === false && value.networkConnected === false &&
    value.capabilities?.launchInterest === true;
}

/** A successful HTTP response is not evidence that a carrier integration is live. */
export function describeReadiness(value, status = 200) {
  if (status === 503 && value?.error?.code === "BACKEND_NOT_CONNECTED") {
    return "Customer accounts haven’t opened yet. You can still explore the preview.";
  }
  if (status === 200 && ["lab", "production"].includes(value?.mode) &&
      value.serviceStatus === "prelaunch" && value.productionReady === false &&
      value.commercialSalesEnabled === false && value.networkConnected === false) {
    if (publicLaunchInterestOpen(value, status)) {
      return "You can register interest in your Onesa account. Mobile service, payments and satellite access are pending.";
    }
    return value.mode === "lab" ? "The pilot workspace is available for testing. Mobile service and payments are pending." :
      "The account workspace is available. Mobile service and payments are pending.";
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
