import "./globals.css";

export const metadata = {
  title: "TubeForecaster — Rate your next YouTube video idea",
  description:
    "Paste a channel and a video idea. Get an AI-powered score, predicted views, and tips before you ever hit record.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
