import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.safety,
        tabBarInactiveTintColor: "#a1a1aa",
        tabBarStyle: { backgroundColor: COLORS.ink, borderTopWidth: 2, borderTopColor: COLORS.ink, height: 64, paddingBottom: 8 },
        headerStyle: { backgroundColor: COLORS.ink },
        headerTitleStyle: { color: "#fff", fontWeight: "900", letterSpacing: 0.5 },
        headerTintColor: "#fff",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Projects", tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: "Inbox", tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
