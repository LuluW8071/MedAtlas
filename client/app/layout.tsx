import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedAtlas | Clinical knowledge assistant",
  description: "Ask questions across your clinical knowledge base.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
