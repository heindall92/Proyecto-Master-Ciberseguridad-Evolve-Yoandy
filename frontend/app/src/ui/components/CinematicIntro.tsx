import React, { useEffect, useRef, useState } from 'react';
import './CinematicIntro.css';

// SVG Path definitions for Alexana font
const ADEF: Record<string, { p: string[], c: { x: number, y: number }[] }> = {
    V:{p:['M5,5 L12,19 L19,5'],           c:[{x:12,y:5}]},
    A:{p:['M12,2 L20,20','M12,2 L8,10'], c:[{x:4,y:20}]},
    L:{p:['M4,2 L4,20','M12,20 L20,20'], c:[{x:8,y:20}]},
    H:{p:['M4,2 L4,22','M4,12 L20,12 L20,22'], c:[{x:20,y:4}]},
    S:{p:['M20,4 L10,4 Q4,4 4,10 Q4,14 12,14 Q20,14 20,18 Q20,22 10,22 L8,22'], c:[{x:4,y:22}]},
    O:{p:['M12,2 A10,10 0 1 1 2,12'],    c:[{x:5,y:5}]},
    C:{p:['M20,6 A10,10 0 0 0 12,2 A10,10 0 0 0 12,22 A10,10 0 0 0 20,18'], c:[{x:20,y:22}]},
    P:{p:['M4,8 L4,22','M8,2 L14,2 A6,6 0 0 1 14,14 L4,14'], c:[{x:4,y:2}]},
    R:{p:['M4,8 L4,22','M8,2 L14,2 A6,6 0 0 1 14,14 L4,14','M10,14 L18,22'], c:[{x:4,y:2}]},
};

const AnimatedLetter = ({ char, sz, clr, reveal, delay = 0 }: { char: string, sz: number, clr: string, reveal: boolean, delay?: number }) => {
    const d = ADEF[char.toUpperCase()];
    if (!d) return null;
    return (
        <svg viewBox="0 0 24 24" style={{ height: sz, width: sz, flexShrink: 0, overflow: 'visible' }} className={reveal ? 'c-al-reveal' : ''}>
            {d.p.map((pd, i) => (
                <path key={`p-${i}`} d={pd} stroke={clr} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" pathLength="100" className="c-al-path" style={{ transitionDelay: `${delay}ms` }} />
            ))}
            {d.c.map((ci, i) => (
                <circle key={`c-${i}`} cx={ci.x} cy={ci.y} r="1.5" fill={clr} stroke="none" className="c-al-circle" style={{ transitionDelay: `${delay + 1000}ms`, transformOrigin: `${ci.x}px ${ci.y}px` }} />
            ))}
        </svg>
    );
};

