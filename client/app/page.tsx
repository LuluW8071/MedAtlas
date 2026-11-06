"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatShell } from "@/components/chat/chat-shell";
import { apiUrl } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");

  useEffect(() => {
    fetch(`${apiUrl}/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return router.replace("/auth");
        const data = (await response.json()) as { user: { email: string } };
        setEmail(data.user.email);
      })
      .catch(() => router.replace("/auth"));
  }, [router]);

  async function logout() {
    await fetch(`${apiUrl}/auth/logout`, { method: "POST", credentials: "include" });
    router.replace("/auth");
  }

  return email ? <ChatShell email={email} onLogout={() => void logout()} /> : null;
}
