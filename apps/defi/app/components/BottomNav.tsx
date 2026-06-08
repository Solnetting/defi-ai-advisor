"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Icons: unicode glyphs from the Figma DS (86:6 Bottom Nav).
// NEVER substitute these with SVG or invented icons.
// If a new tab is needed, define the glyph in Figma DS first, then mirror it here.
const tabs = [
  { href: "/",          label: "Plans",     icon: "⌂" },
  { href: "/portfolio", label: "Portfolio", icon: "⊕" },
  { href: "/explore",   label: "Explore",   icon: "◎" },
  { href: "/swap",      label: "Swap",      icon: "⇄" },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="shrink-0 border-t border-gray-900 flex bg-black">
      {tabs.map(({ href, label, icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center pt-3 pb-3 gap-1 transition-colors ${
              active ? "text-white" : "text-[#3f3f46] hover:text-gray-400"
            }`}
          >
            <span className="text-xl leading-none">{icon}</span>
            <span className={`text-xs ${active ? "font-semibold" : "font-normal"}`}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
