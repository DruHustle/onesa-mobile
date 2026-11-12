import { Alert, Linking, Pressable, Text } from "react-native";
import { PASOFI } from "./domain";
import { Card, SectionHeading, styles } from "./ui";

export function PasofiCard() {
  const openPasofi = async () => {
    try {
      await Linking.openURL(PASOFI.url);
    } catch {
      Alert.alert("Visit PasoFi Wi-Fi", `Open ${PASOFI.url} in your browser.`);
    }
  };

  return (
    <Card tinted>
      <SectionHeading>PasoFi Wi-Fi</SectionHeading>
      <Text style={styles.body}>{PASOFI.introduction} {PASOFI.status}</Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => void openPasofi()}
        style={({ pressed }) => [styles.productLink, pressed && styles.pressed]}
      >
        <Text style={styles.productLinkText}>Visit PasoFi Wi-Fi</Text>
      </Pressable>
    </Card>
  );
}
