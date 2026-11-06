"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { flushSync } from "react-dom";

export function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();

	function toggle(event: React.MouseEvent<HTMLButtonElement>) {
		const next = resolvedTheme === "dark" ? "light" : "dark";
		const reduceMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		if (!document.startViewTransition || reduceMotion) {
			setTheme(next);
			return;
		}

		const { clientX: x, clientY: y } = event;
		const radius = Math.hypot(
			Math.max(x, window.innerWidth - x),
			Math.max(y, window.innerHeight - y),
		);
		// flushSync so next-themes has switched the class before the "after" snapshot is taken.
		const transition = document.startViewTransition(() =>
			flushSync(() => setTheme(next)),
		);
		transition.ready.then(() =>
			document.documentElement.animate(
				{
					clipPath: [
						`circle(0px at ${x}px ${y}px)`,
						`circle(${radius}px at ${x}px ${y}px)`,
					],
				},
				{
					duration: 350,
					easing: "cubic-bezier(0.65, 0, 0.35, 1)",
					pseudoElement: "::view-transition-new(root)",
				},
			),
		);
	}

	return (
		<button
			type="button"
			onClick={toggle}
			className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-zinc-800 dark:hover:text-slate-100"
			aria-label="Toggle theme"
		>
			{resolvedTheme === "dark" ? (
				<Sun className="h-4 w-4" />
			) : (
				<Moon className="h-4 w-4" />
			)}
		</button>
	);
}
