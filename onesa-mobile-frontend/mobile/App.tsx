import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import PreviewApp from "./src/PreviewApp";
import { PasofiCard } from "./src/PasofiCard";
import {
  inSession,
  SessionBoundary,
  SessionStorage,
  shareSessionDocument,
  StaleSessionError,
  StorageCleanupRequiredError,
  type SessionOperation,
} from "./src/session";
import {
  apiBase,
  ApiError,
  base64Url,
  callbackParameters,
  compactCache,
  request,
  type Account,
  type Credential,
  type Item,
} from "./src/api";
import { AccountReadTracker, canEditPilotApplication, isAccountSnapshot, isPublicAccountApi, isSessionDiscovery, launchInterestChange, sessionRemainingMs } from "./src/account-state";
import {
  BrandMark,
  Button,
  Card,
  DetailRow,
  Label,
  SectionHeading,
  Tag,
  colors,
  styles,
} from "./src/ui";

const configuration = (() => {
  try {
    return {
      base: apiBase(process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__),
      error: null,
    };
  } catch {
    return {
      base: null,
      error:
        "The account service address needs to be configured for this build.",
    };
  }
})();
const publicApi = isPublicAccountApi(configuration.base, __DEV__);
const unavailableProductionAccount = "The customer account service is unavailable. Retry the connection later.";
// This queue must outlive MobileAccount: preview navigation unmounts that component.
const privateStorage = new SessionStorage({
  read: (key) => SecureStore.getItemAsync(key),
  write: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  remove: (key) => SecureStore.deleteItemAsync(key),
});
const tabs = ["Home", "Application", "Help", "Account"] as const;
type Tab = (typeof tabs)[number];
const plans = [
  ["everyday", "Everyday"],
  ["reach", "Reach"],
  ["family-farm", "Family & Farm"],
] as const;
const human = (value: unknown) =>
  String(value ?? "Not recorded").replaceAll("_", " ");
