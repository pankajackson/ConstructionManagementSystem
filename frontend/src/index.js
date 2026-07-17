import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <BrowserRouter>
    <AuthProvider>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            border: "2px solid #09090b",
            background: "#fff",
            color: "#09090b",
            fontFamily: "IBM Plex Sans, sans-serif",
            boxShadow: "4px 4px 0px 0px rgba(9,9,11,1)",
            borderRadius: 0,
          },
        }}
      />
    </AuthProvider>
  </BrowserRouter>
);
