import type { Metadata } from "next";
import { Inter, Fredoka } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { LearnerProvider } from "@/contexts/LearnerContext";
import { PageTransition } from "@/components/layout/PageTransition";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fredoka = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Mission Control · Mars Mission Platform",
  description: "Pilot Sparky across Mars, code with blocks, and earn mission patches on the Red Planet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fredoka.variable} h-full antialiased dark`}
      style={{ colorScheme: 'dark' }}
    >
      <body className="min-h-full flex flex-col relative">
        {/* Clean starfield backdrop: a single drifting layer of distant stars,
            kept subtle so the UI reads like a punchy video feed, not a glow. */}
        <div className="pointer-events-none fixed -inset-[1200px] -z-10 starfield opacity-40 animate-drift" />

        {/* One restrained Mars glow anchored in a corner for warmth (no neon). */}
        <div className="pointer-events-none fixed -bottom-72 -right-52 h-[560px] w-[560px] rounded-full bg-gradient-mars opacity-[0.14] blur-3xl" />

        <LearnerProvider>
          <Navbar />
          {/* pb on mobile keeps content clear of the fixed bottom tab bar */}
          <div className="pb-16 md:pb-0">
            <PageTransition>{children}</PageTransition>
          </div>
        </LearnerProvider>
      </body>
    </html>
  );
}