const AnimatedWord = ({ word, sz, clr, dots, reveal }: { word: string, sz: number, clr: string, dots: boolean, reveal: boolean }) => {
    const chars = word.split('');
    return (
        <div className="c-al-row">
            {chars.map((ch, i) => {
                if (ch === ' ') return <div key={i} style={{ width: sz * 0.55 }} />;
                return (
                    <React.Fragment key={i}>
                        <AnimatedLetter char={ch} sz={sz} clr={clr} reveal={reveal} delay={i * 120} />
                        {dots && i < chars.length - 1 && chars[i+1] !== ' ' && (
                            <span className="c-al-sep" style={{ fontSize: sz * 0.35, fontFamily: 'serif', opacity: reveal ? 1 : 0, transitionDelay: `${i * 120 + 800}ms` }}>·</span>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

const BOOT = [
    {t:'VALHALLA_OS v4.9.5 // BOOT SEQUENCE',c:''},
    {t:'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',c:'c-b-dim'},
    {t:'> KERNEL_MODULES ........... [OK]',c:'c-b-ok'},
    {t:'> WAZUH_AGENT 4.9.5 ........ [ACTIVE]',c:'c-b-ok'},
    {t:'> THREAT_INTEL ENGINE ...... [LOADED]',c:'c-b-ok'},
    {t:'> HONEYPOT_LAYER SSH/TEL ... [ARMED]',c:'c-b-ok'},
    {t:'> BLUE_TEAM PROTOCOLS ...... [ACTIVE]',c:'c-b-ok'},
    {t:'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',c:'c-b-dim'},
    {t:'OPERADOR : ADMIN_COMMANDER',c:'c-b-w'},
    {t:'ACCESO AUTORIZADO // NIVEL 5',c:'c-b-ok'},
];

interface Props {
  onComplete: () => void;
}

export default function CinematicIntro({ onComplete }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const grainRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // States for animation sequencing
    const [fadeState, setFadeState] = useState(1); // fd opacity
    const [bootState, setBootState] = useState(0); // 0=hidden, 1=typing, 2=hide
    const [bootLines, setBootLines] = useState<number>(-1);
    const [titleState, setTitleState] = useState(0); // 0=hidden, 1=show
    const [valReveal, setValReveal] = useState(-1);
    const [socReveal, setSocReveal] = useState(-1);
    const [tagOpacity, setTagOpacity] = useState(0);
    const [flareOpacity, setFlareOpacity] = useState(0);
    const [flashOpacity, setFlashOpacity] = useState(0);
    const [chromaFilter, setChromaFilter] = useState(false);
    const [windowSize, setWindowSize] = useState({ w: 1000, h: 800 });
    const [barHeight, setBarHeight] = useState(0);
    
    useEffect(() => {
        const handleResize = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            setWindowSize({ w, h });
            const ch = Math.min(w / 2.35, h);
            setBarHeight(Math.max(0, (h - ch) / 2));
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Grain Setup
    useEffect(() => {
        if (grainRef.current) {
            const gc = document.createElement('canvas');
            gc.width = gc.height = 256;
            const gx = gc.getContext('2d');
            if (gx) {
                const img = gx.createImageData(256, 256);
                for (let i = 0; i < img.data.length; i += 4) {
                    const v = Math.floor(Math.random() * 255);
                    img.data[i] = img.data[i+1] = img.data[i+2] = v;
                    img.data[i+3] = 255;
                }
                gx.putImageData(img, 0, 0);
                grainRef.current.style.backgroundImage = `url(${gc.toDataURL()})`;
                grainRef.current.style.backgroundSize = '256px 256px';
            }
        }
    }, []);

    // Canvas Rain
    useEffect(() => {
        const cv = canvasRef.current;
        if (!cv) return;
        const cx = cv.getContext('2d');
        if (!cx) return;
        
        const dpr = window.devicePixelRatio || 1;
        const W = windowSize.w;
        const H = windowSize.h;
        cv.width = W * dpr;
        cv.height = H * dpr;
        cx.scale(dpr, dpr);
        
        const GLYPHS = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ0123456789ABCDEF⌬∆';
        const cols = Math.floor(W / 18);
        const streams: any[] = [];
        for (let i = 0; i < cols; i++) {
            streams.push({
                x: i * 18 + 9, y: Math.random() * H,
                spd: .35 + Math.random() * 1.4,
                len: 6 + Math.floor(Math.random() * 22),
                lum: .2 + Math.random() * .75,
                g: Array.from({length: 28}, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]),
                mt: 0
            });
        }
        
        let raf: number;
        let rAlpha = 0;
        let igniting = false;

        const draw = () => {
            cx.fillStyle = `rgba(3,14,9,${rAlpha > .8 ? .84 : 1})`;
            cx.fillRect(0, 0, W, H);
            if (rAlpha > .01) {
                cx.font = '12px monospace';
                for (let si = 0; si < streams.length; si++) {
                    const s = streams[si];
                    s.y += s.spd; s.mt++;
                    if (s.mt > 9) {
                        s.mt = 0;
                        s.g[Math.floor(Math.random() * s.g.length)] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
                    }
                    if (s.y - s.len * 14 > H) s.y = -s.len * 14;
                    for (let i = 0; i < s.len; i++) {
                        const gy = s.y - i * 14;
                        if (gy < 0 || gy > H) continue;
                        const t = i / Math.max(s.len - 1, 1);
                        const a = (i === 0 ? .9 : (1 - t) * .72) * s.lum * rAlpha;
                        if (i === 0) cx.fillStyle = `rgba(175,255,215,${a})`;
                        else cx.fillStyle = `rgba(0,${Math.floor(195 * (1 - t) + 40)},${Math.floor(125 * (1 - t) + 25)},${a})`;
                        cx.fillText(s.g[i % s.g.length], s.x, gy);
                    }
                }
            }
            if (igniting) {
                rAlpha = Math.min(1, rAlpha + 0.014);
            }
            raf = requestAnimationFrame(draw);
        };
        draw();

        const triggerIgnite = () => { igniting = true; };
        document.addEventListener('cinematic-ignite', triggerIgnite);
        
        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener('cinematic-ignite', triggerIgnite);
        };
    }, [windowSize]);

    // Sequence orchestrator
    useEffect(() => {
        let mounted = true;
        const tids: NodeJS.Timeout[] = [];
        const at = (ms: number, fn: () => void) => {
            tids.push(setTimeout(() => { if (mounted) fn(); }, ms));
        };

        const doFlash = (v: number, d: number) => {
            setFlashOpacity(v);
            setTimeout(() => { if (mounted) setFlashOpacity(0); }, d);
        };

        // 0.0s — open from black
        at(0, () => setFadeState(0));
        
        // 0.5s — rune rain ignites
        at(500, () => {
            document.dispatchEvent(new Event('cinematic-ignite'));
        });

        // 0.7s — boot sequence
        at(700, () => {
            setBootState(1);
            BOOT.forEach((_, i) => {
                at(i * 145, () => setBootLines(i));
            });
        });
        at(2200, () => {
            setBootState(2);
            doFlash(0.04, 50);
        });

        // 2.7s — TITLE: VALHALLA draws on
        at(2700, () => setTitleState(1));
        at(2900, () => {
            setValReveal(1);
            doFlash(0.03, 70); // One slightly longer subtle flash for impact
        });

        // 4.8s — SOC PRO
        at(4800, () => {
            setSocReveal(1);
        });
        at(5200, () => setTagOpacity(1));

        // 5.6s — Lens flare + chroma
        at(7000, () => {
            setFlareOpacity(1);
            setTimeout(() => { if (mounted) setFlareOpacity(0); }, 350);
        });
        at(7300, () => setChromaFilter(true));

        // 6.0s — FLASH CUT → END
        at(8500, () => {
            doFlash(1, 400); // stronger flash to cover transition
            setTitleState(0);
            setTimeout(() => {
                if (mounted) onComplete();
            }, 200); // notify parent exactly when flash peaks
        });

        return () => {
            mounted = false;
            tids.forEach(clearTimeout);
        };
    }, [onComplete]);

    const bigSz = Math.floor(windowSize.w * .062);
    const midSz = Math.floor(windowSize.w * .034);

    return (
        <div className="cinematic-stage" ref={containerRef}>
            <canvas ref={canvasRef} className="cinematic-fx" style={{ opacity: fadeState === 0 ? 1 : 0 }} />
            <div className="cinematic-vig" />
            <div className="cinematic-scl" />
            <div ref={grainRef} className="cinematic-grain" />
            <div className="cinematic-bar cinematic-bar-top" style={{ height: barHeight }} />
            <div className="cinematic-bar cinematic-bar-bottom" style={{ height: barHeight }} />

            <div id="c-boot" className="cinematic-act" style={{ opacity: bootState === 1 ? 1 : 0, transition: bootState === 2 ? 'opacity .45s ease' : 'opacity .4s ease' }}>
                <div id="c-boot-cur" style={{ opacity: bootState > 0 ? 1 : 0 }} />
                <div id="c-boot-txt">
                    {BOOT.map((line, i) => (
                        i <= bootLines && (
                            <div key={i} className={`c-bl ${line.c}`}>{line.t}</div>
                        )
                    ))}
                </div>
            </div>

            <div id="c-title" className={`cinematic-act ${chromaFilter ? 'c-chroma' : ''}`} style={{ opacity: titleState === 1 ? 1 : 0, transition: 'opacity 1s cubic-bezier(0.16, 1, 0.3, 1)', filter: 'drop-shadow(0 0 16px rgba(0,255,136,0.25))' }}>
                <AnimatedWord word="VALHALLA" sz={bigSz} clr="#ffffff" dots={true} reveal={valReveal > 0} />
                <div style={{ gap: 10, marginTop: 4 }}>
                    <AnimatedWord word="SOC PRO" sz={midSz} clr="#00e878" dots={false} reveal={socReveal > 0} />
                </div>
                <div id="c-tag" style={{ opacity: tagOpacity }}>PLATAFORMA DE MONITORIZACIÓN Y RESPUESTA TÁCTICA CON IA</div>
            </div>

            <div id="c-lf" style={{ opacity: flareOpacity, transition: flareOpacity ? 'opacity .35s ease' : 'opacity .9s ease' }} />
            <div id="c-fl" style={{ opacity: flashOpacity, transition: flashOpacity ? 'none' : 'opacity .38s ease' }} />
            <div id="c-fd" style={{ opacity: fadeState }} />
            
            <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
                <defs>
                    <filter id="chroma-filter">
                        <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0.02  0 1 0 0 0  0 0 1 0 -0.02  0 0 0 1 0" result="rg"/>
                        <feOffset in="SourceGraphic" dx="-4" result="bs"/>
                        <feColorMatrix in="bs" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bo"/>
                        <feBlend in="rg" in2="bo" mode="screen"/>
                    </filter>
                </defs>
            </svg>
        </div>
    );
}
