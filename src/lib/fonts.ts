import { Amiri, Aref_Ruqaa, Lalezar, Reem_Kufi } from "next/font/google";

// The "name print" fonts (the fifth, Readex Pro, is the site font). Used by the product page's
// font picker and by the admin order view. preload:false → files download only when rendered.
const ruqaa = Aref_Ruqaa({ subsets: ["arabic", "latin"], weight: "700", display: "swap", variable: "--font-ruqaa", preload: false });
const kufi = Reem_Kufi({ subsets: ["arabic", "latin"], weight: "500", display: "swap", variable: "--font-kufi", preload: false });
const naskh = Amiri({ subsets: ["arabic", "latin"], weight: "700", display: "swap", variable: "--font-naskh", preload: false });
const bold = Lalezar({ subsets: ["arabic", "latin"], weight: "400", display: "swap", variable: "--font-bold", preload: false });

/** className that defines the four CSS variables used by lib/name-fonts.ts */
export const nameFontVariables = `${ruqaa.variable} ${kufi.variable} ${naskh.variable} ${bold.variable}`;
