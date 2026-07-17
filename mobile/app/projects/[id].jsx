import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, FlatList } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect, Link } from "expo-router";
import { API, errMsg } from "../../src/api/client";
import { Chip } from "../../src/components/Chip";
import { COLORS } from "../../src/theme";

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams();
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState("tasks");
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [issues, setIssues] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const [p, t, l, i] = await Promise.all([
        API.get(`/projects/${id}`),
        API.get(`/projects/${id}/tasks?page_size=50`),
        API.get(`/projects/${id}/logs?page_size=20`),
        API.get(`/projects/${id}/issues?page_size=30`),
      ]);
      setProject(p.data.data);
      setTasks(t.data.data);
      setLogs(l.data.data);
      setIssues(i.data.data);
      setErr("");
    } catch (e) { setErr(errMsg(e)); }
    finally { setRefreshing(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!project) return <View style={styles.center}><ActivityIndicator color={COLORS.ink} /></View>;

  return (
    <ScrollView
      style={styles.root}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {err ? <Text style={styles.err}>{err}</Text> : null}
      <View style={styles.header}>
        <Chip kind="project" value={project.status} />
        <Text style={styles.title}>{project.name}</Text>
        {!!project.description && <Text style={styles.desc}>{project.description}</Text>}
        <View style={styles.statsRow}>
          <Stat n={project.stats.tasks_total} l="Tasks" />
          <Stat n={project.stats.open_issues} l="Open Issues" />
          <Stat n={`${project.stats.progress_pct}%`} l="Progress" />
        </View>
      </View>

      <View style={styles.quickBar}>
        <TouchableOpacity style={styles.quickBtn} onPress={() => router.push(`/projects/${id}/new-log`)}>
          <Text style={styles.quickText}>+ Daily Log</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.quickBtn, { backgroundColor: COLORS.signal }]} onPress={() => router.push(`/projects/${id}/new-issue`)}>
          <Text style={[styles.quickText, { color: "#fff" }]}>+ Raise Issue</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabsRow}>
        {["tasks", "logs", "issues"].map((k) => (
          <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabActive]} onPress={() => setTab(k)}>
            <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{k.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "tasks" && (
        <View style={{ padding: 12 }}>
          {tasks.length === 0 ? <Text style={styles.empty}>No tasks.</Text> : tasks.map((t) => (
            <View key={t.id} style={styles.itemCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{t.title}</Text>
                <Chip kind="task" value={t.status} />
              </View>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                <Chip kind="priority" value={t.priority} />
                {t.assignee && <Text style={styles.meta}>👤 {t.assignee.name}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}

      {tab === "logs" && (
        <View style={{ padding: 12 }}>
          {logs.length === 0 ? <Text style={styles.empty}>No daily logs.</Text> : logs.map((l) => (
            <View key={l.id} style={styles.itemCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{l.date}</Text>
                <Chip kind="weather" value={l.weather} />
              </View>
              <Text style={styles.meta} numberOfLines={2}>{l.work_summary}</Text>
              <Text style={styles.meta}>Labour: {l.labour_count} · Status: {l.status}</Text>
            </View>
          ))}
        </View>
      )}

      {tab === "issues" && (
        <View style={{ padding: 12 }}>
          {issues.length === 0 ? <Text style={styles.empty}>No issues.</Text> : issues.map((i) => (
            <View key={i.id} style={styles.itemCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{i.title}</Text>
                <Chip kind="issue" value={i.status} />
              </View>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                <Chip kind="category" value={i.category} />
                <Chip kind="priority" value={i.priority} />
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const Stat = ({ n, l }) => (
  <View style={styles.stat}><Text style={styles.statN}>{n}</Text><Text style={styles.statL}>{l}</Text></View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.muted },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  err: { color: COLORS.signal, padding: 12 },
  header: { backgroundColor: "#fff", borderBottomWidth: 2, borderColor: COLORS.ink, padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: "900", color: COLORS.ink, textTransform: "uppercase", marginTop: 4 },
  desc: { color: "#52525b" },
  statsRow: { flexDirection: "row", borderWidth: 2, borderColor: COLORS.ink, marginTop: 8 },
  stat: { flex: 1, padding: 8, alignItems: "center", borderRightWidth: 2, borderColor: COLORS.ink },
  statN: { fontSize: 20, fontWeight: "900" },
  statL: { fontSize: 9, letterSpacing: 1.5, color: "#71717a", textTransform: "uppercase" },
  quickBar: { flexDirection: "row", gap: 8, padding: 12 },
  quickBtn: { flex: 1, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.safety, padding: 12, alignItems: "center" },
  quickText: { fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  tabsRow: { flexDirection: "row", paddingHorizontal: 12, gap: 6 },
  tab: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: "#fff" },
  tabActive: { backgroundColor: COLORS.ink },
  tabText: { fontWeight: "800", fontSize: 11, letterSpacing: 1.5 },
  tabTextActive: { color: "#fff" },
  itemCard: { backgroundColor: "#fff", borderWidth: 2, borderColor: COLORS.ink, padding: 12, marginBottom: 8 },
  itemTitle: { fontWeight: "800", flex: 1, marginRight: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  meta: { color: "#52525b", fontSize: 12, marginTop: 4 },
  empty: { textAlign: "center", padding: 40, color: "#71717a", textTransform: "uppercase", letterSpacing: 1.5, fontSize: 12 },
});
