import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function RobotFace({ size = 280 }: { size?: number }) {
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const m = setInterval(() => {
      setLook({ x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 6 });
    }, 900);
    const b = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
    }, 3200);
    return () => { clearInterval(m); clearInterval(b); };
  }, []);

  // Use a stable size for SSR; update only after mount to avoid hydration mismatch
  const s = mounted ? size : 280;
  const eyeSize = s * 0.22;

  return (
    <motion.div
      suppressHydrationWarning
      style={{ width: s, height: s }}
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      className="relative"
    >
      <div
        className="absolute inset-0 rounded-[32%] neon-border"
        style={{
          background:
            "linear-gradient(160deg, color-mix(in oklab, var(--neon) 22%, var(--card)), var(--panel))",
        }}
      />
      {/* antenna */}
      <div className="absolute left-1/2 -top-8 -translate-x-1/2 flex flex-col items-center">
        <motion.div
          className="w-3 h-3 rounded-full"
          style={{ background: "var(--neon)", boxShadow: "0 0 18px var(--neon)" }}
          animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
        <div className="w-0.5 h-7" style={{ background: "color-mix(in oklab, var(--neon) 60%, transparent)" }} />
      </div>

      {/* eyes */}
      <div className="absolute inset-0 flex items-center justify-center gap-[18%]">
        {[0, 1].map((i) => (
          <div key={i} suppressHydrationWarning className="relative" style={{ width: eyeSize, height: eyeSize }}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle at 50% 50%, #001018, #000)",
                boxShadow: "inset 0 0 18px rgba(0,0,0,0.8)",
              }}
            />
            <motion.div
              className="absolute rounded-full"
              style={{
                left: "20%", top: "20%", width: "60%", height: "60%",
                background: "radial-gradient(circle, var(--neon) 0%, transparent 70%)",
                filter: "blur(2px)",
              }}
              animate={{ x: look.x, y: look.y, scaleY: blink ? 0.05 : 1 }}
              transition={{ type: "spring", stiffness: 120, damping: 12 }}
            />
            <motion.div
              className="absolute rounded-full"
              style={{
                left: "32%", top: "32%", width: "36%", height: "36%",
                background: "var(--neon)",
                boxShadow: "0 0 22px var(--neon)",
              }}
              animate={{ x: look.x, y: look.y, scaleY: blink ? 0.05 : 1 }}
              transition={{ type: "spring", stiffness: 120, damping: 12 }}
            />
          </div>
        ))}
      </div>

      {/* mouth */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[18%] flex gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <motion.div
            key={i}
            className="w-2 rounded-sm"
            style={{ background: "var(--neon-2)", boxShadow: "0 0 10px var(--neon-2)" }}
            animate={{ height: [6, 18, 6] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.1 }}
          />
        ))}
      </div>
    </motion.div>
  );
}
