import { useReducer } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { PasofiCard } from "./PasofiCard";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  INITIAL_PREVIEW,
  NETWORK_FACTS,
  PLANS,
  liveActionAvailability,
  previewReducer,
} from "./domain";
import type { PlanId, ScreenId } from "./domain";
import {
  BrandMark,
  Button,
  Card,
  DetailRow,
  Label,
  SectionHeading,
  Tag,
  styles,
} from "./ui";

const tabs: ReadonlyArray<{ id: ScreenId; label: string }> = [
  { id: "home", label: "Home" },
  { id: "plans", label: "Plans" },
  { id: "network", label: "Network" },
  { id: "account", label: "Account" },
];

function HomeScreen({
  selectedPlanId,
  navigate,
}: {
  selectedPlanId: PlanId | null;
  navigate: (screen: ScreenId) => void;
}) {
  const selectedPlan = PLANS.find((plan) => plan.id === selectedPlanId);
  return (
    <>
      <View style={styles.hero}>
        <Label light>BUILT AROUND ZIMBABWE</Label>
        <Text accessibilityRole="header" style={styles.heroTitle}>
          A simpler way{"\n"}to stay connected.
        </Text>
        <View style={styles.heroRule} />
        <Text style={styles.heroBody}>
          A mobile service designed around clear plans, easy control and the
          ambition to reach further.
        </Text>
      </View>

      <Card>
        <View style={styles.cardTitleRow}>
          <SectionHeading>Your Onesa preview</SectionHeading>
          <Tag>DEMO</Tag>
        </View>
        <View>
          <DetailRow
            label="Plan idea"
            value={selectedPlan?.name ?? "Choose a concept"}
          />
          <DetailRow label="Mobile service" value="Not active" />
          <DetailRow label="Satellite availability" value="Unconfirmed" />
        </View>
        <Button onPress={() => navigate("plans")}>
          {selectedPlan ? "Review plan concepts" : "Explore plan concepts"}
        </Button>
      </Card>

      <SectionHeading>Simple from the start</SectionHeading>
      <Card>
        <View style={styles.steps}>
          {[
            ["Choose your plan", "Clear allowances and renewal choices."],
            [
              "Verify your identity",
              "A future registration flow agreed with the licensed host.",
            ],
            [
              "Activate your line",
              "Available only after approvals and partner integration.",
            ],
          ].map(([title, detail], index) => (
            <View key={title} style={styles.step}>
              <Text style={styles.stepNumber}>{index + 1}</Text>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{title}</Text>
                <Text style={styles.small}>{detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </Card>

      <PasofiCard />
    </>
  );
}

function PlansScreen({
  selectedPlanId,
  selectPlan,
}: {
  selectedPlanId: PlanId | null;
  selectPlan: (planId: PlanId) => void;
}) {
  const selectedPlan = PLANS.find((plan) => plan.id === selectedPlanId);
  return (
    <>
      <View style={styles.stack}>
        <Label>PLANS IN DEVELOPMENT</Label>
        <Text accessibilityRole="header" style={styles.screenTitle}>
          Keep it simple.
        </Text>
        <Text style={styles.body}>
          Explore three starting ideas. Prices, allowances and launch
          availability will follow confirmed partner terms.
        </Text>
      </View>
      {selectedPlan && (
        <View style={styles.selectedNotice} accessibilityLiveRegion="polite">
          <Text style={styles.strongBody}>
            {selectedPlan.name} selected for your preview.
          </Text>
          <Text style={styles.small}>
            This creates no order, subscription or payment.
          </Text>
        </View>
      )}
      <View style={styles.planList}>
        {PLANS.map((plan) => (
          <Card key={plan.id} tinted={plan.id === selectedPlanId}>
            <Label>{plan.eyebrow}</Label>
            <View style={styles.cardTitleRow}>
              <Text style={styles.planName}>{plan.name}</Text>
              <Tag tone={plan.id === "reach" ? "amber" : "neutral"}>
                {plan.id === "reach" ? "FUTURE OPTION" : "CONCEPT"}
              </Tag>
            </View>
            <Text style={styles.body}>{plan.summary}</Text>
            <View style={styles.features}>
              {plan.features.map((feature) => (
                <View key={feature} style={styles.feature}>
                  <View style={styles.featureDot} />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>
            <Button
              secondary={plan.id === selectedPlanId}
              accessibilityLabel={`${plan.id === selectedPlanId ? "Selected" : "Preview"} ${plan.name} concept. No purchase.`}
              onPress={() => selectPlan(plan.id)}
            >
              {plan.id === selectedPlanId
                ? "Selected in preview"
                : "Choose in preview"}
            </Button>
          </Card>
        ))}
      </View>
      <Text style={styles.small}>
        Selections stay in memory for this app session only. These concepts are
        not offers for sale.
      </Text>
    </>
  );
}

function NetworkScreen() {
  return (
    <>
      <View style={styles.stack}>
        <Label>KNOW YOUR CONNECTION</Label>
        <Text accessibilityRole="header" style={styles.screenTitle}>
          Three paths.{"\n"}Different possibilities.
        </Text>
        <Text style={styles.body}>
          A clear explanation of the network options being explored for Onesa.
        </Text>
      </View>
      <Card tinted>
        <Tag tone="amber">NO LIVE NETWORK DATA</Tag>
        <Text style={styles.strongBody}>
          This preview does not detect your mobile carrier or satellite
          connection.
        </Text>
        <Text style={styles.body}>
          {liveActionAvailability("connect-satellite").reason}
        </Text>
      </Card>
      {NETWORK_FACTS.map((fact) => (
        <Card key={fact.title}>
          <Label>{fact.tag}</Label>
          <Text style={styles.cardHeading}>{fact.title}</Text>
          <Text style={styles.body}>{fact.description}</Text>
        </Card>
      ))}
      <View style={styles.notice}>
        <Text style={styles.strongBody}>
          Your phone and network control the connection.
        </Text>
        <Text style={styles.small}>
          An account app cannot switch on satellite service by itself. A partner
          agreement, local authorisation and supported device are needed. Native
          calling, data and messaging may have different availability.
        </Text>
      </View>
    </>
  );
}

function AccountScreen({
  selectedPlanId,
  reset,
}: {
  selectedPlanId: PlanId | null;
  reset: () => void;
}) {
  const selectedPlan = PLANS.find((plan) => plan.id === selectedPlanId);
  return (
    <>
      <View style={styles.stack}>
        <Label>YOUR SPACE</Label>
        <Text accessibilityRole="header" style={styles.screenTitle}>
          A preview, on your terms.
        </Text>
        <Text style={styles.body}>
          Explore the product before creating an account.
        </Text>
      </View>
      <Card>
        <SectionHeading>Preview settings</SectionHeading>
        <DetailRow
          label="Selected concept"
          value={selectedPlan?.name ?? "None selected"}
        />
        <DetailRow label="Account" value="No account created" />
        <DetailRow label="Subscription" value="None" />
        <DetailRow label="Payments" value="Unavailable" />
        <DetailRow label="App version" value="0.1.0 preview" />
        <Button secondary onPress={reset}>
          Reset this preview
        </Button>
      </Card>
      <View style={styles.grid}>
        <View style={styles.gridCell}>
          <Card>
            <Label>YOUR PRIVACY</Label>
            <Text style={styles.cardHeading}>No personal details needed.</Text>
            <Text style={styles.body}>
              This preview has no sign-up form, analytics, identity upload or
              payment collection. Your plan choice is kept only in app memory.
            </Text>
          </Card>
        </View>
        <View style={styles.gridCell}>
          <Card>
            <Label>WHAT COMES LATER</Label>
            <Text style={styles.cardHeading}>
              One place for your mobile life.
            </Text>
            <Text style={styles.body}>
              Identity, billing, usage and support can be connected after
              network, regulatory and provider agreements are confirmed.
            </Text>
          </Card>
        </View>
      </View>
      <Text style={styles.small}>
        {liveActionAvailability("activate-sim").reason}{" "}
        {liveActionAvailability("collect-payment").reason}
      </Text>
    </>
  );
}

function PreviewApp() {
  const [state, dispatch] = useReducer(previewReducer, INITIAL_PREVIEW);
  const insets = useSafeAreaInsets();
  const navigate = (screen: ScreenId) => dispatch({ type: "navigate", screen });

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
        <Text style={styles.headerTag}>ZIMBABWE</Text>
      </View>
      <View style={styles.demoBanner}>
        <View style={styles.frame}>
          <Text style={styles.demoText}>
            Development demo · No mobile service activated
          </Text>
        </View>
      </View>
      <ScrollView
        key={state.screen}
        style={styles.scroll}
        contentContainerStyle={[styles.frame, styles.content]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {state.screen === "home" && (
          <HomeScreen
            selectedPlanId={state.selectedPlanId}
            navigate={navigate}
          />
        )}
        {state.screen === "plans" && (
          <PlansScreen
            selectedPlanId={state.selectedPlanId}
            selectPlan={(planId) => dispatch({ type: "select-plan", planId })}
          />
        )}
        {state.screen === "network" && <NetworkScreen />}
        {state.screen === "account" && (
          <AccountScreen
            selectedPlanId={state.selectedPlanId}
            reset={() => dispatch({ type: "reset" })}
          />
        )}
      </ScrollView>
      <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={[styles.frame, styles.navInner]}>
          {tabs.map((tab) => (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: state.screen === tab.id }}
              onPress={() => navigate(tab.id)}
              style={({ pressed }) => [
                styles.navItem,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.navIndicator,
                  state.screen === tab.id && styles.navIndicatorActive,
                ]}
              />
              <Text
                style={[
                  styles.navText,
                  state.screen === tab.id && styles.navTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PreviewApp />
    </SafeAreaProvider>
  );
}
