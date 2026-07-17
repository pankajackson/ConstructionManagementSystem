import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { API, errMsg } from "../../../src/api/client";
import { COLORS } from "../../../src/theme";

const CATS = [["safety", "Safety"], ["quality", "Quality"], ["design", "Design"], ["material", "Material"], ["other", "Other"]];
const PRIOS = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["critical", "Critical"]];

export default function NewIssueScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [form, setForm] = useState({ title: "", description: "", category: "safety", priority: "medium", attachments: [] });
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (form.attachments.length >= 5) return;
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (res.canceled) return;
    const fd = new FormData();
    fd.append("file", { uri: res.assets[0].uri, name: `iss_${Date.now()}.jpg`, type: "image/jpeg" });
    try {
      const { data } = await API.post("/uploads/image", fd, { headers: { "Content-Type": "multipart/form-data" }});
      setForm({ ...form, attachments: [...form.attachments, data.data.url] });
    } catch (e) { Alert.alert("Upload failed", errMsg(e)); }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await API.post(`/projects/${id}/issues`, form);
      router.back();
    } catch (e) { Alert.alert("Failed", errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <ScrollView style={styles.root} keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <Text style={styles.label}>Title *</Text>
        <TextInput style={styles.input} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="Short summary" />
        <Text style={styles.label}>Description</Text>
        <TextInput style={[styles.input, { height: 90 }]} multiline value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} />

        <Text style={styles.label}>Category *</Text>
        <View style={styles.pillGroup}>
          {CATS.map(([k, l]) => (
            <TouchableOpacity key={k} style={[styles.pill, form.category === k && styles.pillActive]} onPress={() => setForm({ ...form, category: k })}>
              <Text style={[styles.pillText, form.category === k && { color: "#fff" }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Priority</Text>
        <View style={styles.pillGroup}>
          {PRIOS.map(([k, l]) => (
            <TouchableOpacity key={k} style={[styles.pill, form.priority === k && styles.pillActive]} onPress={() => setForm({ ...form, priority: k })}>
              <Text style={[styles.pillText, form.priority === k && { color: "#fff" }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Photos ({form.attachments.length}/5)</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {form.attachments.map((u, i) => (<Image key={i} source={{ uri: u }} style={styles.photo} />))}
        </View>
        <TouchableOpacity style={styles.imgBtn} onPress={upload}>
          <Text style={styles.imgBtnText}>📷 Attach Photo</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.bar}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.signal }]} disabled={busy || !form.title} onPress={submit}>
          <Text style={[styles.btnTxt, { color: "#fff" }]}>{busy ? "Raising..." : "Raise Issue"}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.muted },
  section: { padding: 16 },
  label: { fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: COLORS.ink, marginTop: 12, marginBottom: 4, fontWeight: "800" },
  input: { borderWidth: 2, borderColor: COLORS.ink, backgroundColor: "#fff", padding: 10, fontSize: 15, textAlignVertical: "top" },
  pillGroup: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: "#fff" },
  pillActive: { backgroundColor: COLORS.ink },
  pillText: { fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
  photo: { width: 72, height: 72, borderWidth: 2, borderColor: COLORS.ink },
  imgBtn: { padding: 12, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: "#fff", alignItems: "center", marginTop: 10 },
  imgBtnText: { fontWeight: "800" },
  bar: { padding: 12, backgroundColor: "#fff", borderTopWidth: 2, borderColor: COLORS.ink },
  btn: { padding: 14, borderWidth: 2, borderColor: COLORS.ink, alignItems: "center" },
  btnTxt: { fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
});
