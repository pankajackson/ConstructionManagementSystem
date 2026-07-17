import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../../src/context/AuthContext";
import { COLORS, LABEL } from "../../src/theme";

export default function ProfileScreen() {
  const { user, orgs, orgId, currentRole, logout } = useAuth();
  const currentOrg = orgs.find((o) => o.id === orgId);

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.overline}>Account</Text>
        <Text style={styles.name}>{user?.name || "—"}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>
      {currentOrg && (
        <View style={styles.card}>
          <Text style={styles.overline}>Current Organization</Text>
          <Text style={styles.name}>{currentOrg.name}</Text>
          <Text style={styles.email}>Role: {LABEL.role[currentRole]}</Text>
        </View>
      )}
      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.muted, padding: 16 },
  card: { backgroundColor: "#fff", borderWidth: 2, borderColor: COLORS.ink, padding: 16, marginBottom: 12 },
  overline: { fontSize: 10, letterSpacing: 2, color: "#71717a", textTransform: "uppercase" },
  name: { fontSize: 20, fontWeight: "900", color: COLORS.ink, marginTop: 4 },
  email: { fontSize: 13, color: "#52525b", marginTop: 4 },
  logout: { marginTop: 12, backgroundColor: COLORS.signal, borderWidth: 2, borderColor: COLORS.ink, padding: 14, alignItems: "center" },
  logoutText: { color: "#fff", fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
});
