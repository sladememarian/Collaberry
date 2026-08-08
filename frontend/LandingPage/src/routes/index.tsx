import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Vite rewrites `base` into index.html and into *imported* asset URLs, but not
// into string literals like these — so a bare "/assets/x.png" 404s once the site
// is served from /landing/. BASE_URL carries the configured base (with trailing
// slash) in both dev and build, so these stay correct wherever it's mounted.
const asset = (file: string) => `${import.meta.env.BASE_URL}assets/${file}`;

const collaberryLogo = asset("collaberry-logo.png");
const logoIcon = asset("logo-icon.png");
const bobBot = asset("bob-bot.png");
const ssTask = asset("screenshot-task.png");
const ssWorkspace = asset("screenshot-workspace.png");
const ssKanban = asset("screenshot-kanban.png");


export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    title: "Collaberry | Modern Project Workspace",
    meta: [
      {
        name: "description",
        content: "A futuristic project workspace where teams handle their projects via a sleek Kanban view. Built for speed and collaboration.",
      },
      { property: "og:title", content: "Collaberry | Modern Project Workspace" },
      {
        property: "og:description",
        content: "A futuristic project workspace where teams handle their projects via a sleek Kanban view.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 500);
          return 100;
        }
        return prev + 1;
      });
    }, 20);
    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-purple-900/10 to-transparent"></div>
      
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ 
          type: "spring",
          stiffness: 260,
          damping: 20,
          delay: 0.1 
        }}
        className="relative mb-8 flex flex-col items-center"
      >
        <div className="absolute inset-0 animate-pulse rounded-full bg-purple-600/20 blur-3xl"></div>
        <div className="relative h-48 w-48 overflow-hidden rounded-2xl flex items-center justify-center">
          <img
            src={collaberryLogo}
            alt="Collaberry Icon"
            className="h-[140%] w-[140%] max-w-none object-cover"
            style={{ 
              objectPosition: "center",
              transform: "scale(1.35)"
            }}
          />
        </div>
        <motion.h2 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-4 text-4xl font-bold tracking-tighter text-white font-sans"
        >
          Collaberry
        </motion.h2>
      </motion.div>

      <div className="relative h-1 w-72 overflow-hidden rounded-full bg-zinc-800/50 backdrop-blur-sm">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-fuchsia-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
        />
      </div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-6 flex flex-col items-center gap-2"
      >
        <p className="font-mono text-[10px] tracking-[0.3em] text-zinc-500 uppercase">
          Initializing Neural Workspace
        </p>
        <span className="text-xl font-bold text-white tracking-widest">{progress}%</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
        className="absolute bottom-10 flex items-center gap-3 text-zinc-600"
      >
        <img src={logoIcon} className="h-4 w-4 opacity-50" alt="" />
        <span className="text-[10px] uppercase tracking-tighter">Collaberry Engine v2.4.0</span>
      </motion.div>
    </motion.div>
  );
}


