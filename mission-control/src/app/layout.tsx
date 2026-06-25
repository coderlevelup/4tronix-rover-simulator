import type { Metadata } from "next";
import { Inter, Fredoka } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { AuthProvider } from "@/contexts/AuthContext";
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
        {/* Layered galaxy backdrop */}
        <div className="pointer-events-none fixed inset-0 -z-10 milky-way opacity-60" />
        <div className="pointer-events-none fixed inset-0 -z-10 nebula opacity-80" />
        <div className="pointer-events-none fixed -inset-[1200px] -z-10 starfield opacity-90 animate-drift" />
        <div
          className="pointer-events-none fixed -inset-[1200px] -z-10 starfield opacity-50"
          style={{ animation: "drift 420s linear infinite reverse", backgroundSize: "1100px 1100px" }}
        />

        {/* Soft planet glows */}
        <div className="pointer-events-none fixed -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-cosmic/30 blur-3xl" />
        <div className="pointer-events-none fixed -bottom-60 -right-40 h-[640px] w-[640px] rounded-full bg-gradient-mars opacity-30 blur-3xl" />

        <AuthProvider>
          <LearnerProvider>
            <Navbar />
            {/* pb on mobile keeps content clear of the fixed bottom tab bar */}
            <div className="pb-16 md:pb-0">
              <PageTransition>{children}</PageTransition>
            </div>
          </LearnerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
