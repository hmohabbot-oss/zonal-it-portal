import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rajshahi Zone | Zonal IT Support",
  description: "Rajshahi Zone IT task and branch support portal",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
