import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { API, errMsg } from "../src/api/client";
import { useAuth } from "../src/context/AuthContext";
import { COLORS } from "../src/theme";

const DEMOS = [
  ["admin@demo.com", "Admin"],
  ["pm@demo.com", "Project Manager"],
  ["engineer@demo.com", "Site Engineer"],
  ["viewer@demo.com", "Viewer"],
];

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email");
  const [busy, setBusy] = useState(false);
  const [devOtp, setDevOtp] = useState("");
  const [err, setErr] = useState("");
  const { login } = useAuth();
  const router = useRouter();

  const request = async (targetEmail = email) => {
    setErr(""); setBusy(true);
    try {
      const { data } = await API.post("/auth/request-otp", { email: targetEmail.trim().toLowerCase() });
      setEmail(targetEmail); setStep("otp"); setDevOtp(data.data.dev_otp || "");
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const verify = async () => {
    if (code.length !== 6) return;
    setErr(""); setBusy(true);
    try {
      const { data } = await API.post("/auth/verify-otp", { email: email.trim().toLowerCase(), code });
      await login(data.data);
      router.replace("/");
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const runDemo = async (dEmail) => {
    setErr(""); setBusy(true);
    try {
      const r = await API.post("/auth/request-otp", { email: dEmail });
      const otp = r.data.data.dev_otp;
      if (!otp) { setEmail(dEmail); setStep("otp"); setBusy(false); return; }
      const v = await API.post("/auth/verify-otp", { email: dEmail, code: otp });
      await login(v.data.data);
      router.replace("/");
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logoBox}><Text style={styles.logoEmoji}>⛑</Text></View>
          <Text style={styles.logo}>CONSTRUCT<Text style={{ color: COLORS.safety }}>OS</Text></Text>
          <Text style={styles.tagline}>Site Operations Platform</Text>
        </View>

        <View style={styles.card}>
          {step === "email" ? (
            <>
              <Text style={styles.h1}>Sign in</Text>
              <Text style={styles.sub}>We'll email you a 6-digit code. No password.</Text>
              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" />
              <TouchableOpacity style={[styles.btn, styles.btnSafety]} disabled={busy || !email} onPress={() => request()}>
                <Text style={styles.btnText}>{busy ? "Sending..." : "Send OTP"}</Text>
              </TouchableOpacity>

              <Text style={[styles.label, { marginTop: 24 }]}>Try the demo</Text>
              <View style={styles.demoGrid}>
                {DEMOS.map(([e, r]) => (
                  <TouchableOpacity key={e} style={styles.demoBtn} onPress={() => runDemo(e)}>
                    <Text style={styles.demoText}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => { setStep("email"); setCode(""); }}>
                <Text style={styles.back}>← Change email</Text>
              </TouchableOpacity>
              <Text style={styles.h1}>Enter code</Text>
              <Text style={styles.sub}>Sent to {email}</Text>
              {devOtp ? (
                <View style={styles.devOtpBox}>
                  <Text style={styles.devLabel}>Dev mode OTP</Text>
                  <Text style={styles.devOtp}>{devOtp}</Text>
                </View>
              ) : null}
              <Text style={styles.label}>6-digit code</Text>
              <TextInput style={[styles.input, styles.otpInput]} value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={6} placeholder="••••••" />
              <TouchableOpacity style={[styles.btn, styles.btnSafety]} disabled={busy || code.length !== 6} onPress={verify}>
                <Text style={styles.btnText}>{busy ? "Verifying..." : "Verify & Sign In"}</Text>
              </TouchableOpacity>
            </>
          )}
          {err ? <Text style={styles.err}>{err}</Text> : null}
          {busy ? <ActivityIndicator style={{ marginTop: 12 }} color={COLORS.ink} /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.muted },
  scroll: { padding: 20, paddingTop: 60 },
  brand: { alignItems: "center", marginBottom: 32 },
  logoBox: { width: 56, height: 56, backgroundColor: COLORS.safety, borderWidth: 2, borderColor: COLORS.ink, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  logoEmoji: { fontSize: 30, color: COLORS.ink },
  logo: { fontSize: 34, fontWeight: "900", color: COLORS.ink, letterSpacing: -1 },
  tagline: { fontSize: 10, letterSpacing: 2, color: "#71717a", marginTop: 4, textTransform: "uppercase" },
  card: { backgroundColor: "#fff", borderWidth: 2, borderColor: COLORS.ink, padding: 20 },
  h1: { fontSize: 28, fontWeight: "900", color: COLORS.ink, textTransform: "uppercase" },
  sub: { fontSize: 13, color: "#52525b", marginTop: 4, marginBottom: 16 },
  label: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: COLORS.ink, marginBottom: 6, textTransform: "uppercase" },
  input: { borderWidth: 2, borderColor: COLORS.ink, padding: 12, fontSize: 16, backgroundColor: "#fff", marginBottom: 12 },
  otpInput: { fontSize: 24, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", letterSpacing: 8, textAlign: "center" },
  btn: { padding: 14, borderWidth: 2, borderColor: COLORS.ink, alignItems: "center" },
  btnSafety: { backgroundColor: COLORS.safety },
  btnText: { fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  demoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  demoBtn: { flexBasis: "48%", padding: 12, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: "#fff", alignItems: "center" },
  demoText: { fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
  back: { color: "#52525b", marginBottom: 8, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5 },
  devOtpBox: { backgroundColor: "#FEF3C7", borderWidth: 2, borderColor: COLORS.safety, padding: 10, marginBottom: 12 },
  devLabel: { fontSize: 10, letterSpacing: 2, color: "#52525b", textTransform: "uppercase" },
  devOtp: { fontSize: 22, fontWeight: "800", letterSpacing: 6, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  err: { color: COLORS.signal, marginTop: 10, fontWeight: "600" },
});