function Field({
  label,
  value,
  onChange,
  multiline = false,
  password = false,
  disabled = false,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  multiline?: boolean;
  password?: boolean;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={local.field}>
      <Text style={styles.strongBody}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        style={[local.input, multiline && local.textarea]}
        secureTextEntry={password}
        editable={!disabled}
        accessibilityState={{ disabled }}
        autoCapitalize="none"
        autoCorrect={!password}
        multiline={multiline}
        maxLength={maxLength ?? (multiline ? 1200 : password ? 256 : 100)}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}
function Choice({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: readonly (readonly [string, string])[];
  value: string;
  onChange: (s: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={local.field}>
      <Text style={styles.strongBody}>{label}</Text>
      <View style={local.choices}>
        {options.map(([id, title]) => (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === id, disabled }}
            style={[local.choice, value === id && local.selected]}
          >
            <Text style={styles.strongBody}>{title}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
function MobileAccount({ openPreview }: { openPreview: () => void }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("Home"),
    [storageKey, setStorageKey] = useState<string | null>(null),
    [credential, setCredential] = useState<Credential | null>(null),
    [account, setAccount] = useState<Account | null>(null);
  const [authMode, setAuthMode] = useState<"lab" | "onesa" | null>(null),
    [ssoAvailable, setSsoAvailable] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [cached, setCached] = useState<Record<string, unknown> | null>(null),
    [lastFetched, setLastFetched] = useState(""),
    [stale, setStale] = useState(false),
    [discoveryUnavailable, setDiscoveryUnavailable] = useState(false);
  const [cleanupRequired, setCleanupRequired] = useState(false),
    [clearingStorage, setClearingStorage] = useState(false),
    [storageRetry, setStorageRetry] = useState(0);
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [area, setArea] = useState(""),
    [deviceModel, setDeviceModel] = useState(""),
    [planId, setPlanId] = useState("everyday"),
    [simFormat, setSimFormat] = useState("physical"),
    [consent, setConsent] = useState(false);
  const [category, setCategory] = useState("other"),
    [subject, setSubject] = useState(""),
    [message, setMessage] = useState(""),
    [replyId, setReplyId] = useState<string | null>(null),
    [reply, setReply] = useState(""),
    [requestType, setRequestType] = useState("data_correction"),
    [requestDetail, setRequestDetail] = useState("");
  const current = useRef<Credential | null>(null),
    requestKeys = useRef(new Map<string, string>()),
    callbackCodes = useRef(new Set<string>()),
    actionLock = useRef<symbol | null>(null),
    cleanupPending = useRef(false),
    cleanupFlight = useRef<Promise<SessionOperation> | null>(null),
    applicationDraftId = useRef<string | null>(null),
    scroll = useRef<ScrollViewInstance | null>(null);
  const [boundary] = useState(() => new SessionBoundary());
  const [accountReads] = useState(() => new AccountReadTracker());
  const base = configuration.base;
  function openPortal(registration = false) {
    const url = registration ? "https://portal.onesa.eu/account/register" : "https://portal.onesa.eu/account";
    void Linking.openURL(url).catch(() => setNotice("Open " + url + " in your browser."));
  }
  const resetPrivateState = useCallback(() => {
    accountReads.invalidate();
    current.current = null;
    setCredential(null);
    setAccount(null);
    setCached(null);
    setLastFetched("");
    setStale(false);
    setLoading(false);
    setUsername("");
    setPassword("");
    setDisplayName("");
    setArea("");
    setDeviceModel("");
    setPlanId("everyday");
    setSimFormat("physical");
    setConsent(false);
    setCategory("other");
    setSubject("");
    setMessage("");
    setReplyId(null);
    setReply("");
    setRequestType("data_correction");
    setRequestDetail("");
    setError("");
    setNotice("");
    setTab("Home");
    requestKeys.current.clear();
    callbackCodes.current.clear();
    applicationDraftId.current = null;
  }, [accountReads]);
  const clearLocal = useCallback(async () => {
    if (cleanupFlight.current) return cleanupFlight.current;
    const cleared = boundary.invalidate();
    resetPrivateState();
    cleanupPending.current = true;
    setCleanupRequired(true);
    setClearingStorage(true);
    actionLock.current = null;
    setBusy(false);
    const clearing = (async () => {
      try {
        await privateStorage.clear(
          storageKey
            ? [storageKey, storageKey + ".cache", storageKey + ".flow"]
            : [],
        );
        if (cleared.isCurrent()) {
          cleanupPending.current = false;
          setCleanupRequired(false);
        }
        return cleared;
      } catch (e) {
        if (cleared.isCurrent())
          setError(
            "Account data was cleared from this screen, but secure storage could not be cleared. Retry before closing the app.",
          );
        throw e;
      } finally {
        cleanupFlight.current = null;
        if (boundary.isActive) setClearingStorage(false);
      }
    })();
    cleanupFlight.current = clearing;
    return clearing;
  }, [storageKey, boundary, resetPrivateState]);
  const saveCredential = useCallback(
    async (value: Credential, operation: SessionOperation) => {
      operation.assertCurrent();
      if (!storageKey || !base)
        throw Error("The account service is not configured.");
      if (
        !/^[A-Za-z0-9_-]{43}$/.test(value.token) ||
        !value.user?.subject || (publicApi && value.user.source !== "onesa") ||
        !Number.isFinite(value.user.expiresAt) ||
        value.user.expiresAt * 1000 <= Date.now()
      )
        throw Error("The service returned an invalid session.");
      const committed = boundary.invalidate();
      resetPrivateState();
      try {
        await privateStorage.write(
          committed,
          storageKey,
          JSON.stringify(value),
          [storageKey, storageKey + ".cache", storageKey + ".flow"],
        );
        committed.assertCurrent();
        current.current = value;
        setCredential(value);
        return committed;
      } catch (e) {
        if (committed.isCurrent()) {
          if (e instanceof StorageCleanupRequiredError) {
            cleanupPending.current = true;
            setCleanupRequired(true);
          }
          setError(
            e instanceof Error
              ? e.message
              : "Secure account storage could not be updated.",
          );
        }
        throw e;
      }
    },
    [storageKey, base, boundary, resetPrivateState],
  );
  const refresh = useCallback(
    async (
      value: Credential | null = current.current,
      operation = boundary.capture(),
    ) => {
      operation.assertCurrent();
      if (!base || !value || current.current?.token !== value.token) return;
      if (sessionRemainingMs(value) === 0) {
        const cleared = await clearLocal();
        if (cleared.isCurrent()) setNotice("Your session has ended. Sign in again to continue.");
        return;
      }
      const read = accountReads.begin();
      setLoading(true);
      setStale(true);
      try {
        const data = await inSession(operation, () =>
          request<Account>(base, "/v1/me", {
            token: value.token,
            signal: operation.signal,
          }),
        );
        operation.assertCurrent();
        if (!read.isCurrent()) return;
        if (current.current?.token !== value.token)
          throw new StaleSessionError();
        if (publicApi && data?.status?.mode === "lab") {
          const cleared = await clearLocal();
          if (cleared.isCurrent()) {
            setDiscoveryUnavailable(true);
            setSsoAvailable(false);
            setAuthMode(null);
            setError(unavailableProductionAccount);
          }
          return;
        }
        if (!isAccountSnapshot(data, value.user.subject))
          throw Error("The account response could not be verified. Retry the account refresh.");
        setAccount((previous) =>
          operation.isCurrent() && read.isCurrent() && current.current?.token === value.token
            ? data
            : previous,
        );
        setLastFetched(new Date().toISOString());
        read.accept();
        setStale(false);
        setError("");
        const snapshot = compactCache(data);
        setCached(snapshot as Record<string, unknown>);
        if (storageKey) {
          try {
            await privateStorage.write(operation, storageKey + ".cache", JSON.stringify(snapshot));
          } catch (e) {
            if (!operation.isCurrent() || !read.isCurrent()) return;
            if (e instanceof StorageCleanupRequiredError) {
              cleanupPending.current = true;
              setCleanupRequired(true);
            }
            setError("Your account was refreshed, but the protected offline copy could not be updated. Your current records are shown below.");
          }
        }
      } catch (e) {
        if (!operation.isCurrent() || !read.isCurrent() || e instanceof StaleSessionError) return;
        read.fail();
        setStale(true);
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          const cleared = await clearLocal();
          if (!cleared.isCurrent()) return;
        }
        setError(
          e instanceof Error ? e.message : "Unable to refresh your account.",
        );
      } finally {
        if (operation.isCurrent() && read.isCurrent()) setLoading(false);
      }
    },
    [base, storageKey, clearLocal, boundary, accountReads],
  );
  useEffect(() => {
    if (!credential) return;
    const token = credential.token;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (timer) clearTimeout(timer);
      const value = current.current;
      if (!value || value.token !== token) return;
      const remaining = sessionRemainingMs(value);
      if (remaining === 0) {
        void clearLocal().then(cleared => {
          if (cleared.isCurrent()) setNotice("Your session has ended. Sign in again to continue.");
        }).catch(() => undefined);
      } else timer = setTimeout(check, Math.min(remaining, 2147483647));
    };
    check();
    const listener = AppState.addEventListener("change", state => { if (state === "active") check(); });
    return () => { if (timer) clearTimeout(timer); listener.remove(); };
  }, [credential, clearLocal]);
  useEffect(() => {
    if (error) scroll.current?.scrollTo({ y: 0, animated: true });
  }, [error]);
  useEffect(() => {
    const operation = boundary.activate();
    resetPrivateState();
    actionLock.current = null;
    setBusy(false);
    setStorageKey(null);
    setAuthMode(null);
    setSsoAvailable(false);
    setDiscoveryUnavailable(false);
    setLoading(true);
    void (async () => {
      if (!base) {
        setLoading(false);
        return;
      }
      try {
        const hash = await inSession(operation, () =>
            Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base),
          ),
          key = "onesa.mobile.v1." + hash.slice(0, 24);
        operation.assertCurrent();
        setStorageKey(key);
        let discoveryProblem = "";
        const [[stored, previous], discovered] = await inSession(operation, () =>
          Promise.all([
            privateStorage.read(operation, [
              key,
              key + ".cache",
              key + ".flow",
            ]),
            request<unknown>(
              base,
              "/v1/session",
              { signal: operation.signal },
            ).catch(e => {
              discoveryProblem = e instanceof Error ? e.message : "The account service could not be reached.";
              return null;
            }),
          ]),
        );
        operation.assertCurrent();
        const session = isSessionDiscovery(discovered, publicApi) ? discovered : null;
        if (publicApi && !session && isSessionDiscovery(discovered))
          discoveryProblem = unavailableProductionAccount;
        cleanupPending.current = false;
        setCleanupRequired(false);
        if (session) {
          setAuthMode(session.authMode);
          setSsoAvailable(session.ssoAvailable);
        }
        // Keep the saved token on-device until public service discovery succeeds.
        if (stored && (!publicApi || session?.ssoAvailable)) {
          const value = JSON.parse(stored) as Credential;
          if (
            value.user?.expiresAt * 1000 > Date.now() &&
            (!publicApi || value.user.source === "onesa") &&
            /^[A-Za-z0-9_-]{43}$/.test(value.token)
          ) {
            current.current = value;
            setCredential(value);
            if (previous) {
              const parsed = JSON.parse(previous);
              if (parsed.subject === value.user.subject) setCached(parsed);
            }
          } else
            await privateStorage.clear(
              [key, key + ".cache", key + ".flow"],
              operation,
            );
          operation.assertCurrent();
        }
        if (!session) {
          setDiscoveryUnavailable(true);
          setError(
            discoveryProblem || "The sign-in service returned an unreadable response. Retry the connection.",
          );
        }
      } catch (e) {
        if (operation.isCurrent()) {
          setDiscoveryUnavailable(true);
          if (e instanceof StorageCleanupRequiredError) {
            cleanupPending.current = true;
            setCleanupRequired(true);
          }
          setError(
            e instanceof StorageCleanupRequiredError
              ? e.message
              : "Secure account storage could not be opened. Please try again.",
          );
        }
      } finally {
        if (operation.isCurrent()) setLoading(false);
      }
    })();
    return () => {
      boundary.dispose();
      current.current = null;
      actionLock.current = null;
    };
  }, [base, boundary, resetPrivateState, storageRetry]);
  useEffect(() => {
    if (credential && storageKey)
      void refresh(credential).catch(() => undefined);
  }, [credential, storageKey, refresh]);
  const run = useCallback(
    async (action: (operation: SessionOperation) => Promise<void>) => {
      if (actionLock.current || cleanupPending.current || !boundary.isActive)
        return;
      if (current.current && sessionRemainingMs(current.current) === 0) {
        try {
          const cleared = await clearLocal();
          if (cleared.isCurrent()) setNotice("Your session has ended. Sign in again to continue.");
        } catch { /* clearLocal exposes its protected-storage recovery action. */ }
        return;
      }
      const operation = boundary.capture();
      const lock = Symbol("account action");
      actionLock.current = lock;
      setBusy(true);
      setError("");
      setNotice("");
      try {
        await action(operation);
      } catch (e) {
        if (operation.isCurrent() && !(e instanceof StaleSessionError)) {
          if (e instanceof StorageCleanupRequiredError) {
            cleanupPending.current = true;
            setCleanupRequired(true);
          }
          setError(
            e instanceof Error
              ? e.message
              : "The operation could not be completed.",
          );
        }
      } finally {
        if (actionLock.current === lock) {
          actionLock.current = null;
          if (boundary.isActive) setBusy(false);
        }
      }
    },
    [boundary, clearLocal],
  );
  const completeNative = useCallback(
    async (url: string, operation: SessionOperation) => {
      operation.assertCurrent();
      if (!base || !storageKey) return;
      const callbackCode = new URL(url).searchParams.get("code");
      if (callbackCode && callbackCodes.current.has(callbackCode)) return;
      const [raw] = await privateStorage.read(operation, [
        storageKey + ".flow",
      ]);
      operation.assertCurrent();
      if (!raw) throw Error("Start sign-in again on this device.");
      const flow = JSON.parse(raw) as {
        state: string;
        verifier: string;
        expires: number;
      };
      if (flow.expires < Date.now())
        throw Error("This sign-in expired. Start again.");
      const result = callbackParameters(url, flow.state);
      if (callbackCodes.current.has(result.code)) return;
      callbackCodes.current.add(result.code);
      try {
        const issued = await inSession(operation, () =>
          request<{
            token: string;
            user: Credential["user"];
          }>(base, "/v1/auth/onesa/native/exchange", {
            method: "POST",
            body: { ...result, verifier: flow.verifier },
            signal: operation.signal,
          }),
        );
        const committed = await saveCredential(issued, operation);
        committed.assertCurrent();
        callbackCodes.current.add(result.code);
      } catch (e) {
        if (operation.isCurrent()) callbackCodes.current.delete(result.code);
        throw e;
      }
    },
    [base, storageKey, saveCredential],
  );
  useEffect(() => {
    if (!storageKey || (publicApi && (authMode !== "onesa" || !ssoAvailable))) return;
    let listening = true;
    const handler = ({ url }: { url: string }) => {
      if (listening && url.startsWith("onesamobile://auth/callback"))
        void run((operation) => completeNative(url, operation));
    };
    const listener = Linking.addEventListener("url", handler);
    void Linking.getInitialURL().then((url) => {
      if (url) handler({ url });
    });
    return () => {
      listening = false;
      listener.remove();
    };
  }, [storageKey, authMode, ssoAvailable, completeNative, run]);
  const signIn = () =>
    run(async (operation) => {
      if (!base) return;
      const result = await inSession(operation, () =>
        request<{ token: string; user: Credential["user"] }>(
          base,
          "/v1/session/login",
          {
            method: "POST",
            signal: operation.signal,
            body: {
              username,
              password,
              surface: "customer",
              transport: "bearer",
            },
          },
        ),
      );
      await saveCredential(result, operation);
    });
  const signInOnesa = () =>
    run(async (operation) => {
      if (!base || !storageKey) return;
      const state = base64Url(
          await inSession(operation, () => Crypto.getRandomBytesAsync(32)),
        ),
        verifier = base64Url(
          await inSession(operation, () => Crypto.getRandomBytesAsync(32)),
        ),
        challenge = (
          await inSession(operation, () =>
            Crypto.digestStringAsync(
              Crypto.CryptoDigestAlgorithm.SHA256,
              verifier,
              { encoding: Crypto.CryptoEncoding.BASE64 },
            ),
          )
        )
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .replaceAll("=", "");
      await privateStorage.write(
        operation,
        storageKey + ".flow",
        JSON.stringify({ state, verifier, expires: Date.now() + 600000 }),
      );
      operation.assertCurrent();
      const url = new URL(base + "/v1/auth/onesa/start");
      url.searchParams.set("surface", "customer");
      url.searchParams.set("codeChallenge", challenge);
      url.searchParams.set("state", state);
      const result = await inSession(operation, () =>
        WebBrowser.openAuthSessionAsync(
          url.href,
          "onesamobile://auth/callback",
        ),
      );
      if (result.type === "success")
        await completeNative(result.url, operation);
      else {
        await privateStorage.clear([storageKey + ".flow"], operation);
        operation.assertCurrent();
        setNotice("Sign-in cancelled. No account change was made.");
      }
    });
  // Sign-out must be able to cancel an in-flight private operation.
  const signOut = async () => {
    const previous = current.current;
    let cleared: SessionOperation;
    try {
      cleared = await clearLocal();
    } catch {
      return; // clearLocal reports the secure-storage failure on the cleared screen.
    }
    if (previous && base) {
      try {
        // Revoking the captured old token remains valid even if a new sign-in starts.
        await request(base, "/v1/session/logout", {
          method: "POST",
          token: previous.token,
        });
        if (cleared.isCurrent()) setNotice("Signed out on this device.");
      } catch {
        if (cleared.isCurrent())
          setNotice(
            "Signed out on this device. The service could not confirm remote session revocation.",
          );
      }
    }
  };
  const mutate = async (
    operation: SessionOperation,
    path: string,
    body: unknown,
    success: string,
    method: "POST" | "PATCH" = "POST",
  ) => {
    operation.assertCurrent();
    const user = current.current;
    if (!base || !user) throw Error("Sign in first.");
    if (!accountReads.isFresh)
      throw Error("Refresh your account and review the current records before saving. Your draft is still here.");
    const signature = method + path + JSON.stringify(body);
    let key = requestKeys.current.get(signature);
    if (!key) {
      key = Crypto.randomUUID();
      requestKeys.current.set(signature, key);
    }
    try {
      await inSession(operation, () =>
        request(base, path, {
          token: user.token,
          method,
          body,
          key,
          signal: operation.signal,
        }),
      );
    } catch (e) {
      operation.assertCurrent();
      if (e instanceof ApiError && e.status === 401) {
        const cleared = await clearLocal();
        if (cleared.isCurrent()) setError(e.message);
      } else if (e instanceof ApiError && e.status === 409)
        await refresh(user, operation);
      else if (e instanceof ApiError && (e.status === 0 || e.status >= 500))
        throw Error("The save could not be confirmed. Keep your entries unchanged and retry; the same request reference will recover its result without creating a duplicate.");
      throw e;
    }
    operation.assertCurrent();
    requestKeys.current.delete(signature);
    if (current.current?.token !== user.token) throw new StaleSessionError();
    await refresh(user, operation);
    operation.assertCurrent();
    setNotice(success);
  };
  const shareDocument = (item?: Item) =>
    run(async (operation) => {
      const user = current.current;
      if (!user || !base) return;
      if (!(await inSession(operation, () => Sharing.isAvailableAsync())))
        throw Error("Document sharing is unavailable on this device.");
      const file = new File(
        Paths.cache,
        "onesa-mobile-" + Crypto.randomUUID() + (item ? ".pdf" : ".json"),
      );
      await shareSessionDocument(operation, {
        download: async () => {
          if (item && !/^[a-f0-9-]{36}$/.test(item.id))
            throw Error("Invalid document reference.");
          await File.downloadFileAsync(
            base +
              (item ? "/v1/documents/" + item.id + ".pdf" : "/v1/me/export"),
            file,
            {
              headers: { Authorization: "Bearer " + user.token },
              signal: operation.signal,
            },
          );
        },
        share: () =>
          Sharing.shareAsync(file.uri, {
            mimeType: item ? "application/pdf" : "application/json",
            dialogTitle: item
              ? "Share your test receipt"
              : "Export your account records",
          }),
        cleanup: () => {
          if (file.exists) file.delete();
        },
      });
    });
  const loadMore = (kind: "tickets" | "ledger" | "requests") =>
    run(async (operation) => {
      const user = current.current,
        cursor = account?.cursors?.[kind];
      if (!base || !user || !cursor) return;
      const page = await inSession(operation, () =>
        request<{
          items: Item[];
          nextCursor: string | null;
          total: number;
        }>(base, "/v1/me/records/" + kind, {
          token: user.token,
          query: { cursor, limit: 50 },
          signal: operation.signal,
        }),
      );
      operation.assertCurrent();
      if (current.current?.token !== user.token) throw new StaleSessionError();
      setAccount((previous) =>
        operation.isCurrent() &&
        current.current?.token === user.token &&
        previous?.profile.subject === user.user.subject
          ? {
              ...previous,
              [kind]: [
                ...new Map(
                  [...previous[kind], ...page.items].map((item) => [
                    item.id,
                    item,
                  ]),
                ).values(),
              ],
              cursors: { ...previous.cursors, [kind]: page.nextCursor },
              counts: { ...previous.counts, [kind]: page.total },
            }
          : previous,
      );
    });
  const application =
    account?.applications.find((a) => a.state !== "declined") ??
    account?.applications[0];
  const beginCorrection = () => {
    if (!application) return;
    applicationDraftId.current = application.id;
    setDisplayName(String(application.displayName));
    setArea(String(application.area));
    setDeviceModel(String(application.deviceModel));
    setPlanId(String(application.planId));
    setSimFormat(String(application.simFormat));
    setConsent(false);
    setTab("Application");
  };
  const submitApplication = () =>
    run(async (operation) => {
      if (!consent) throw Error("Confirm the pilot consent before submitting.");
      const input = {
        displayName,
        area,
        deviceModel,
        planId,
        simFormat,
        consentToPilot: true,
      };
      const existing =
        application &&
        ["review_required", "information_required"].includes(
          String(application.state),
        );
      await mutate(
        operation,
        existing ? "/v1/applications/" + application.id : "/v1/applications",
        existing ? { ...input, revision: application.revision } : input,
        "Your pilot application was saved. Mobile service remains unavailable.",
        existing ? "PATCH" : "POST",
      );
      operation.assertCurrent();
      setTab("Home");
    });
  const canEdit = canEditPilotApplication(account, application, credential);
  const pilot = account ? account.status.mode === "lab" : credential?.user.source === "lab";
  const interestChange = launchInterestChange(account, credential);
  const writesBlocked = busy || loading || stale || !account || cleanupRequired;
  const changeTab = (next: Tab) => {
    if (next === "Application" && application && canEdit && applicationDraftId.current !== application.id) beginCorrection();
    else setTab(next);
  };
  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <StatusBar style="dark" />
      <View style={[styles.frame, styles.header]}>
        <View style={styles.wordmark} accessibilityLabel="Onesa Mobile">
          <BrandMark />
          <View>
            <Text style={styles.brand}>onesa</Text>
            <Text style={styles.brandQualifier}>mobile</Text>
          </View>
        </View>
        <Text style={styles.headerTag}>
          {credential ? "MY ACCOUNT" : "WELCOME"}
        </Text>
      </View>
      <View style={styles.demoBanner}>
        <View style={styles.frame}>
          <Text style={styles.demoText}>
            {authMode === "lab" || credential?.user.source === "lab"
              ? "Hardware pilot lab · no commercial mobile service"
              : "Prelaunch · satellite agreement pending"}
          </Text>
        </View>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={insets.top}>
      <ScrollView
        key={tab}
        ref={scroll}
        style={styles.scroll}
        contentContainerStyle={[styles.frame, styles.content]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
      >
        {error ? (
          <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={local.error}>
            <Text style={local.errorText}>{error}</Text>
          </View>
        ) : null}
        {cleanupRequired ? (
          <Card>
            <Text style={styles.body}>
              Sign-in stays unavailable until this device's saved account data
              has been cleared.
            </Text>
            <Button
              disabled={clearingStorage}
              onPress={() => {
                void clearLocal()
                  .then((cleared) => {
                    if (cleared.isCurrent())
                      setStorageRetry((value) => value + 1);
                  })
                  .catch(() => undefined);
              }}
            >
              {clearingStorage
                ? "Clearing this device…"
                : "Retry clearing this device"}
            </Button>
          </Card>
        ) : null}
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={local.notice}>
            {notice}
          </Text>
        ) : null}
        {credential && stale ? (
          <Card>
            <Tag tone="amber">{loading ? "REFRESHING RECORDS" : "REFRESH REQUIRED"}</Tag>
            <Text style={styles.body}>{account ? "Previously loaded records may be out of date. Refresh and review them before saving; your draft entries are kept." : "Account records have not been loaded for this session. Refresh to continue."}</Text>
            <Button secondary disabled={busy || loading || cleanupRequired} onPress={() => void run(operation => refresh(current.current, operation))}>{loading ? "Refreshing…" : "Refresh account"}</Button>
          </Card>
        ) : null}
        {busy || loading ? (
          <ActivityIndicator
            accessibilityLabel="Loading account"
            color={colors.forest}
          />
        ) : null}
        {!credential ? (
          <>
            <SectionHeading>Your mobile account</SectionHeading>
            <Card>
              <Text style={styles.body}>
                {authMode === "lab"
                  ? "Review your pilot application and get help from the team."
                  : "Manage your launch interest, get help and see your account records."}
              </Text>
              {configuration.error ? (
                <Text style={styles.body}>{configuration.error}</Text>
              ) : null}
              {!base ? (
                <Text style={styles.body}>
                  Account access is not configured for this build. You can
                  explore the product preview.
                </Text>
              ) : discoveryUnavailable ? (
                <>
                  <Text style={styles.body}>Account access could not be checked. Retry the connection when you are ready.</Text>
                  <Button disabled={busy || loading || cleanupRequired} onPress={() => setStorageRetry(value => value + 1)}>Retry connection</Button>
                </>
              ) : loading && authMode === null ? (
                <Text style={styles.body}>Checking the account service…</Text>
              ) : authMode === "lab" ? (
                <>
                  <Tag>ISOLATED LAB SIGN-IN</Tag>
                  <Text style={styles.small}>
                    Use an administrator-issued test customer account. Keep real
                    identity documents and payment details out of the lab.
                  </Text>
                  <Field
                    label="Lab username"
                    value={username}
                    onChange={setUsername}
                    disabled={busy}
                    maxLength={254}
                  />
                  <Field
                    label="Lab password"
                    value={password}
                    onChange={setPassword}
                    password
                    disabled={busy}
                  />
                  <Button
                    onPress={signIn}
                    disabled={busy || cleanupRequired || !username || !password}
                  >
                    Sign in to the lab
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onPress={signInOnesa}
                    disabled={busy || cleanupRequired || !ssoAvailable}
                  >
                    Continue with Onesa
                  </Button>
                  <Text style={styles.small}>
                    Registration, password recovery and account verification
                    take place in the shared Onesa sign-in service.
                  </Text>
                  {!ssoAvailable ? (
                    <Text style={styles.small}>Account sign-in is awaiting configuration.</Text>
                  ) : null}
                </>
              )}
              {(discoveryUnavailable || !base || (!loading && authMode !== "lab" && !ssoAvailable)) && (
                <>
                  <Button secondary onPress={() => openPortal()}>Sign in to Company Portal</Button>
                  <Button secondary onPress={() => openPortal(true)}>Create an Onesa account</Button>
                </>
              )}
              <Button
                secondary
                onPress={openPreview}
                disabled={cleanupRequired}
              >
                Explore without signing in
              </Button>
            </Card>
            <PasofiCard />
          </>
        ) : (
          <>
            {tab === "Home" ? (
              <>
                <SectionHeading>
                  Hello, {credential.user.displayName}
                </SectionHeading>
                <Card>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardHeading}>Your service</Text>
                    <Tag tone="amber">NOT PROVISIONED</Tag>
                  </View>
                  {pilot ? (
                    <>
                      <DetailRow
                        label="Application"
                        value={
                          application
                            ? human(application.state)
                            : account
                              ? "Not submitted"
                              : "Waiting for refresh"
                        }
                      />
                      <DetailRow
                        label="Plan concept"
                        value={
                          application
                            ? human(application.planId)
                            : account
                              ? "Not selected"
                              : "Waiting for refresh"
                        }
                      />
                      <DetailRow label="Usage" value="No host measurements" />
                    </>
                  ) : (
                    <Text style={styles.body}>
                      Mobile plans, SIM activation and satellite service are unavailable during prelaunch.
                    </Text>
                  )}
                  <Text style={styles.small}>
                    {lastFetched
                      ? "Account checked " +
                        new Date(lastFetched).toLocaleString()
                      : cached
                        ? "Saved account information from " +
                          new Date(String(cached.savedAt)).toLocaleString() +
                          ". Reconnect to refresh."
                        : "Waiting for the account service."}
                  </Text>
                  <Button
                    secondary
                    onPress={() =>
                      void run((operation) =>
                        refresh(current.current, operation),
                      )
                    }
                    disabled={busy || loading || cleanupRequired}
                  >
                    Refresh account
                  </Button>
                </Card>
                <PasofiCard />
                {pilot ? (
                  <Card>
                    <SectionHeading>Next step</SectionHeading>
                    <Text style={styles.body}>
                      {!account
                        ? "Reconnect and refresh your account to see the latest next step."
                        : !application
                          ? "Submit a pilot application to record your device and SIM preference."
                          : application.state === "information_required"
                            ? String(
                                application.reviewNote ??
                                  "Update the information requested by the team.",
                              )
                            : application.state === "awaiting_host"
                              ? "Your pilot review is recorded. Activation requires an authorized host connection."
                              : application.state === "declined"
                                ? String(
                                    application.reviewNote ??
                                      "The pilot application was declined. You can ask support or submit another application.",
                                  )
                                : "The team will review your pilot application."}
                    </Text>
                    {canEdit ? (
                      <Button
                        onPress={() => changeTab("Application")}
                      >
                        {application
                          ? "Review your details"
                          : "Start pilot application"}
                      </Button>
                    ) : (
                      <Button onPress={() => setTab("Help")}>
                        Contact support
                      </Button>
                    )}
                  </Card>
                ) : (
                  <Card>
                    <SectionHeading>Launch interest</SectionHeading>
                    <Text style={styles.body}>
                      {!interestChange
                        ? "Check availability and get help with your launch interest."
                        : interestChange.interested
                          ? "Record your interest in future Onesa Mobile service for free."
                          : "Your interest is registered. You can withdraw it at any time."}
                    </Text>
                    <Button onPress={() => changeTab("Application")}>View launch interest</Button>
                  </Card>
                )}
                <Card>
                  <SectionHeading>
                    Connectivity, clearly explained
                  </SectionHeading>
                  <Text style={styles.body}>
                    Direct-to-cell connects an eligible handset through an
                    authorized satellite mobile network. A Starlink dish
                    provides a separate Wi-Fi path. This app does not detect or
                    switch your phone onto a satellite.
                  </Text>
                  <Text style={styles.small}>
                    Messaging, data and calls require separate device and
                    service qualification.
                  </Text>
                </Card>
              </>
            ) : null}
            {tab === "Application" && !pilot ? (
              <>
                <SectionHeading>Launch interest</SectionHeading>
                <Card>
                  <Text style={styles.body}>
                    Onesa Mobile is preparing its service in Zimbabwe. The satellite agreement is pending.
                    Registering your interest is free. It does not reserve a plan, activate a SIM or guarantee coverage.
                  </Text>
                  {interestChange ? (
                    <>
                      <DetailRow label="Your interest" value={
                        account?.launchInterest?.state === "registered" ? "Registered"
                          : account?.launchInterest?.state === "withdrawn" ? "Withdrawn" : "Not registered"
                      } />
                      {account?.launchInterest ? <DetailRow label="Last changed" value={new Date(account.launchInterest.updatedAt).toLocaleString()} /> : null}
                      <Text style={styles.small}>You can change this preference at any time.</Text>
                      <Button
                        secondary={!interestChange.interested}
                        disabled={writesBlocked}
                        onPress={() => void run(operation => mutate(
                          operation,
                          "/v1/account/launch-interest",
                          interestChange,
                          interestChange.interested ? "Your launch interest was registered." : "Your launch interest was withdrawn.",
                        ))}
                      >
                        {interestChange.interested ? "Register my interest" : "Withdraw my interest"}
                      </Button>
                    </>
                  ) : (
                    <Text style={styles.small}>
                      {account ? "Launch interest is unavailable for this account." : "Refresh your account to see your launch interest."}
                    </Text>
                  )}
                  <Button secondary onPress={() => setTab("Help")}>Ask about availability</Button>
                </Card>
              </>
            ) : null}
            {tab === "Application" && pilot ? (
              <>
                <SectionHeading>Pilot application</SectionHeading>
                <Text style={styles.body}>
                  Plan concepts are not approved offers for sale. Submitting
                  this form does not activate a SIM or verify registration.
                </Text>
                {!canEdit ? (
                  <Card>
                    <DetailRow label="Status" value={!account ? "Refresh required" : human(application?.state)} />
                    <Text style={styles.body}>
                      {!account ? "Refresh your account to see its current application status." : "Contact support to request a change while the application is with the host review queue."}
                    </Text>
                    <Button onPress={() => setTab("Help")}>Ask for help</Button>
                  </Card>
                ) : (
                  <Card>
                    <Field
                      label="Test display name"
                      value={displayName}
                      onChange={setDisplayName}
                      disabled={busy}
                      maxLength={80}
                    />
                    <Field label="Pilot area" value={area} onChange={setArea} disabled={busy} />
                    <Field
                      label="Device model"
                      value={deviceModel}
                      onChange={setDeviceModel}
                      disabled={busy}
                    />
                    <Choice
                      label="Plan concept"
                      options={plans}
                      value={planId}
                      onChange={setPlanId}
                      disabled={busy}
                    />
                    <Choice
                      label="SIM preference"
                      options={[
                        ["physical", "Physical SIM"],
                        ["esim", "eSIM"],
                      ]}
                      value={simFormat}
                      onChange={setSimFormat}
                      disabled={busy}
                    />
                    <View style={local.consent}>
                      <Switch
                        accessibilityLabel="I understand this is a pilot application"
                        value={consent}
                        onValueChange={setConsent}
                        disabled={busy}
                        trackColor={{ true: colors.green }}
                      />
                      <Text style={[styles.body, { flex: 1 }]}>
                        I understand this pilot form does not purchase or
                        activate mobile service.
                      </Text>
                    </View>
                    <Button
                      onPress={submitApplication}
                      disabled={
                        writesBlocked ||
                        !consent ||
                        !displayName.trim() ||
                        !area.trim() ||
                        !deviceModel.trim()
                      }
                    >
                      Save pilot application
                    </Button>
                  </Card>
                )}
              </>
            ) : null}
            {tab === "Help" ? (
              <>
                <SectionHeading>How can we help?</SectionHeading>
                <Card>
                  <Choice
                    label="Category"
                    options={[
                      ["registration", "Application"],
                      ["sim", "SIM"],
                      ["coverage", "Coverage"],
                      ["billing", "Billing"],
                      ["other", "Other"],
                    ]}
                    value={category}
                    onChange={setCategory}
                    disabled={busy}
                  />
                  <Field
                    label="Subject"
                    value={subject}
                    onChange={setSubject}
                    disabled={busy}
                  />
                  <Field
                    label="Message"
                    value={message}
                    onChange={setMessage}
                    multiline
                    disabled={busy}
                  />
                  <Button
                    disabled={writesBlocked || !subject.trim() || !message.trim()}
                    onPress={() =>
                      void run(async (operation) => {
                        await mutate(
                          operation,
                          "/v1/support/tickets",
                          { category, subject, message },
                          "Your support case was saved.",
                        );
                        operation.assertCurrent();
                        setSubject("");
                        setMessage("");
                      })
                    }
                  >
                    Send support request
                  </Button>
                </Card>
                <SectionHeading>Your cases</SectionHeading>
                {!account?.tickets.length ? (
                  <Text style={styles.body}>
                    {account
                      ? "You have no saved support cases."
                      : "Refresh your account to load support cases."}
                  </Text>
                ) : (
                  account.tickets.map((ticket) => (
                    <Card key={ticket.id}>
                      <View style={styles.cardTitleRow}>
                        <Text style={styles.cardHeading}>
                          {String(ticket.subject)}
                        </Text>
                        <Tag>{human(ticket.status)}</Tag>
                      </View>
                      <Text style={styles.body}>{String(ticket.message)}</Text>
                      {Array.isArray(ticket.notes)
                        ? (
                            ticket.notes as {
                              text: string;
                              authorRole: string;
                              at: string;
                            }[]
                          ).map((note, index) => (
                            <View key={index} style={local.reply}>
                              <Text style={styles.strongBody}>
                                {human(note.authorRole)}
                              </Text>
                              <Text style={styles.body}>{note.text}</Text>
                            </View>
                          ))
                        : null}
                      {replyId === ticket.id ? (
                        <>
                          <Field
                            label="Your reply"
                            value={reply}
                            onChange={setReply}
                            multiline
                            disabled={busy}
                          />
                          <Button
                            disabled={writesBlocked || !reply.trim()}
                            onPress={() =>
                              void run(async (operation) => {
                                await mutate(
                                  operation,
                                  "/v1/support/tickets/" +
                                    ticket.id +
                                    "/replies",
                                  { revision: ticket.revision, message: reply },
                                  "Your reply was saved.",
                                );
                                operation.assertCurrent();
                                setReply("");
                                setReplyId(null);
                              })
                            }
                          >
                            Send reply
                          </Button>
                        </>
                      ) : (
                        <Button
                          secondary
                          onPress={() => {
                            setReplyId(ticket.id);
                            setReply("");
                          }}
                        >
                          Reply to this case
                        </Button>
                      )}
                    </Card>
                  ))
                )}
                {account?.cursors?.tickets ? (
                  <Button
                    secondary
                    disabled={busy}
                    onPress={() => loadMore("tickets")}
                  >
                    Load older cases
                  </Button>
                ) : null}
              </>
            ) : null}
            {tab === "Account" ? (
              <>
                <SectionHeading>Account and records</SectionHeading>
                <Card>
                  <DetailRow
                    label="Account"
                    value={credential.user.displayName}
                  />
                  <DetailRow
                    label="Session"
                    value={
                      "Expires " +
                      new Date(
                        credential.user.expiresAt * 1000,
                      ).toLocaleTimeString()
                    }
                  />
                  <Text style={styles.small}>
                    Automatic background refresh is off. Documents download only
                    when you request them.
                  </Text>
                  <Button
                    secondary
                    onPress={() => shareDocument()}
                    disabled={busy}
                  >
                    Export my account records
                  </Button>
                  <Button secondary onPress={() => void signOut()}>
                    Sign out
                  </Button>
                </Card>
                {pilot ? (
                  <>
                    <SectionHeading>Test receipts</SectionHeading>
                    <Text style={styles.body}>
                      Lab records do not represent a charge or a tax invoice.
                    </Text>
                    {!account?.ledger.length ? (
                      <Text style={styles.small}>
                        {account ? "No test receipts have been recorded." : "Refresh your account to load test receipts."}
                      </Text>
                    ) : (
                      account.ledger.map((entry) => (
                        <Card key={entry.id}>
                          <DetailRow
                            label={String(entry.reference)}
                            value={
                              "USD " + (Number(entry.amountMinor) / 100).toFixed(2)
                            }
                          />
                          <DetailRow label="State" value={human(entry.state)} />
                          <Button
                            secondary
                            onPress={() => shareDocument(entry)}
                            disabled={busy}
                          >
                            Download and share test PDF
                          </Button>
                        </Card>
                      ))
                    )}
                    {account?.cursors?.ledger ? (
                      <Button
                        secondary
                        disabled={busy}
                        onPress={() => loadMore("ledger")}
                      >
                        Load older receipts
                      </Button>
                    ) : null}
                  </>
                ) : null}
                <Card>
                  <SectionHeading>Account requests</SectionHeading>
                  <Choice
                    label="Request type"
                    options={[
                      ["data_correction", "Correct my data"],
                      ["account_closure", "Close account"],
                      ...(pilot ? [
                        ["sim_replacement", "SIM replacement"],
                        ["number_porting", "Number transfer"],
                      ] as const : []),
                    ]}
                    value={requestType}
                    onChange={setRequestType}
                    disabled={busy}
                  />
                  <Field
                    label="Request details"
                    value={requestDetail}
                    onChange={setRequestDetail}
                    multiline
                    disabled={busy}
                  />
                  <Button
                    disabled={writesBlocked || !requestDetail.trim()}
                    onPress={() =>
                      void run(async (operation) => {
                        await mutate(
                          operation,
                          "/v1/account/requests",
                          { type: requestType, detail: requestDetail },
                          "Your request is with the team. No automatic account or SIM change was made.",
                        );
                        operation.assertCurrent();
                        setRequestDetail("");
                      })
                    }
                  >
                    Submit account request
                  </Button>
                </Card>
                {account?.requests.map((item) => (
                  <Card key={item.id}>
                    <DetailRow
                      label={human(item.type)}
                      value={human(item.status)}
                    />
                    <Text style={styles.body}>
                      {String(item.responseNote ?? item.detail)}
                    </Text>
                  </Card>
                ))}
                {account?.cursors?.requests ? (
                  <Button
                    secondary
                    disabled={busy}
                    onPress={() => loadMore("requests")}
                  >
                    Load older requests
                  </Button>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
      {credential ? (
        <View
          style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 8) }]}
        >
          <View style={[styles.frame, styles.navInner]}>
            {tabs.map((name) => (
              <Pressable
                key={name}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === name }}
                onPress={() => changeTab(name)}
                style={styles.navItem}
              >
                <View
                  style={[
                    styles.navIndicator,
                    tab === name && styles.navIndicatorActive,
                  ]}
                />
                <Text
                  style={[styles.navText, tab === name && styles.navTextActive]}
                >
                  {name === "Application" && !pilot ? "Launch" : name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
export default function App() {
  const [preview, setPreview] = useState(false);
  return (
    <SafeAreaProvider>
      {preview ? (
        <View style={{ flex: 1 }}>
          <SafeAreaView edges={["top"]}>
            <Button secondary onPress={() => setPreview(false)}>
              Return to account access
            </Button>
          </SafeAreaView>
          <PreviewApp />
        </View>
      ) : (
        <MobileAccount openPreview={() => setPreview(true)} />
      )}
    </SafeAreaProvider>
  );
}
const local = StyleSheet.create({
  field: { gap: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: 8,
    padding: 11,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  textarea: { minHeight: 96 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: 8,
    justifyContent: "center",
  },
  selected: { backgroundColor: colors.pale, borderColor: colors.forest },
  consent: { flexDirection: "row", alignItems: "center", gap: 10 },
  error: {
    padding: 12,
    borderLeftWidth: 3,
    borderColor: "#AC342C",
    backgroundColor: "#FFF1EE",
  },
  errorText: { color: "#8C241F", fontSize: 14, lineHeight: 21 },
  notice: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
    padding: 12,
    backgroundColor: colors.pale,
  },
  reply: {
    borderLeftWidth: 2,
    borderColor: colors.border,
    paddingLeft: 10,
    gap: 3,
  },
});
