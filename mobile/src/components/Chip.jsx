import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { CHIP_BG, LABEL } from "../theme";

/** Cross-platform status chip that mirrors the web design. */
export const Chip = ({ kind, value, style }) => {
  const bg = CHIP_BG[kind]?.[value] || "#FFFFFF";
  const label = LABEL[kind]?.[value] || value;
  const dark = ["#FFFFFF", "#FBBF24"].includes(bg);
  return (
    <View style={[styles.chip, { backgroundColor: bg }, style]}>
      <Text style={[styles.txt, { color: dark ? "#09090B" : "#FFFFFF" }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    borderWidth: 2, borderColor: "#09090B",
    paddingHorizontal: 8, paddingVertical: 2,
    alignSelf: "flex-start",
  },
  txt: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
});
