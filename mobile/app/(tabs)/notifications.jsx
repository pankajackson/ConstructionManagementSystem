import React, { useCallback, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, RefreshControl, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { API, errMsg } from "../../src/api/client";
import { COLORS } from "../../src/theme";

export default function NotificationsScreen() {
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    try { const { data } = await API.get("/notifications"); setItems(data.data || []); }
    catch (e) {}
    finally { setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = async (n) => {
    if (!n.is_read) API.post(`/notifications/${n.id}/read`).catch(() => {});
    if (n.project_id) router.push(`/projects/${n.project_id}`);
  };

  const readAll = async () => { await API.post("/notifications/read-all"); load(); };

  return (
    <View style={styles.root}>
      <TouchableOpacity style={styles.readAll} onPress={readAll}>
        <Text style={styles.readAllText}>Mark all read</Text>
      </TouchableOpacity>
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.row, !item.is_read && styles.unread]} onPress={() => open(item)}>
            <View style={styles.dot(!item.is_read)} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body} numberOfLines={2}>{item.message}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>You're all caught up.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.muted },
  readAll: { alignSelf: "flex-end", margin: 12, borderWidth: 2, borderColor: COLORS.ink, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#fff" },
  readAllText: { fontWeight: "800", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  row: { flexDirection: "row", padding: 12, backgroundColor: "#fff", borderWidth: 2, borderColor: COLORS.ink, marginHorizontal: 12, marginBottom: 8, gap: 10 },
  unread: { backgroundColor: "#FEF3C7" },
  dot: (on) => ({ width: 10, height: 10, marginTop: 6, backgroundColor: on ? COLORS.safety : "#ccc", borderWidth: 2, borderColor: COLORS.ink }),
  title: { fontWeight: "800" },
  body: { color: "#52525b", fontSize: 13, marginTop: 2 },
  empty: { padding: 40, textAlign: "center", color: "#71717a", textTransform: "uppercase", letterSpacing: 1.5, fontSize: 12 },
});
