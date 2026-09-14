import "./globals.css";

export const metadata = {
  title: "Signal Desk — Live",
  description:
    "Live problem-sensing dashboard: real complaints scanned, clustered, and scored, with drafted (never auto-sent) outreach.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
