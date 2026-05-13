export const metadata = {
  title: "LegacyX API Server",
  description: "Core API for the LegacyX clinic platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