function Index() {
  const [loading, setLoading] = useState(true);

  return (
    <div
      data-testid="landing-root"
      className="min-h-screen bg-black text-white selection:bg-purple-500/30"
    >
      <AnimatePresence>
        {loading && <LoadingScreen onComplete={() => setLoading(false)} />}
      </AnimatePresence>

      <div className={loading ? "hidden" : "block"}>
        {/* Navigation */}
        <nav className="fixed top-0 z-40 w-full border-b border-white/5 bg-black/50 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <img src={logoIcon} alt="Logo" className="h-8 w-8 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" />
              <span className="text-xl font-bold tracking-tighter">COLLABERRY</span>
            </div>
            <div className="hidden items-center gap-8 text-xs font-mono uppercase tracking-[0.2em] text-zinc-500 md:flex">
              <a href="#features" className="transition-colors hover:text-white">Workspace</a>
              <a href="#about" className="transition-colors hover:text-white">Our Brand</a>
              <a href="#status" className="flex items-center gap-2 transition-colors hover:text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Active
              </a>
            </div>
            <div className="flex items-center gap-4">
              <a
                href={import.meta.env["VITE_APP_LOGIN_URL"] || "/login"}
                data-testid="landing-login"
                className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Login
              </a>
              <a
                href={import.meta.env["VITE_APP_URL"] || "/"}
                data-testid="landing-launch"
                className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2 text-xs font-bold text-white transition-all hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(37,99,235,0.3)]"
              >
                Launch Space
              </a>
            </div>
          </div>
        </nav>


        {/* Hero Section */}
        <main className="relative pt-32 pb-20 overflow-hidden">
          <div className="absolute top-0 left-1/2 -z-10 h-[600px] w-full -translate-x-1/2 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent opacity-50 blur-3xl"></div>
          
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col items-center text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-6 inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-400"
              >
                Currently in Development
              </motion.div>
              
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="max-w-4xl bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-7xl"
              >
                Project management for the <span className="text-blue-500">future</span>.
              </motion.h1>
              
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mt-8 max-w-2xl text-lg text-zinc-400"
              >
                Collaberry is a futuristic project workspace where teams handle their projects via a sleek, intuitive Kanban view. I'm building this solo and updating it every single day.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="mt-10 flex flex-wrap justify-center gap-4"
              >
                <a
                  href={import.meta.env["VITE_APP_REGISTER_URL"] || "/register"}
                  data-testid="landing-early-access"
                  className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-4 font-bold text-white shadow-[0_0_20px_rgba(147,51,234,0.3)] transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(147,51,234,0.5)]"
                >
                  Get Early Access
                </a>
                <a
                  href={import.meta.env["VITE_APP_DEMO_URL"] || "/kanbanlab"}
                  data-testid="landing-demo"
                  className="rounded-full border border-white/10 bg-white/5 px-8 py-4 font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/10"
                >
                  View Demo
                </a>
              </motion.div>
            </div>

            {/* Mockup Preview */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="mt-24 relative mx-auto max-w-6xl px-4"
            >
              <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-fuchsia-500/20 opacity-30 blur-2xl"></div>
              
              <div className="relative grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Main Dashboard Preview */}
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  className="md:col-span-8 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 backdrop-blur-3xl shadow-2xl"
                >
                  <div className="flex items-center justify-between border-b border-white/5 bg-zinc-900/80 px-4 py-3">
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-red-500/30"></div>
                      <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/30"></div>
                      <div className="h-2.5 w-2.5 rounded-full bg-green-500/30"></div>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Workspace / Sprint-01</div>
                  </div>
                  <img src={ssKanban} alt="Kanban View" className="w-full h-auto" />
                </motion.div>

                {/* Sidebar Details / AI Bot */}
                <div className="md:col-span-4 flex flex-col gap-6">
                  <motion.div 
                    whileHover={{ scale: 1.05 }}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 backdrop-blur-3xl p-1"
                  >
                    <img src={ssTask} alt="Task Details" className="w-full rounded-xl" />
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    /*
                     * Lands on 0.6, not 1 — the muting is what marks Bob as
                     * unshipped. It has to be the animation's target rather than
                     * an `opacity-60` class: framer-motion writes opacity as an
                     * inline style, and an inline style beats a utility class, so
                     * the class silently loses and the card renders fully opaque.
                     */
                    animate={{ opacity: 0.6, x: 0 }}
                    transition={{ delay: 0.6 }}
                    data-testid="landing-bob-card"
                    role="group"
                    aria-label="Meet Bob, your AI workspace assistant. Coming soon — not yet available."
                    className="flex-1 rounded-2xl border border-purple-500/10 bg-purple-500/5 backdrop-blur-3xl p-6 flex flex-col items-center justify-center text-center relative group grayscale-[0.5]"
                  >
                    <div
                      data-testid="landing-bob-coming-soon"
                      className="mb-2 inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400"
                    >
                      Coming soon
                    </div>
                    <img src={bobBot} alt="Bob Bot" className="h-24 w-24 object-cover rounded-full mb-4 border-2 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.3)]" />
                    <h4 className="text-sm font-bold text-white">Meet Bob</h4>
                    <p className="text-xs text-zinc-400 mt-2">Your AI workspace assistant — coming soon to keep your team on track.</p>
                  </motion.div>
                </div>
              </div>
            </motion.div>

          </div>
        </main>

        {/* Brand Section */}
        <section className="py-32 relative">
          <div className="absolute top-1/2 left-1/2 -z-10 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 bg-blue-600/5 blur-[120px] rounded-full"></div>
          
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="space-y-8"
              >
                <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-zinc-900 border border-white/5 text-zinc-400 text-sm">
                  <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                  Evolutionary Workspace
                </div>
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
                  Crafted by a developer, <br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">for developers.</span>
                </h2>
                <p className="text-lg text-zinc-400 leading-relaxed">
                  Hi, I'm the creator of Collaberry. This is my brand and my logo. I make softwares myself and I'm pouring my heart into this landing page and a fine loading screen. The vision is a modern, futuristic UX/UI with neon black, purple, and blue tones. 
                </p>
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                      <img src={logoIcon} className="h-5 w-5" alt="" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white">Daily Updates</h4>
                      <p className="text-sm text-zinc-500">I'm iterating on the workspace every single day to reach perfection.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 overflow-hidden">
                      <img src={collaberryLogo} className="h-full w-full object-cover" alt="" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white">Modern UX/UI</h4>
                      <p className="text-sm text-zinc-500">Futuristic aesthetics blended with high-performance functionality.</p>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="relative"
              >
                <div className="absolute -inset-1 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-[2.5rem] blur opacity-20"></div>
                <div className="relative rounded-[2.5rem] overflow-hidden border border-white/10 bg-zinc-900/50 p-2">
                  <img src={ssWorkspace} alt="Collaberry Workspace" className="rounded-[2rem] w-full" />
                </div>
              </motion.div>
            </div>
          </div>
        </section>


        {/* Footer */}
        <footer className="border-t border-white/5 py-12">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
              <div className="flex items-center gap-2">
                <img src={collaberryLogo} alt="Logo" className="h-6 w-6" />
                <span className="text-lg font-bold tracking-tighter">COLLABERRY</span>
              </div>
              <p className="text-sm text-zinc-500">© 2026 Collaberry. All rights reserved.</p>
              <div className="flex gap-6">
                <a href="#" className="text-zinc-500 hover:text-white transition-colors">Twitter</a>
                <a href="#" className="text-zinc-500 hover:text-white transition-colors">GitHub</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}