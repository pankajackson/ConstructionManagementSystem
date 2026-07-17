import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { API, errMsg } from "../../src/api/client";
import { Chip } from "../../src/components/Chip";
import { COLORS } from "../../src/theme";

export default function ProjectsListScreen() {
  const [items, setItems] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    try { const { data } = await API.get("/projects"); setItems(data.data); setErr(""); }
    catch (e) { setErr(errMsg(e)); setItems([]); }
    finally { setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item: p }) => (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/projects/${p.id}`)}>
      <View style={styles.rowBetween}>
        <Text style={styles.overline}>Project</Text>
        <Chip kind="project" value={p.status} />
      </View>
      <Text style={styles.title}>{p.name}</Text>
      {!!p.location && <Text style={styles.loc}>📍 {p.location}</Text>}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${p.stats.progress_pct}%` }]} />
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statBox}><Text style={styles.statNum}>{p.stats.tasks_total}</Text><Text style={styles.statLabel}>Tasks</Text></View>
        <View style={styles.statBox}><Text style={styles.statNum}>{p.stats.open_issues}</Text><Text style={styles.statLabel}>Open Issues</Text></View>
        <View style={styles.statBox}><Text style={styles.statNum}>{p.stats.logs_this_week}</Text><Text style={styles.statLabel}>Logs · 7d</Text></View>
      </View>
    </TouchableOpacity>
  );

  if (items === null) return <View style={styles.center}><ActivityIndicator color={COLORS.ink} size="large" /></View>;

  return (
    <View style={styles.root}>
      {err ? <Text style={styles.err}>{err}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Text style={styles.empty}>No projects yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.muted },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.muted },
  card: { backgroundColor: "#fff", borderWidth: 2, borderColor: COLORS.ink, padding: 16, marginBottom: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  overline: { fontSize: 10, letterSpacing: 2, color: "#71717a", textTransform: "uppercase" },
  title: { fontSize: 22, fontWeight: "900", color: COLORS.ink, letterSpacing: -0.5, textTransform: "uppercase", marginBottom: 6 },
  loc: { fontSize: 12, color: "#52525b", marginBottom: 10 },
  progressBar: { height: 10, backgroundColor: COLORS.muted, borderWidth: 2, borderColor: COLORS.ink, marginTop: 6, marginBottom: 10 },
  progressFill: { height: "100%", backgroundColor: COLORS.safety },
  statsRow: { flexDirection: "row", borderWidth: 2, borderColor: COLORS.ink },
  statBox: { flex: 1, alignItems: "center", padding: 8, borderRightWidth: 2, borderColor: COLORS.ink },
  statNum: { fontSize: 22, fontWeight: "900" },
  statLabel: { fontSize: 9, letterSpacing: 1.5, color: "#71717a", textTransform: "uppercase" },
  err: { color: COLORS.signal, padding: 12 },
  empty: { textAlign: "center", padding: 40, color: "#71717a", textTransform: "uppercase", letterSpacing: 1.5, fontSize: 12 },
});
