import { Inter, Poppins } from "next/font/google";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-inter" });
const poppins = Poppins({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap", variable: "--font-poppins" });

export const collectionFonts = `${inter.variable} ${poppins.variable}`;
