import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Image, Alert, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { API, errMsg } from "../../../src/api/client";
import { saveDraft, deleteDraft } from "../../../src/api/offlineDrafts";
import { COLORS } from "../../../src/theme";

const WEATHERS = [
  ["sunny", "Sunny"],
  ["cloudy", "Cloudy"],
  ["rainy", "Rainy"],
  ["stopped_work", "Stopped Work"],
];

export default function NewLogScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: today, labour_count: "0", work_summary: "", material_summary: "", weather: "sunny", remarks: "", photos: [],
  });
  const [busy, setBusy] = useState(false);

  const pickImage = async () => {
    if (form.photos.length >= 10) { Alert.alert("Max 10 photos"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (res.canceled) return;
    await uploadFile(res.assets[0]);
  };

  const takePhoto = async () => {
    if (form.photos.length >= 10) { Alert.alert("Max 10 photos"); return; }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Camera permission required"); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (res.canceled) return;
    await uploadFile(res.assets[0]);
  };

  const uploadFile = async (asset) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", { uri: asset.uri, name: asset.fileName || `photo_${Date.now()}.jpg`, type: asset.mimeType || "image/jpeg" });
      const { data } = await API.post("/uploads/image", fd, { headers: { "Content-Type": "multipart/form-data" }});
      setForm({ ...form, photos: [...form.photos, data.data.url] });
    } catch (e) { Alert.alert("Upload failed", errMsg(e)); }
    finally { setBusy(false); }
  };

  const submit = async (status) => {
    setBusy(true);
    try {
      await API.post(`/projects/${id}/logs`, {
        date: form.date,
        labour_count: parseInt(form.labour_count || "0", 10),
        work_summary: form.work_summary,
        material_summary: form.material_summary,
        weather: form.weather,
        remarks: form.remarks,
        photos: form.photos,
        status,
      });
      router.back();
    } catch (e) {
      // Offline / API failure — persist draft locally
      const local_id = `${id}:${form.date}:${Date.now()}`;
      await saveDraft({ local_id, project_id: id, ...form, status });
      Alert.alert("Saved offline", "We'll retry when back online.");
      router.back();
    } finally { setBusy(false); }
  };

  return (
    <ScrollView style={styles.root} keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <Label>Date</Label>
        <TextInput style={styles.input} value={form.date} onChangeText={(v) => setForm({ ...form, date: v })} placeholder="YYYY-MM-DD" />
        <Label>Labour count</Label>
        <TextInput style={styles.input} keyboardType="number-pad" value={form.labour_count} onChangeText={(v) => setForm({ ...form, labour_count: v.replace(/\D/g, "") || "0" })} />
        <Label>Weather</Label>
        <View style={styles.pillGroup}>
          {WEATHERS.map(([k, l]) => (
            <TouchableOpacity key={k} style={[styles.pill, form.weather === k && styles.pillActive]} onPress={() => setForm({ ...form, weather: k })}>
              <Text style={[styles.pillText, form.weather === k && { color: "#fff" }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Label>Work summary *</Label>
        <TextInput style={[styles.input, { height: 100 }]} multiline maxLength={2000} value={form.work_summary} onChangeText={(v) => setForm({ ...form, work_summary: v })} />
        <Label>Materials</Label>
        <TextInput style={[styles.input, { height: 70 }]} multiline maxLength={1000} value={form.material_summary} onChangeText={(v) => setForm({ ...form, material_summary: v })} />
        <Label>Remarks</Label>
        <TextInput style={[styles.input, { height: 60 }]} multiline value={form.remarks} onChangeText={(v) => setForm({ ...form, remarks: v })} />

        <Label>Photos ({form.photos.length}/10)</Label>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {form.photos.map((u, i) => (
            <Image key={i} source={{ uri: u }} style={styles.photo} />
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <TouchableOpacity style={styles.imgBtn} onPress={takePhoto}><Text style={styles.imgBtnText}>📷 Camera</Text></TouchableOpacity>
          <TouchableOpacity style={styles.imgBtn} onPress={pickImage}><Text style={styles.imgBtnText}>🖼 Gallery</Text></TouchableOpacity>
        </View>
      </View>
      <View style={styles.bar}>
        <TouchableOpacity style={styles.btn} disabled={busy} onPress={() => submit("draft")}>
          <Text style={styles.btnTxt}>{busy ? "..." : "Save Draft"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} disabled={busy || !form.work_summary} onPress={() => submit("submitted")}>
          <Text style={[styles.btnTxt, { color: "#09090b" }]}>{busy ? "Submitting..." : "Submit"}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.muted },
  section: { padding: 16 },
  label: { fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: COLORS.ink, marginTop: 12, marginBottom: 4, fontWeight: "800" },
  input: { borderWidth: 2, borderColor: COLORS.ink, backgroundColor: "#fff", padding: 10, fontSize: 15, textAlignVertical: "top" },
  pillGroup: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: "#fff" },
  pillActive: { backgroundColor: COLORS.ink },
  pillText: { fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
  photo: { width: 72, height: 72, borderWidth: 2, borderColor: COLORS.ink },
  imgBtn: { flex: 1, padding: 12, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: "#fff", alignItems: "center" },
  imgBtnText: { fontWeight: "800" },
  bar: { flexDirection: "row", padding: 12, gap: 8, backgroundColor: "#fff", borderTopWidth: 2, borderColor: COLORS.ink },
  btn: { flex: 1, padding: 14, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: "#fff", alignItems: "center" },
  btnPrimary: { backgroundColor: COLORS.safety },
  btnTxt: { fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
});
