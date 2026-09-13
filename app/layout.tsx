import type { Metadata } from "next";
import {getPublicWorkspace} from '@/lib/workspace';
import "./globals.css";

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return {
    title: workspace.productName,
    description: `Prayer graphics for ${workspace.organizationName} broadcast production.`,
    other: {"codex-preview": "development"},
    icons: {icon: workspace.logo.src, shortcut: workspace.logo.src},
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

