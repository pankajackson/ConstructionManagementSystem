import React from "react";
import { Stack, useRouter, useSegments, useRootNavigationState } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../src/context/AuthContext";

// Wraps navigation state and redirects to /login when not authenticated.
function ProtectedShell({ children }) {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();

  React.useEffect(() => {
    if (loading || !navState?.key) return;
    const inAuth = segments[0] === "login";
    if (!user && !inAuth) router.replace("/login");
    else if (user && inAuth) router.replace("/");
  }, [user, loading, segments, navState?.key]);

  return children;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <ProtectedShell>
        <Stack screenOptions={{ headerStyle: { backgroundColor: "#09090B" }, headerTintColor: "#fff", headerTitleStyle: { fontWeight: "800" } }}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="projects/[id]" options={{ title: "Project" }} />
          <Stack.Screen name="projects/[id]/new-log" options={{ title: "New Daily Log", presentation: "modal" }} />
          <Stack.Screen name="projects/[id]/new-issue" options={{ title: "Raise Issue", presentation: "modal" }} />
        </Stack>
      </ProtectedShell>
    </AuthProvider>
  );
}
